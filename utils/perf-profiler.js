const PERF_MODE_KEY = '__perf_mode__';
const FIRST_SCREEN_TIMEOUT_MS = 8000;
const DEFAULT_EXCLUDED_ROUTES = [
  'pages/test-diagnosis/index',
  'pages/debug-stats/index'
];
const CRITICAL_RENDER_KEYS = [
  'post',
  'posts',
  'messages',
  'noticeItems',
  'comments',
  'markers',
  'list',
  'items',
  'data'
];
const WRAP_MARK = '__perfWrapped__';
const RAW_SAMPLE_LIMIT = 20000;
const DEFAULT_MAX_ROUTES = 400;

let activeProfiler = null;

class PerfProfiler {
  constructor(options = {}) {
    this.excludeRoutes = new Set(options.excludeRoutes || DEFAULT_EXCLUDED_ROUTES);
    this.rawSampleLimit = toPositiveInt(options.rawSampleLimit, RAW_SAMPLE_LIMIT);
    this.maxRoutes = toPositiveInt(options.maxRoutes, DEFAULT_MAX_ROUTES);
    this.enabled = false;
    this.initialized = false;
    this.currentVisitSeq = 0;
    this.pageStates = new Map();
    this.activeVisitByRoute = {};
    this.session = null;
    this.originalPage = null;
    this.originalCloudCallFunction = null;
    this.originalCloudDatabase = null;
    this.pagePatched = false;
    this.cloudPatched = false;
    this.databasePatched = false;
  }

  init() {
    if (this.initialized) {
      return this.enabled;
    }
    this.enabled = this.readPerfMode();
    this.installPageHook();
    this.patchCloudCallFunction();
    this.patchCloudDatabase();
    this.initialized = true;
    return this.enabled;
  }

  installPageHook() {
    if (this.pagePatched || typeof Page !== 'function') {
      return;
    }

    this.originalPage = Page;
    const profiler = this;
    Page = function patchedPage(pageOptions) {
      const source = pageOptions || {};
      const wrapped = Object.assign({}, source);

      wrapped.onLoad = wrapLifecycle(source.onLoad, function onLoadWrapped() {
        profiler.bindSetData(this);
        profiler.handlePageLoad(this);
      });

      wrapped.onShow = wrapLifecycle(source.onShow, function onShowWrapped() {
        profiler.bindSetData(this);
      });

      wrapped.onReady = wrapLifecycle(source.onReady, function onReadyWrapped() {
        profiler.handlePageReady(this);
      });

      wrapped.onHide = wrapLifecycle(source.onHide, function onHideWrapped() {
        profiler.handlePageHidden(this);
      });

      wrapped.onUnload = wrapLifecycle(source.onUnload, function onUnloadWrapped() {
        profiler.handlePageHidden(this);
      });

      return profiler.originalPage(wrapped);
    };

    this.pagePatched = true;
  }

  patchCloudCallFunction() {
    if (this.cloudPatched) return;
    if (!wx || !wx.cloud || typeof wx.cloud.callFunction !== 'function') return;

    const profiler = this;
    this.originalCloudCallFunction = wx.cloud.callFunction.bind(wx.cloud);
    wx.cloud.callFunction = function patchedCallFunction(options = {}) {
      const startAt = Date.now();
      const route = profiler.resolveCurrentRoute();
      const visitId = profiler.resolveActiveVisitId(route);
      const functionName = toSafeText(options && options.name, 80) || 'unknown';
      const requestBytes = estimateJsonBytes((options && options.data) || {});
      const canRecord = profiler.canRecord(route);

      return profiler.originalCloudCallFunction(options).then((res) => {
        if (canRecord) {
          profiler.recordCloudCall({
            route,
            visitId,
            functionName,
            requestBytes,
            responseBytes: estimateJsonBytes((res && res.result) || {}),
            durationMs: Date.now() - startAt,
            status: 'success'
          });
        }
        return res;
      }).catch((err) => {
        if (canRecord) {
          profiler.recordCloudCall({
            route,
            visitId,
            functionName,
            requestBytes,
            responseBytes: 0,
            durationMs: Date.now() - startAt,
            status: 'error'
          });
        }
        throw err;
      });
    };

    this.cloudPatched = true;
  }

  patchCloudDatabase() {
    if (this.databasePatched) return;
    if (!wx || !wx.cloud || typeof wx.cloud.database !== 'function') return;

    const profiler = this;
    this.originalCloudDatabase = wx.cloud.database.bind(wx.cloud);
    wx.cloud.database = function patchedDatabase(...args) {
      const db = profiler.originalCloudDatabase(...args);
      return profiler.wrapDatabase(db);
    };

    this.databasePatched = true;
  }

  wrapDatabase(db) {
    if (!db || typeof db !== 'object') return db;
    if (db[WRAP_MARK] || typeof db.collection !== 'function') return db;

    const profiler = this;
    const originalCollection = db.collection.bind(db);
    db.collection = function wrappedCollection(name) {
      return profiler.wrapCollection(originalCollection(name), name);
    };

    markWrapped(db);
    return db;
  }

  wrapCollection(collectionRef, collectionName) {
    if (!collectionRef || typeof collectionRef !== 'object') return collectionRef;
    if (collectionRef[WRAP_MARK]) return collectionRef;

    const profiler = this;
    const safeCollection = toSafeText(collectionName, 64) || 'unknown';
    const readMeta = (op, args) => ({
      op,
      type: 'read',
      collection: safeCollection,
      requestBytes: estimateJsonBytes(args && args[0])
    });
    const writeMeta = (op, args) => ({
      op,
      type: 'write',
      collection: safeCollection,
      requestBytes: estimateJsonBytes(args && args[0])
    });

    wrapTrackedMethod(collectionRef, 'get', (args) => readMeta('get', args), (result) => ({
      responseBytes: estimateJsonBytes(result && result.data ? result.data : result)
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(collectionRef, 'count', (args) => readMeta('count', args), (result) => ({
      responseBytes: estimateJsonBytes(result || {})
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(collectionRef, 'add', (args) => writeMeta('add', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(collectionRef, 'update', (args) => writeMeta('update', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(collectionRef, 'remove', (args) => writeMeta('remove', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    this.wrapDocMethod(collectionRef, safeCollection);
    this.wrapChainableQueryMethods(collectionRef, safeCollection);
    this.wrapAggregateMethod(collectionRef, safeCollection);

    markWrapped(collectionRef);
    return collectionRef;
  }

  wrapDocMethod(collectionRef, collectionName) {
    if (typeof collectionRef.doc !== 'function') return;

    const profiler = this;
    const originalDoc = collectionRef.doc.bind(collectionRef);
    collectionRef.doc = function wrappedDoc(docId) {
      const docRef = originalDoc(docId);
      return profiler.wrapDocRef(docRef, collectionName, docId);
    };
  }

  wrapDocRef(docRef, collectionName, docId) {
    if (!docRef || typeof docRef !== 'object') return docRef;
    if (docRef[WRAP_MARK]) return docRef;

    const profiler = this;
    const docIdText = toSafeText(docId, 80);
    const buildMeta = (op, type, args) => ({
      op,
      type,
      collection: collectionName,
      docId: docIdText,
      requestBytes: estimateJsonBytes(args && args[0])
    });

    wrapTrackedMethod(docRef, 'get', (args) => buildMeta('get', 'read', args), (result) => ({
      responseBytes: estimateJsonBytes(result && result.data ? result.data : result)
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(docRef, 'update', (args) => buildMeta('update', 'write', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(docRef, 'set', (args) => buildMeta('set', 'write', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(docRef, 'remove', (args) => buildMeta('remove', 'write', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    markWrapped(docRef);
    return docRef;
  }

  wrapChainableQueryMethods(target, collectionName) {
    if (!target || typeof target !== 'object') return;
    const profiler = this;
    const methods = ['where', 'field', 'orderBy', 'skip', 'limit'];
    methods.forEach((methodName) => {
      if (typeof target[methodName] !== 'function') return;
      const original = target[methodName].bind(target);
      target[methodName] = function wrappedQueryMethod(...args) {
        const next = original(...args);
        profiler.wrapQueryRef(next, collectionName);
        return next;
      };
    });
  }

  wrapQueryRef(queryRef, collectionName) {
    if (!queryRef || typeof queryRef !== 'object') return queryRef;
    if (queryRef[WRAP_MARK]) return queryRef;

    const profiler = this;
    const buildMeta = (op, type, args) => ({
      op,
      type,
      collection: collectionName,
      requestBytes: estimateJsonBytes(args && args[0])
    });

    wrapTrackedMethod(queryRef, 'get', (args) => buildMeta('get', 'read', args), (result) => ({
      responseBytes: estimateJsonBytes(result && result.data ? result.data : result)
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(queryRef, 'count', (args) => buildMeta('count', 'read', args), (result) => ({
      responseBytes: estimateJsonBytes(result || {})
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(queryRef, 'update', (args) => buildMeta('update', 'write', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    wrapTrackedMethod(queryRef, 'remove', (args) => buildMeta('remove', 'write', args), () => ({
      responseBytes: 0
    }), (event) => profiler.recordDbCall(event));

    this.wrapChainableQueryMethods(queryRef, collectionName);
    this.wrapAggregateMethod(queryRef, collectionName);
    markWrapped(queryRef);
    return queryRef;
  }

  wrapAggregateMethod(target, collectionName) {
    if (!target || typeof target !== 'object') return;
    if (typeof target.aggregate !== 'function') return;

    const profiler = this;
    const originalAggregate = target.aggregate.bind(target);
    target.aggregate = function wrappedAggregate(...args) {
      const aggregateRef = originalAggregate(...args);
      if (!aggregateRef || typeof aggregateRef !== 'object') {
        return aggregateRef;
      }
      wrapTrackedMethod(aggregateRef, 'end', (endArgs) => ({
        op: 'aggregate.end',
        type: 'read',
        collection: collectionName,
        requestBytes: estimateJsonBytes(endArgs && endArgs[0])
      }), (result) => ({
        responseBytes: estimateJsonBytes(result || {})
      }), (event) => profiler.recordDbCall(event));
      return aggregateRef;
    };
  }
  bindSetData(page) {
    if (!page || typeof page.setData !== 'function') return;
    if (page.__perfSetDataWrapped) return;

    const profiler = this;
    const originalSetData = page.setData.bind(page);
    page.setData = function wrappedSetData(data, callback) {
      const route = page.route || profiler.resolveCurrentRoute();
      const state = profiler.pageStates.get(page) || {};
      const visitId = state.visitId || profiler.resolveActiveVisitId(route);
      if (profiler.canRecord(route)) {
        profiler.recordSetData({
          route,
          visitId,
          bytes: estimateJsonBytes(data || {}),
          keys: Object.keys(data || {})
        });
        profiler.tryMarkFirstScreenFromSetData(page, route, visitId, data);
      }
      return originalSetData(data, callback);
    };

    page.__perfSetDataWrapped = true;
  }

  handlePageLoad(page) {
    if (!this.enabled || !this.session || !page) return;
    const route = page.route || this.resolveCurrentRoute();
    if (!this.canRecord(route)) return;
    if (!this.ensureRouteAllowed(route)) return;

    const visitId = this.createVisit(route);
    const state = {
      route,
      visitId,
      firstScreenTimer: setTimeout(() => {
        this.markFirstScreen(visitId, true, 'timeout');
      }, FIRST_SCREEN_TIMEOUT_MS)
    };
    this.pageStates.set(page, state);
    this.activeVisitByRoute[route] = visitId;
  }

  handlePageReady(page) {
    if (!page) return;
    const state = this.pageStates.get(page);
    if (!state || !state.visitId) return;
    this.markFirstScreen(state.visitId, false, 'onReady');
  }

  handlePageHidden(page) {
    if (!page) return;
    const state = this.pageStates.get(page);
    if (!state || !state.visitId) return;

    this.clearFirstScreenTimer(state);
    this.finishVisit(state.visitId);
    if (state.route && this.activeVisitByRoute[state.route] === state.visitId) {
      delete this.activeVisitByRoute[state.route];
    }
    this.pageStates.delete(page);
  }

  tryMarkFirstScreenFromSetData(page, route, visitId, patchData) {
    if (!visitId || !patchData || typeof patchData !== 'object') return;
    if (!this.canRecord(route)) return;
    if (isFirstScreenPatch(patchData)) {
      this.markFirstScreen(visitId, false, 'setData');
    }
  }

  canRecord(route) {
    if (!this.enabled || !this.session) return false;
    if (!route || typeof route !== 'string') return false;
    if (this.excludeRoutes.has(route)) return false;
    return true;
  }

  ensureRouteAllowed(route) {
    if (!this.session || !route) return false;
    if (this.session.routeMetrics[route]) return true;
    if (this.session.routesOrder.length < this.maxRoutes) return true;
    this.markBlockedRoute(route, 'route_limit_exceeded');
    return false;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    try {
      wx.setStorageSync(PERF_MODE_KEY, this.enabled);
    } catch (err) {
      console.warn('[perf-profiler] set perf mode failed:', err && err.message ? err.message : err);
    }
    return this.enabled;
  }

  readPerfMode() {
    try {
      return !!wx.getStorageSync(PERF_MODE_KEY);
    } catch (err) {
      return false;
    }
  }

  startSession(meta = {}) {
    const runId = toSafeText(meta.runId, 64) || buildRunId();
    this.currentVisitSeq = 0;
    this.activeVisitByRoute = {};
    this.clearPageStateTimers();

    this.session = {
      runId,
      appVersion: toSafeText(meta.appVersion, 32) || '',
      networkType: toSafeText(meta.networkType, 20) || 'unknown',
      device: sanitizeDevice(meta.device || {}),
      startAt: meta.startAt || Date.now(),
      endAt: null,
      rawSamples: [],
      routeMetrics: {},
      routesOrder: [],
      visits: {},
      blockedRoutes: [],
      droppedRawSampleCount: 0
    };
    return this.getSnapshot();
  }

  stopSession() {
    if (!this.session) return null;
    this.finalizeActiveVisits();
    if (!this.session.endAt) {
      this.session.endAt = Date.now();
    }
    return this.getSnapshot();
  }

  clearSession() {
    this.clearPageStateTimers();
    this.activeVisitByRoute = {};
    this.currentVisitSeq = 0;
    this.session = null;
  }

  getSnapshot() {
    if (!this.session) return null;
    return {
      runId: this.session.runId,
      appVersion: this.session.appVersion,
      networkType: this.session.networkType,
      device: this.session.device,
      startAt: this.session.startAt,
      endAt: this.session.endAt,
      rawSamples: this.session.rawSamples.slice(),
      blockedRoutes: this.session.blockedRoutes.slice(),
      droppedRawSampleCount: this.session.droppedRawSampleCount || 0,
      routeSummaries: this.buildRouteSummaries()
    };
  }

  exportReport() {
    const snapshot = this.getSnapshot();
    if (!snapshot) return null;
    return JSON.parse(JSON.stringify(snapshot));
  }

  resolveCurrentRoute() {
    try {
      const pages = getCurrentPages();
      if (!pages || pages.length === 0) return '';
      const current = pages[pages.length - 1];
      return (current && current.route) || '';
    } catch (err) {
      return '';
    }
  }

  resolveActiveVisitId(route) {
    if (!route) return '';
    return this.activeVisitByRoute[route] || '';
  }
  createVisit(route) {
    this.currentVisitSeq += 1;
    const visitId = `${route}#${this.currentVisitSeq}`;
    const now = Date.now();
    this.session.visits[visitId] = {
      visitId,
      route,
      startAt: now,
      endAt: null,
      firstScreenMs: null,
      timedOut: false,
      firstScreenBy: '',
      requests: {
        cloudCalls: 0,
        dbReads: 0,
        dbWrites: 0,
        total: 0
      },
      payload: {
        requestBytes: 0,
        responseBytes: 0,
        totalBytes: 0
      },
      setData: {
        count: 0,
        bytes: 0
      }
    };

    this.ensureRouteMetric(route);
    this.pushRawSample({
      type: 'pageLoad',
      route,
      visitId,
      at: now
    });
    return visitId;
  }

  finishVisit(visitId) {
    if (!this.session || !visitId) return;
    const visit = this.session.visits[visitId];
    if (!visit || visit.endAt) return;
    visit.endAt = Date.now();
  }

  finalizeActiveVisits() {
    if (!this.session) return;
    Object.keys(this.session.visits).forEach((visitId) => {
      const visit = this.session.visits[visitId];
      if (!visit) return;
      if (visit.firstScreenMs == null) {
        this.markFirstScreen(visitId, true, 'sessionStop');
      }
      if (!visit.endAt) {
        visit.endAt = Date.now();
      }
    });
    this.clearPageStateTimers();
  }

  clearPageStateTimers() {
    if (!this.pageStates || typeof this.pageStates.forEach !== 'function') {
      this.pageStates = new Map();
      return;
    }
    this.pageStates.forEach((state) => {
      this.clearFirstScreenTimer(state);
    });
    this.pageStates.clear();
  }

  clearFirstScreenTimer(state) {
    if (!state || !state.firstScreenTimer) return;
    clearTimeout(state.firstScreenTimer);
    state.firstScreenTimer = null;
  }

  markFirstScreen(visitId, timedOut, source) {
    if (!this.session || !visitId) return;
    const visit = this.session.visits[visitId];
    if (!visit || visit.firstScreenMs != null) return;

    if (this.pageStates && typeof this.pageStates.forEach === 'function') {
      this.pageStates.forEach((state) => {
        if (state && state.visitId === visitId) {
          this.clearFirstScreenTimer(state);
        }
      });
    }

    const durationMs = Math.max(0, Date.now() - visit.startAt);
    visit.firstScreenMs = timedOut ? Math.max(durationMs, FIRST_SCREEN_TIMEOUT_MS) : durationMs;
    visit.timedOut = !!timedOut;
    visit.firstScreenBy = source || '';

    const metric = this.ensureRouteMetric(visit.route);
    if (metric) {
      metric.firstScreenSamples.push(visit.firstScreenMs);
      if (visit.timedOut) {
        metric.firstScreenTimeouts += 1;
      }
    }

    this.pushRawSample({
      type: 'firstScreen',
      route: visit.route,
      visitId,
      durationMs: visit.firstScreenMs,
      timedOut: visit.timedOut,
      source: visit.firstScreenBy,
      at: Date.now()
    });
  }

  recordCloudCall(detail) {
    if (!this.session || !detail || !detail.route) return;
    const metric = this.ensureRouteMetric(detail.route);
    if (!metric) return;

    const requestBytes = toPositiveNumber(detail.requestBytes);
    const responseBytes = toPositiveNumber(detail.responseBytes);
    metric.requests.cloudCalls += 1;
    metric.requests.total += 1;
    metric.payload.requestBytes += requestBytes;
    metric.payload.responseBytes += responseBytes;
    metric.payload.totalBytes = metric.payload.requestBytes + metric.payload.responseBytes;

    this.applyToVisit(detail.visitId, (visit) => {
      visit.requests.cloudCalls += 1;
      visit.requests.total += 1;
      visit.payload.requestBytes += requestBytes;
      visit.payload.responseBytes += responseBytes;
      visit.payload.totalBytes = visit.payload.requestBytes + visit.payload.responseBytes;
    });

    this.pushRawSample({
      type: 'cloudCall',
      route: detail.route,
      visitId: detail.visitId || '',
      functionName: toSafeText(detail.functionName, 80) || 'unknown',
      durationMs: toPositiveNumber(detail.durationMs),
      requestBytes,
      responseBytes,
      status: toSafeText(detail.status, 20) || 'unknown',
      at: Date.now()
    });
  }

  recordDbCall(detail) {
    if (!this.session || !detail) return;
    const route = detail.route || this.resolveCurrentRoute();
    if (!this.canRecord(route)) return;
    if (!this.ensureRouteAllowed(route)) return;

    const visitId = detail.visitId || this.resolveActiveVisitId(route);
    const metric = this.ensureRouteMetric(route);
    if (!metric) return;

    const requestBytes = toPositiveNumber(detail.requestBytes);
    const responseBytes = toPositiveNumber(detail.responseBytes);
    const type = detail.type === 'write' ? 'write' : 'read';
    if (type === 'write') {
      metric.requests.dbWrites += 1;
    } else {
      metric.requests.dbReads += 1;
    }
    metric.requests.total += 1;
    metric.payload.requestBytes += requestBytes;
    metric.payload.responseBytes += responseBytes;
    metric.payload.totalBytes = metric.payload.requestBytes + metric.payload.responseBytes;

    this.applyToVisit(visitId, (visit) => {
      if (type === 'write') {
        visit.requests.dbWrites += 1;
      } else {
        visit.requests.dbReads += 1;
      }
      visit.requests.total += 1;
      visit.payload.requestBytes += requestBytes;
      visit.payload.responseBytes += responseBytes;
      visit.payload.totalBytes = visit.payload.requestBytes + visit.payload.responseBytes;
    });

    this.pushRawSample({
      type: 'dbCall',
      route,
      visitId: visitId || '',
      collection: toSafeText(detail.collection, 64) || 'unknown',
      op: toSafeText(detail.op, 40) || 'unknown',
      opType: type,
      durationMs: toPositiveNumber(detail.durationMs),
      requestBytes,
      responseBytes,
      status: toSafeText(detail.status, 20) || 'unknown',
      at: Date.now()
    });
  }

  recordSetData(detail) {
    if (!this.session || !detail || !detail.route) return;
    const metric = this.ensureRouteMetric(detail.route);
    if (!metric) return;

    const bytes = toPositiveNumber(detail.bytes);
    metric.setData.count += 1;
    metric.setData.bytes += bytes;

    this.applyToVisit(detail.visitId, (visit) => {
      visit.setData.count += 1;
      visit.setData.bytes += bytes;
    });

    this.pushRawSample({
      type: 'setData',
      route: detail.route,
      visitId: detail.visitId || '',
      bytes,
      keyCount: Array.isArray(detail.keys) ? detail.keys.length : 0,
      keys: Array.isArray(detail.keys) ? detail.keys.slice(0, 20) : [],
      at: Date.now()
    });
  }

  ensureRouteMetric(route) {
    if (!this.session || !route) return null;
    if (this.session.routeMetrics[route]) {
      return this.session.routeMetrics[route];
    }
    if (!this.ensureRouteAllowed(route)) {
      return null;
    }

    this.session.routeMetrics[route] = {
      route,
      requests: {
        cloudCalls: 0,
        dbReads: 0,
        dbWrites: 0,
        total: 0
      },
      payload: {
        requestBytes: 0,
        responseBytes: 0,
        totalBytes: 0
      },
      setData: {
        count: 0,
        bytes: 0
      },
      firstScreenSamples: [],
      firstScreenTimeouts: 0
    };
    this.session.routesOrder.push(route);
    return this.session.routeMetrics[route];
  }

  applyToVisit(visitId, updater) {
    if (!this.session || !visitId || typeof updater !== 'function') return;
    const visit = this.session.visits[visitId];
    if (!visit) return;
    updater(visit);
  }

  pushRawSample(sample) {
    if (!this.session || !sample) return;
    if (this.session.rawSamples.length >= this.rawSampleLimit) {
      this.session.rawSamples.shift();
      this.session.droppedRawSampleCount += 1;
    }
    this.session.rawSamples.push(Object.assign({ ts: Date.now() }, sample));
  }

  markBlockedRoute(route, reason) {
    if (!this.session || !route) return;
    const exists = this.session.blockedRoutes.some((item) => item.route === route);
    if (exists) return;
    this.session.blockedRoutes.push({
      route,
      reason: reason || 'unknown',
      at: Date.now()
    });
  }

  buildRouteSummaries() {
    if (!this.session) return [];
    const summaries = [];

    this.session.routesOrder.forEach((route) => {
      const metric = this.session.routeMetrics[route];
      if (!metric) return;
      const visits = this.collectVisitsByRoute(route);
      const requestSamples = visits.map((item) => item.requests.total);
      const payloadSamples = visits.map((item) => item.payload.totalBytes);
      const setDataCountSamples = visits.map((item) => item.setData.count);
      const setDataByteSamples = visits.map((item) => item.setData.bytes);
      const firstScreenSamples = metric.firstScreenSamples.slice();

      summaries.push({
        route,
        sampleCount: visits.length,
        firstScreen: {
          count: firstScreenSamples.length,
          p50: percentile(firstScreenSamples, 50),
          p95: percentile(firstScreenSamples, 95),
          max: maxOf(firstScreenSamples),
          timeouts: metric.firstScreenTimeouts,
          samples: firstScreenSamples
        },
        requests: {
          cloudCalls: metric.requests.cloudCalls,
          dbReads: metric.requests.dbReads,
          dbWrites: metric.requests.dbWrites,
          total: metric.requests.total,
          p50: percentile(requestSamples, 50),
          p95: percentile(requestSamples, 95),
          max: maxOf(requestSamples),
          samples: requestSamples
        },
        payload: {
          requestBytes: metric.payload.requestBytes,
          responseBytes: metric.payload.responseBytes,
          totalBytes: metric.payload.totalBytes,
          p50: percentile(payloadSamples, 50),
          p95: percentile(payloadSamples, 95),
          max: maxOf(payloadSamples),
          samples: payloadSamples
        },
        setData: {
          count: metric.setData.count,
          bytes: metric.setData.bytes,
          countP50: percentile(setDataCountSamples, 50),
          countP95: percentile(setDataCountSamples, 95),
          countMax: maxOf(setDataCountSamples),
          bytesP50: percentile(setDataByteSamples, 50),
          bytesP95: percentile(setDataByteSamples, 95),
          bytesMax: maxOf(setDataByteSamples),
          countSamples: setDataCountSamples,
          byteSamples: setDataByteSamples
        }
      });
    });

    return summaries;
  }

  collectVisitsByRoute(route) {
    if (!this.session || !route) return [];
    const results = [];
    Object.keys(this.session.visits).forEach((visitId) => {
      const visit = this.session.visits[visitId];
      if (!visit || visit.route !== route) return;
      results.push(visit);
    });
    results.sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
    return results;
  }
}

function wrapLifecycle(originalFn, beforeFn) {
  return function wrappedLifecycle(...args) {
    if (typeof beforeFn === 'function') {
      beforeFn.call(this, args);
    }
    if (typeof originalFn === 'function') {
      return originalFn.apply(this, args);
    }
    return undefined;
  };
}

function wrapTrackedMethod(target, methodName, buildMeta, buildResultMeta, reporter) {
  if (!target || typeof target[methodName] !== 'function') return;
  if (target[methodName].__perfTracked) return;

  const original = target[methodName];
  target[methodName] = function trackedMethod(...args) {
    const profiler = activeProfiler;
    const route = profiler ? profiler.resolveCurrentRoute() : '';
    const visitId = profiler ? profiler.resolveActiveVisitId(route) : '';
    const canRecord = profiler ? profiler.canRecord(route) : false;
    const startAt = Date.now();
    const baseMeta = typeof buildMeta === 'function' ? (buildMeta(args) || {}) : {};
    const meta = Object.assign({}, baseMeta, { route, visitId });

    try {
      const result = original.apply(this, args);
      if (!canRecord || !result || typeof result.then !== 'function') {
        return result;
      }
      return result.then((res) => {
        const extra = typeof buildResultMeta === 'function' ? (buildResultMeta(res, meta) || {}) : {};
        reporter(Object.assign({}, meta, extra, {
          durationMs: Date.now() - startAt,
          status: 'success'
        }));
        return res;
      }).catch((err) => {
        reporter(Object.assign({}, meta, {
          durationMs: Date.now() - startAt,
          status: 'error'
        }));
        throw err;
      });
    } catch (err) {
      if (canRecord) {
        reporter(Object.assign({}, meta, {
          durationMs: Date.now() - startAt,
          status: 'error'
        }));
      }
      throw err;
    }
  };

  target[methodName].__perfTracked = true;
}

function isFirstScreenPatch(patchData) {
  if (!patchData || typeof patchData !== 'object') {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'loading') && patchData.loading === false) {
    return true;
  }
  const keys = Object.keys(patchData);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const rootKey = extractRootField(key);
    if (!CRITICAL_RENDER_KEYS.includes(rootKey)) continue;
    if (isNonEmpty(patchData[key])) {
      return true;
    }
  }
  return false;
}

function extractRootField(path) {
  if (typeof path !== 'string' || !path) return '';
  const dotIndex = path.indexOf('.');
  const bracketIndex = path.indexOf('[');
  let end = path.length;
  if (dotIndex >= 0) end = Math.min(end, dotIndex);
  if (bracketIndex >= 0) end = Math.min(end, bracketIndex);
  return path.slice(0, end);
}

function isNonEmpty(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

function percentile(values, percent) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values
    .map((item) => toPositiveNumber(item))
    .filter((item) => Number.isFinite(item))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((percent / 100) * sorted.length) - 1;
  const index = clamp(rank, 0, sorted.length - 1);
  return Math.round(sorted[index]);
}

function maxOf(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  let max = 0;
  values.forEach((item) => {
    const n = toPositiveNumber(item);
    if (n > max) max = n;
  });
  return Math.round(max);
}

function estimateJsonBytes(value) {
  try {
    return JSON.stringify(value == null ? {} : value).length;
  } catch (err) {
    return 0;
  }
}

function sanitizeDevice(device) {
  if (!device || typeof device !== 'object') return {};
  return {
    brand: toSafeText(device.brand, 32),
    model: toSafeText(device.model, 64),
    platform: toSafeText(device.platform, 32),
    system: toSafeText(device.system, 32),
    version: toSafeText(device.version, 32)
  };
}

function buildRunId() {
  return `perf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function markWrapped(target) {
  try {
    Object.defineProperty(target, WRAP_MARK, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  } catch (err) {
    target[WRAP_MARK] = true;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toSafeText(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function toPositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function exportedCreateProfiler(options = {}) {
  const profiler = new PerfProfiler(options);
  activeProfiler = profiler;
  return profiler;
}

module.exports = exportedCreateProfiler;
module.exports.PERF_MODE_KEY = PERF_MODE_KEY;
