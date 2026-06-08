// pages/post-detail/index.js
const app = getApp();
const followUtil = require('../../utils/follow.js');
const { checkPermission, checkAndExecute } = require('../../utils/permission.js');

let db = null;
let _ = null;
const USER_BATCH_CACHE_TTL = 5 * 60 * 1000;
const COMMENT_RELOAD_DEBOUNCE_MS = 120;
const INTERACTION_COOLDOWN_MS = 300;
const INTERACTION_GUARD_TIMEOUT_MS = 10 * 1000;
const STATUS_SYNC_TTL_MS = 8 * 1000;
const ADMIN_STATUS_TTL_MS = 60 * 1000;
const INTERACTION_STATUS_BATCH_SIZE = 50;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
    _ = db.command;
  }
  return { db, _ };
};

Page({
  data: {
    postId: '',
    post: null,
    comments: [],
    newComment: '',
    replyToId: '',
    replyToName: '',
    isInputFocus: false,
    placeholderText: '说点什么...',
    loading: true,
    isCollected: false,
    collectCount: 0,
    isFollowing: false,
    likeCount: 0,
    isLiked: false,
    showProfessionalActions: false,
    canVerifyIssue: false,
    canDesignSolution: false,
    canCreateProject: false,
    canUpdateProgress: false,
    canViewUserContact: false,
    
    // 关联内容
    linkedProposal: null,
    linkedProject: null,
    showLinkedContent: false,
    proposalCount: 0,
    
    // 专业操作权限
    isDesigner: false,
    isContractor: false,
    isCommunityWorker: false,
    isPostOwner: false,
    canSubmitProposal: false,
    
    // 管理员权限
    isAdmin: false,
  },

  onLoad(options) {
    const postId = options.id || options.postId;
    if (!postId) {
      wx.showToast({ title: '帖子不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ postId });
    this.refreshPageData(true);
  },

  onShow() {
    this.refreshPageData(false);
  },

  onPullDownRefresh() {
    Promise.resolve(this.refreshPageData(true)).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onUnload() {
    if (this._commentReloadTimer) {
      clearTimeout(this._commentReloadTimer);
      this._commentReloadTimer = null;
    }
    if (this._interactionUnlockTimers) {
      this._interactionUnlockTimers.forEach((timerId) => clearTimeout(timerId));
      this._interactionUnlockTimers.clear();
    }
    this._pendingCommentsReload = false;
  },

  refreshPageData(force = false) {
    const postId = this.data.postId;
    if (!postId) return Promise.resolve();

    const now = Date.now();
    const ttlMs = 30 * 1000;
    const expired = now - (this._lastLoadedAt || 0) > ttlMs;
    if (this._pageLoadInflight) return this._pageLoadInflight;
    if (!force && !expired && !this._dirtyPageData) {
      return Promise.resolve();
    }

    this._dirtyPageData = false;
    this._lastLoadedAt = now;
    this._pageLoadInflight = Promise.resolve(this.refreshAdminStatus(force))
      .catch(() => false)
      .then(() => Promise.all([
        Promise.resolve(this.loadPostDetail()),
        Promise.resolve(this.loadComments())
      ])).finally(() => {
      this._pageLoadInflight = null;
    });

    return this._pageLoadInflight;
  },

  checkProfessionalPermissions() {
    const userType = app.globalData.userType || wx.getStorageSync('userType');
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    const accessCache = app.globalData.__adminStatusCache || {};
    const isAdmin = !!this.data.isAdmin;
    
    // 判断用户角色
    const isDesigner = userType === 'designer';
    const isContractor = userType === 'contractor';
    const isCommunityWorker = userType === 'communityWorker';
    
    // 判断是否是帖子作者
    const isPostOwner = this.data.post && this.data.post._openid === openid;
    
    const canViewUserContact = !!(
      isAdmin ||
      accessCache.canManageUsers === true ||
      accessCache.canViewUserContact === true ||
      isCommunityWorker
    );

    const isDemand = this.data.post && this.data.post.type === 'demand';

    this.setData({
      isDesigner: isDesigner,
      isContractor: isContractor,
      isCommunityWorker: isCommunityWorker,
      isPostOwner: isPostOwner,
      isAdmin: isAdmin,
      canViewUserContact: canViewUserContact,
      canSubmitProposal: !!(isDesigner || (isDemand && isContractor)),
      showProfessionalActions: this.data.post && ['issue', 'demand'].includes(this.data.post.type)
    });
  },

  refreshAdminStatus(force = false) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      app.globalData.__adminStatusCache = null;
      if (this.data.isAdmin) {
        this.setData({ isAdmin: false });
      }
      return Promise.resolve(false);
    }

    const cache = app.globalData.__adminStatusCache;
    const now = Date.now();
    if (!force && cache && cache.openid === openid && cache.expireAt > now) {
      const cachedAdmin = !!cache.isAdmin;
      if (cachedAdmin !== this.data.isAdmin) {
        const updates = { isAdmin: cachedAdmin };
        if (this.data.post) {
          updates['post.canDelete'] = !!(this.data.post.isOwner || cachedAdmin);
        }
        this.setData(updates);
      }
      return Promise.resolve(cachedAdmin);
    }

    return wx.cloud.callFunction({
        name: 'getCurrentUserAccess',
        data: {}
      })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || 'query failed');
        }
        const access = res.result.data || {};
        const isAdmin = !!access.isAdmin;

        app.globalData.__adminStatusCache = {
          openid,
          isAdmin,
          canManageUsers: !!access.canManageUsers,
          canViewUserContact: !!access.canViewUserContact,
          userType: access.userType || 'normal',
          expireAt: Date.now() + ADMIN_STATUS_TTL_MS
        };

        if (isAdmin !== this.data.isAdmin) {
          const updates = { isAdmin };
          if (this.data.post) {
            updates['post.canDelete'] = !!(this.data.post.isOwner || isAdmin);
          }
          this.setData(updates);
        }
        return isAdmin;
      })
      .catch((err) => {
        console.error('refreshAdminStatus failed:', err);
        return !!this.data.isAdmin;
      });
  },

  fetchUsersBatch(openids) {
    const ids = Array.from(new Set((openids || []).filter(Boolean)));
    if (ids.length === 0) return Promise.resolve({});

    if (!this._userBatchCache) this._userBatchCache = new Map();
    if (!this._userBatchInflight) this._userBatchInflight = new Map();

    const now = Date.now();
    const cachedMap = {};
    const missIds = [];
    ids.forEach((id) => {
      const cached = this._userBatchCache.get(id);
      if (cached && cached.expireAt > now && cached.data) {
        cachedMap[id] = cached.data;
      } else {
        missIds.push(id);
      }
    });

    if (missIds.length === 0) {
      return Promise.resolve(cachedMap);
    }

    const inflightKey = missIds.slice().sort().join(',');
    let inflight = this._userBatchInflight.get(inflightKey);
    if (!inflight) {
      inflight = wx.cloud.callFunction({
        name: 'getUsersBatch',
        data: {
          openids: missIds,
          fieldMode: 'basic'
        }
      }).then((res) => {
        if (res.result && res.result.success && res.result.data) {
          return res.result.data;
        }
        return {};
      }).catch((err) => {
        console.error('getUsersBatch failed:', err);
        return {};
      }).finally(() => {
        this._userBatchInflight.delete(inflightKey);
      });
      this._userBatchInflight.set(inflightKey, inflight);
    }

    return inflight.then((remoteMap) => {
      const expireAt = Date.now() + USER_BATCH_CACHE_TTL;
      Object.keys(remoteMap).forEach((openid) => {
        this._userBatchCache.set(openid, {
          data: remoteMap[openid],
          expireAt
        });
      });
      return Object.assign({}, cachedMap, remoteMap);
    });
  },

  fetchInteractionStatuses(items) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!openid || safeItems.length === 0) return Promise.resolve([]);

    const chunks = [];
    for (let i = 0; i < safeItems.length; i += INTERACTION_STATUS_BATCH_SIZE) {
      chunks.push(safeItems.slice(i, i + INTERACTION_STATUS_BATCH_SIZE));
    }

    return Promise.all(chunks.map((chunk) =>
      wx.cloud.callFunction({
        name: 'getInteractionStatus',
        data: { items: chunk }
      }).then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || 'query failed');
        }
        return Array.isArray(res.result.data) ? res.result.data : [];
      })
    )).then((groups) => groups.reduce((list, group) => list.concat(group), []));
  },

  scheduleCommentsReload(force = true) {
    if (this._commentReloadTimer) {
      clearTimeout(this._commentReloadTimer);
    }
    this._commentReloadTimer = setTimeout(() => {
      this._commentReloadTimer = null;
      this.loadComments(force);
    }, COMMENT_RELOAD_DEBOUNCE_MS);
  },

  patchCommentLikeState(commentId, liked, count) {
    const comments = this.data.comments || [];
    if (!Array.isArray(comments) || comments.length === 0) return false;

    const normalizedCount = Number.isFinite(count) ? Math.max(0, count) : null;
    const safeLike = !!liked;
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      if (comment && comment._id === commentId) {
        const nextLikeCount = normalizedCount !== null
          ? normalizedCount
          : Math.max(0, (comment.likes || comment.likeCount || 0) + (safeLike ? 1 : -1));
        const base = `comments[${i}]`;
        this.setData({
          [`${base}.liked`]: safeLike,
          [`${base}.likes`]: nextLikeCount,
          [`${base}.likeCount`]: nextLikeCount
        });
        return true;
      }

      const replies = Array.isArray(comment && comment.replies) ? comment.replies : [];
      for (let j = 0; j < replies.length; j++) {
        const reply = replies[j];
        if (!reply || reply._id !== commentId) continue;
        const nextLikeCount = normalizedCount !== null
          ? normalizedCount
          : Math.max(0, (reply.likes || reply.likeCount || 0) + (safeLike ? 1 : -1));
        const base = `comments[${i}].replies[${j}]`;
        this.setData({
          [`${base}.liked`]: safeLike,
          [`${base}.likes`]: nextLikeCount,
          [`${base}.likeCount`]: nextLikeCount
        });
        return true;
      }
    }

    return false;
  },

  acquireInteractionGuard(key) {
    if (!key) return false;
    if (!this._interactionInflight) this._interactionInflight = new Set();
    if (!this._interactionLastAt) this._interactionLastAt = new Map();
    if (!this._interactionUnlockTimers) this._interactionUnlockTimers = new Map();

    const now = Date.now();
    const lastAt = this._interactionLastAt.get(key) || 0;
    if (this._interactionInflight.has(key)) return false;
    if (now - lastAt < INTERACTION_COOLDOWN_MS) return false;

    this._interactionInflight.add(key);
    this._interactionLastAt.set(key, now);
    const unlockTimer = setTimeout(() => {
      if (this._interactionInflight) this._interactionInflight.delete(key);
      if (this._interactionUnlockTimers) this._interactionUnlockTimers.delete(key);
    }, INTERACTION_GUARD_TIMEOUT_MS);
    this._interactionUnlockTimers.set(key, unlockTimer);
    return true;
  },

  releaseInteractionGuard(key) {
    if (!key) return;
    if (this._interactionUnlockTimers && this._interactionUnlockTimers.has(key)) {
      clearTimeout(this._interactionUnlockTimers.get(key));
      this._interactionUnlockTimers.delete(key);
    }
    if (this._interactionInflight) this._interactionInflight.delete(key);
    if (!this._interactionLastAt) this._interactionLastAt = new Map();
    this._interactionLastAt.set(key, Date.now());
  },

  safeNavigateTo(url, options = {}) {
    const fallback = options.fallback || 'back';
    wx.navigateTo({
      url,
      fail: (err) => {
        console.error('navigateTo failed:', url, err);
        wx.showToast({ title: '页面不存在或已下线', icon: 'none' });
        setTimeout(() => {
          if (fallback === 'home') {
            wx.switchTab({ url: '/pages/index/index' });
            return;
          }
          const pages = getCurrentPages();
          if (pages.length > 1) {
            wx.navigateBack({ delta: 1 });
            return;
          }
          wx.switchTab({ url: '/pages/index/index' });
        }, 300);
      }
    });
  },

  handleSchemeTap(e) {
    const status = e.currentTarget.dataset.status;
    const code = e.currentTarget.dataset.code || '方案';
    const index = Number(e.currentTarget.dataset.index);

    if (status === 'placeholder') {
      wx.showToast({ title: '暂无方案文件', icon: 'none' });
      return;
    }

    const schemes = (this.data.post && this.data.post.matchedSchemes) || [];
    const scheme = schemes[index] || null;
    const file = this.findFirstSchemeFile(scheme);
    this.openSchemeFile(file, code);
  },

  handleSchemeFileTap(e) {
    const schemeIndex = Number(e.currentTarget.dataset.schemeIndex);
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const fileIndex = Number(e.currentTarget.dataset.fileIndex);
    const schemes = (this.data.post && this.data.post.matchedSchemes) || [];
    const scheme = schemes[schemeIndex] || null;
    const group = scheme && Array.isArray(scheme.fileGroups) ? scheme.fileGroups[groupIndex] : null;
    const file = group && Array.isArray(group.files) ? group.files[fileIndex] : null;
    this.openSchemeFile(file, scheme && scheme.code);
  },

  handleSchemeDisplayFileTap(e) {
    const schemeIndex = Number(e.currentTarget.dataset.schemeIndex);
    const section = e.currentTarget.dataset.section;
    const fileIndex = Number(e.currentTarget.dataset.fileIndex);
    const schemes = (this.data.post && this.data.post.matchedSchemes) || [];
    const scheme = schemes[schemeIndex] || null;
    const sections = scheme && scheme.displaySections ? scheme.displaySections : {};
    const files = Array.isArray(sections[section]) ? sections[section] : [];
    const file = files[fileIndex] || null;
    this.openSchemeFile(file, scheme && scheme.code);
  },

  findFirstSchemeFile(scheme) {
    if (!scheme) return null;
    const groups = Array.isArray(scheme.fileGroups) ? scheme.fileGroups : [];
    for (let i = 0; i < groups.length; i++) {
      const files = Array.isArray(groups[i].files) ? groups[i].files : [];
      const preview = files.find((file) => file && file.fileType !== 'engineering');
      if (preview) return preview;
    }
    if (Array.isArray(scheme.previewFiles) && scheme.previewFiles.length) return scheme.previewFiles[0];
    if (Array.isArray(scheme.files) && scheme.files.length) return scheme.files[0];
    return null;
  },

  openSchemeFile(file, code = '方案') {
    if (file && file.fileType === 'engineering') {
      wx.showToast({ title: '工程文件已提供，请下载后用专业软件打开', icon: 'none' });
      return;
    }
    const fileUrl = file && (file.fileID || file.fileId || file.url || file.src);

    if (!fileUrl) {
      wx.showToast({ title: `${code}方案文件待上传`, icon: 'none' });
      return;
    }

    if (String(fileUrl).indexOf('cloud://') === 0) {
      wx.cloud.getTempFileURL({
        fileList: [fileUrl],
        success: (res) => {
          const item = res.fileList && res.fileList[0];
          if (item && item.tempFileURL) {
            this.downloadAndOpenSchemeFile(item.tempFileURL);
          } else {
            wx.showToast({ title: '文件暂不可用', icon: 'none' });
          }
        },
        fail: () => {
          wx.showToast({ title: '文件暂不可用', icon: 'none' });
        }
      });
      return;
    }

    this.downloadAndOpenSchemeFile(fileUrl);
  },

  downloadAndOpenSchemeFile(fileUrl) {
    wx.showLoading({ title: '打开中...' });
    wx.downloadFile({
      url: fileUrl,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300 || !res.tempFilePath) {
          wx.showToast({ title: '文件下载失败', icon: 'none' });
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => {
            wx.showToast({ title: '文件无法预览', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '文件下载失败', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  formatLocationCoordinate(location) {
    if (!location || typeof location !== 'object') return '';

    const coordinates = Array.isArray(location.coordinates)
      ? location.coordinates
      : Array.isArray(location._coordinates)
        ? location._coordinates
        : null;

    const longitude = Number(
      location.longitude ??
      location._longitude ??
      location.lng ??
      location._lng ??
      (coordinates ? coordinates[0] : NaN)
    );
    const latitude = Number(
      location.latitude ??
      location._latitude ??
      location.lat ??
      location._lat ??
      (coordinates ? coordinates[1] : NaN)
    );

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return '';
    if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return '';

    return `经度：${longitude.toFixed(6)}，纬度：${latitude.toFixed(6)}`;
  },

  normalizeSchemeForView(scheme) {
    if (!scheme || typeof scheme !== 'object') return null;
    const files = Array.isArray(scheme.files) ? scheme.files : [];
    const fileGroups = Array.isArray(scheme.fileGroups) && scheme.fileGroups.length
      ? scheme.fileGroups.map((group) => ({
        groupName: group.groupName || group.title || '方案文件',
        title: group.title || group.groupName || '方案文件',
        files: Array.isArray(group.files) ? group.files : []
      })).filter((group) => group.files.length > 0)
      : this.buildSchemeGroupsFromFiles(files);
    const totalFileCount = Number(scheme.totalFileCount) ||
      fileGroups.reduce((sum, group) => sum + group.files.length, 0) ||
      files.length;
    const schemeSummary = this.normalizeSchemeSummary(scheme.schemeSummary, scheme);
    const displaySections = this.normalizeSchemeDisplaySections(scheme.displaySections, fileGroups, files, schemeSummary);

    return Object.assign({}, scheme, {
      fileGroups,
      schemeSummary,
      displaySections,
      totalFileCount
    });
  },

  normalizeSchemeSummary(summary, scheme) {
    const source = summary && typeof summary === 'object' ? summary : {};
    const matchedSubtypes = Array.isArray(source.matchedSubtypes)
      ? source.matchedSubtypes.filter(Boolean)
      : Array.isArray(scheme.matchedSubtypes)
        ? scheme.matchedSubtypes.filter(Boolean)
        : [];
    return {
      category: source.category || (Array.isArray(scheme.matchedCategories) ? scheme.matchedCategories[0] : '') || '',
      facility: source.facility || (Array.isArray(scheme.facilityGroups) ? scheme.facilityGroups[0] : '') || '',
      matchedSubtypes,
      matchedSubtypesText: matchedSubtypes.join('、'),
      designFocus: source.designFocus || scheme.title || '',
      evidence: source.evidence || (matchedSubtypes.length ? `适用于：${matchedSubtypes.join('、')}` : '')
    };
  },

  normalizeSchemeDisplaySections(sections, fileGroups, files, summary) {
    const source = sections && typeof sections === 'object' ? sections : {};
    return {
      drawingFiles: this.normalizeSchemeFileList(source.drawingFiles, fileGroups, files, this.isSchemeDrawingFile),
      tagCardFiles: this.normalizeSchemeFileList(source.tagCardFiles, fileGroups, files, this.isSchemeTagCardFile),
      materialTableFiles: this.normalizeSchemeFileList(source.materialTableFiles, fileGroups, files, this.isSchemeMaterialFile),
      constructionFiles: this.normalizeSchemeFileList(source.constructionFiles, fileGroups, files, this.isSchemeConstructionFile),
      tagSummary: summary
    };
  },

  normalizeSchemeFileList(list, fileGroups, files, predicate) {
    if (Array.isArray(list) && list.length) return list;
    const picked = [];
    fileGroups.forEach((group) => {
      (Array.isArray(group.files) ? group.files : []).forEach((file) => {
        if (predicate.call(this, file)) picked.push(file);
      });
    });
    if (picked.length) return picked;
    return (Array.isArray(files) ? files : []).filter((file) => predicate.call(this, file));
  },

  isSchemeDrawingFile(file) {
    const name = (file && file.name) || '';
    const groupName = (file && file.groupName) || '';
    const ext = (file && file.ext) || '';
    if (groupName.indexOf('施工图纸') > -1) return true;
    return /平面图|立面图|节点|详图|图纸/.test(name) && (ext === 'pdf' || ext === 'dwg');
  },

  isSchemeTagCardFile(file) {
    return Boolean(file && file.name && file.name.indexOf('方案标签卡') > -1);
  },

  isSchemeMaterialFile(file) {
    const name = (file && file.name) || '';
    return (name.indexOf('材料清单') > -1 || name.indexOf('物料清单') > -1) && file.ext === 'xlsx';
  },

  isSchemeConstructionFile(file) {
    const name = (file && file.name) || '';
    return name.indexOf('施工工艺') > -1 || name.indexOf('验收标准') > -1;
  },

  buildSchemeGroupsFromFiles(files) {
    const groups = {};
    (Array.isArray(files) ? files : []).forEach((file) => {
      if (!file) return;
      const groupName = file.groupName || '方案文件';
      if (!groups[groupName]) {
        groups[groupName] = { groupName, title: groupName, files: [] };
      }
      groups[groupName].files.push(file);
    });
    return Object.keys(groups).map((key) => groups[key]);
  },

  loadPostDetail() {
    wx.showLoading({ title: '加载中...' });
    return wx.cloud.callFunction({
      name: 'getPublicData',
      data: {
        collection: 'posts',
        docId: this.data.postId
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const post = res.result.data;
        if (post.createTime) {
          post.createTime = this.formatTime(post.createTime);
        }
        if (!post.stats) {
          post.stats = {};
        }
        post.stats.like = Math.max(0, Number(post.stats.like) || 0);
        post.stats.comment = Math.max(0, Number(post.stats.comment) || 0);
        post.stats.collect = Math.max(0, Number(post.stats.collect) || 0);
        if (Number.isFinite(this._latestCommentCount)) {
          post.stats.comment = Math.max(0, Number(this._latestCommentCount));
        }
        post.locationCoordinateText = this.formatLocationCoordinate(post.location);
        post.isDemand = post.type === 'demand';
        post.isProfessionalPost = ['issue', 'demand'].includes(post.type);
        post.statusText = this.formatPostStatus(post.status, post.type);
        post.urgencyText = this.formatUrgency(post.urgency);
        post.rampProblems = Array.isArray(post.rampProblems) ? post.rampProblems : [];
        post.recognizedSubtypes = Array.isArray(post.recognizedSubtypes) && post.recognizedSubtypes.length
          ? post.recognizedSubtypes
          : (post.recognizedSubtype ? [post.recognizedSubtype] : []);
        post.matchedSchemes = Array.isArray(post.matchedSchemes)
          ? post.matchedSchemes.map((scheme) => this.normalizeSchemeForView(scheme)).filter(Boolean)
          : [];
        post.schemeMessage = post.schemeMessage || '';
        post.hasSchemePanel = post.matchedSchemes.length > 0 || !!post.schemeMessage;
        const confidence = Number(post.recognitionConfidence);
        post.recognitionConfidenceText = Number.isFinite(confidence) && confidence > 0
          ? `${Math.round(confidence * 100)}%`
          : '';
        const openid = app.globalData.openid || wx.getStorageSync('openid');
        post.isOwner = post._openid === openid;
        const isAdmin = !!this.data.isAdmin;
        post.canDelete = post.isOwner || isAdmin; // 作者或管理员可以删除
        
        // 🔍 调试日志
        console.log('🔍 当前用户 openid:', openid);
        console.log('🔍 是否是管理员:', isAdmin);
        console.log('🔍 是否是作者:', post.isOwner);
        console.log('🔍 是否可以删除:', post.canDelete);
        
        this.setData({
          post,
          loading: false,
          likeCount: post.stats.like,
          collectCount: post.stats.collect
        });

        // 实时查询作者的最新用户信息
        const hasEmbeddedUserInfo = !!(
          post.userInfo &&
          (post.userInfo.nickName || post.userInfo.avatarUrl)
        );
        if (post._openid && !hasEmbeddedUserInfo) {
          this.fetchUsersBatch([post._openid]).then((userMap) => {
            const userData = userMap[post._openid];
            if (userData) {
              const updatedUserInfo = userData.userInfo || post.userInfo;
              const updatedUserType = userData.userType || post.userType;
              
              this.setData({
                'post.userInfo': updatedUserInfo,
                'post.userType': updatedUserType
              });
            }
          }).catch(err => {
            console.error('查询作者信息失败:', err);
          });
        }
        
        // 加载关联内容（设计方案和项目）
        this.loadLinkedContent();
        
        // ✅ 重新检查专业权限（此时 post 数据已加载）
        this.checkProfessionalPermissions();
        
        this.syncCollectStatus();
        this.syncLikeStatus();
        this.syncFollowStatus();
      } else {
        throw new Error(res.result?.error || '加载失败');
      }
    }).catch(err => {
      console.error('加载帖子详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }).finally(() => {
      wx.hideLoading();
    });
  },

  // 加载关联的设计方案和项目
  loadLinkedContent() {
    if (!this.data.post || !['issue', 'demand'].includes(this.data.post.type)) {
      return Promise.resolve();
    }

    const requestId = (this._linkedContentReqId || 0) + 1;
    this._linkedContentReqId = requestId;
    const issueId = this.data.postId;

    const proposalPromise = wx.cloud.callFunction({
      name: 'getDesignProposals',
      data: { issueId }
    }).then((res) => {
      if (res.result && res.result.success && Array.isArray(res.result.data)) {
        return { count: res.result.data.length };
      }
      return { count: 0 };
    }).catch((err) => {
      console.log('查询设计方案失败:', err);
      return { count: 0 };
    });

    const projectPromise = wx.cloud.callFunction({
      name: 'getProjectByIssue',
      data: { issueId }
    }).then((res) => {
      if (res.result && res.result.success && res.result.data) {
        return { project: res.result.data };
      }
      return { project: null };
    }).catch((err) => {
      console.log('查询关联项目失败:', err);
      return { project: null };
    });

    return Promise.all([proposalPromise, projectPromise]).then(([proposalRes, projectRes]) => {
      if (this._linkedContentReqId !== requestId || issueId !== this.data.postId) {
        return;
      }

      const proposalCount = Math.max(0, Number(proposalRes.count) || 0);
      const linkedProject = projectRes.project || null;
      this.setData({
        proposalCount,
        linkedProject,
        showLinkedContent: proposalCount > 0 || !!linkedProject
      });
    });
  },

  // 查看设计方案列表
  viewProposalList() {
    wx.navigateTo({
      url: `/pages/design/proposal-list/index?issueId=${this.data.postId}`
    });
  },

  // 查看项目详情
  viewProject() {
    if (this.data.linkedProject) {
      wx.navigateTo({
        url: `/pages/project/detail/index?id=${this.data.linkedProject._id}`
      });
    }
  },

  // 设计师：添加设计方案
  addDesignSolution() {
    if (!this.data.canSubmitProposal) {
      wx.showToast({
        title: '暂无提交权限',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/design/solution/create?postId=${this.data.postId}`
    });
  },

  // 施工方：创建项目
  createProject() {
    if (!this.data.isContractor) {
      wx.showToast({
        title: '仅施工方可操作',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/project/create/index?postId=${this.data.postId}`
    });
  },

  // 施工方：更新项目节点
  updateProjectNode() {
    if (!this.data.isContractor) {
      wx.showToast({
        title: '仅施工方可操作',
        icon: 'none'
      });
      return;
    }

    if (!this.data.linkedProject) {
      wx.showToast({
        title: '请先创建项目',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/project/detail/index?id=${this.data.linkedProject._id}`
    });
  },

  // 施工方和社区工作者：查看联系方式
  viewContactInfo() {
    if (!this.data.canViewUserContact) {
      wx.showToast({
        title: '暂无查看联系方式权限',
        icon: 'none'
      });
      return;
    }

    const post = this.data.post;
    if (!post || !post._openid) {
      wx.showToast({
        title: '无法获取用户信息',
        icon: 'none'
      });
      return;
    }

    // 调用云函数获取用户联系方式
    wx.showLoading({ title: '加载中...' });
    const postId = this.data.postId;
    const token = (this._linkedContentToken || 0) + 1;
    this._linkedContentToken = token;

    const proposalPromise = wx.cloud.callFunction({
      name: 'getDesignProposals',
      data: { issueId: postId }
    }).then((res) => {
      if (res.result && res.result.success && Array.isArray(res.result.data)) {
        return res.result.data.length;
      }
      return 0;
    }).catch((err) => {
      console.log('鏌ヨ璁捐鏂规澶辫触:', err);
      return 0;
    });

    const projectPromise = wx.cloud.callFunction({
      name: 'getProjectByIssue',
      data: { issueId: postId }
    }).then((res) => {
      if (res.result && res.result.success && res.result.data) {
        return res.result.data;
      }
      return null;
    }).catch(() => {
      console.log('鏈壘鍒板叧鑱旂殑椤圭洰');
      return null;
    });

    return Promise.all([proposalPromise, projectPromise]).then(([proposalCount, linkedProject]) => {
      if (token !== this._linkedContentToken) return;
      this.setData({
        proposalCount,
        linkedProject,
        showLinkedContent: proposalCount > 0 || !!linkedProject
      });
    });

    wx.cloud.callFunction({
      name: 'getUserContact',
      data: { targetId: post._openid }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success && res.result.data) {
        const userData = res.result.data;
        const phoneNumber = userData.phoneNumber || '';
        const nickName = post.userInfo?.nickName || '用户';
        
        if (!phoneNumber) {
          wx.showModal({
            title: '联系方式',
            content: '该用户未填写联系方式',
            showCancel: false
          });
          return;
        }

        wx.showModal({
          title: `${nickName}的联系方式`,
          content: `手机号：${phoneNumber}`,
          confirmText: '拨打电话',
          cancelText: '取消',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.makePhoneCall({
                phoneNumber: phoneNumber,
                fail: (err) => {
                  console.error('拨打电话失败:', err);
                  wx.showToast({
                    title: '拨打失败',
                    icon: 'none'
                  });
                }
              });
            }
          }
        });
      } else {
        wx.showToast({
          title: '获取联系方式失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('获取联系方式失败:', err);
      wx.showToast({
        title: '获取失败',
        icon: 'none'
      });
    });
  },

  // 确认项目完成（发帖者或社区工作者）
  confirmProjectCompletion() {
    if (!this.data.isPostOwner && !this.data.isCommunityWorker) {
      wx.showToast({
        title: '无权限操作',
        icon: 'none'
      });
      return;
    }

    if (!this.data.linkedProject) {
      wx.showToast({
        title: '该帖子没有关联项目',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认完成',
      content: '确认该项目已完成？完成后将移至案例板块。',
      success: (res) => {
        if (res.confirm) {
          this.doConfirmCompletion();
        }
      }
    });
  },

  // 执行确认完成
  doConfirmCompletion() {
    wx.showLoading({ title: '处理中...' });

    wx.cloud.callFunction({
      name: 'confirmProjectCompletion',
      data: {
        projectId: this.data.linkedProject._id,
        postId: this.data.postId,
        confirmedBy: this.data.isCommunityWorker ? 'communityWorker' : 'owner'
      }
    }).then(res => {
      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({
          title: '确认成功',
          icon: 'success'
        });

        // 刷新页面
        setTimeout(() => {
          this.loadPostDetail();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '确认失败');
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('确认失败:', err);
      wx.showToast({
        title: err.message || '确认失败',
        icon: 'none'
      });
    });
  },

  checkLikeStatus() {
    return this.syncLikeStatus(true);
  },

  loadComments(force = false) {
    if (this._commentsLoadInflight) {
      if (force) this._pendingCommentsReload = true;
      return this._commentsLoadInflight;
    }

    const { db, _ } = getDB();
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    console.log('🔍 开始加载评论，postId:', this.data.postId);
    const isAdmin = !!this.data.isAdmin;

    this._commentsLoadInflight = db.collection('comments')
      .where({ postId: this.data.postId })
      .field({
        _id: true,
        postId: true,
        content: true,
        parentId: true,
        likes: true,
        likeCount: true,
        createTime: true,
        authorOpenid: true,
        _openid: true
      })
      .orderBy('createTime', 'desc')
      .get()
      .then(async res => {
        console.log('📊 查询到的评论总数:', res.data.length);
        const allComments = res.data;
        
        if (allComments.length === 0) {
          this._latestCommentCount = 0;
          const emptyUpdates = { comments: [] };
          if (this.data.post) {
            emptyUpdates['post.stats.comment'] = 0;
          }
          this.setData(emptyUpdates);
          return;
        }

        const commentIds = allComments.map(c => c._id);
        const authorIds = [...new Set(allComments.map(c => c.authorOpenid || c._openid).filter(Boolean))];
        const batchUserMap = await this.fetchUsersBatch(authorIds);

        if (!this._commentLikeCache) this._commentLikeCache = new Map();
        const now = Date.now();
        const canUseLikeCache = !!(
          openid &&
          !force &&
          this._commentLikeCacheAt &&
          (now - this._commentLikeCacheAt < STATUS_SYNC_TTL_MS)
        );
        const likedMap = new Set();
        const needQueryIds = [];
        if (openid) {
          commentIds.forEach((id) => {
            if (!id) return;
            if (canUseLikeCache && this._commentLikeCache.has(id)) {
              if (this._commentLikeCache.get(id)) likedMap.add(id);
            } else {
              needQueryIds.push(id);
            }
          });
        }

        const likesPromise = (openid && needQueryIds.length > 0)
          ? this.fetchInteractionStatuses(
            needQueryIds.map((id) => ({ id, collection: 'comments', type: 'like' }))
          ).then((rows) => ({
            data: rows
              .filter((row) => row && row.status)
              .map((row) => ({ targetId: row.id }))
          }))
          : Promise.resolve({ data: [] });

        /* const usersPromise = Promise.all(
          authorIds.map(authorId => 
            Promise.resolve({
              result: {
                success: true,
                data: batchUserMap[authorId] || {}
              }
            }).then(res => {
            if (res.result && res.result.success) {
              return {
                  openid: authorId,
                  userInfo: res.result.data.userInfo || { avatarUrl: '/images/default-avatar.png', nickName: '微信用户' },
                  userType: res.result.data.userType || 'CommunityWorker'
              };
            }
            return {
                openid: authorId,
                userInfo: { avatarUrl: '/images/default-avatar.png', nickName: '微信用户' },
                userType: 'CommunityWorker'
            };
            }).catch(err => {
              console.error('查询用户信息失败:', authorId, err);
              return {
                openid: authorId,
                userInfo: { avatarUrl: '/images/default-avatar.png', nickName: '微信用户' },
                userType: 'CommunityWorker'
              };
            })
          )
        ); */

        return likesPromise.then((likesRes) => {
          const freshLikedSet = new Set();
          (likesRes.data || []).forEach((like) => {
            if (like && like.targetId) freshLikedSet.add(like.targetId);
          });

          if (openid) {
            const needQuerySet = new Set(needQueryIds);
            if (!canUseLikeCache) {
              this._commentLikeCache.clear();
            }
            commentIds.forEach((id) => {
              if (!id) return;
              let liked = false;
              if (freshLikedSet.has(id)) {
                liked = true;
              } else if (canUseLikeCache && !needQuerySet.has(id) && this._commentLikeCache.has(id)) {
                liked = !!this._commentLikeCache.get(id);
              }
              this._commentLikeCache.set(id, liked);
              if (liked) likedMap.add(id);
            });
            this._commentLikeCacheAt = Date.now();
          }
          
          const userMap = new Map();
          authorIds.forEach((authorId) => {
            const userData = batchUserMap[authorId] || {};
            userMap.set(authorId, {
              userInfo: userData.userInfo || { avatarUrl: '/images/default-avatar.png', nickName: '寰俊鐢ㄦ埛' },
              userType: userData.userType || 'CommunityWorker'
            });
          });
        
          console.log('❤️ 已点赞的评论数:', likedMap.size);
          console.log('👥 查询到的用户数:', userMap.size);

          const mainComments = [];
          const repliesMap = {};
          const commentById = new Map();
          allComments.forEach((item) => {
            if (item && item._id) {
              commentById.set(item._id, item);
            }
          });
          const resolveRootParentId = (comment) => {
            let parentId = comment && comment.parentId;
            let guard = 0;
            while (parentId && guard < 10) {
              const parent = commentById.get(parentId);
              if (!parent) return '';
              if (!parent.parentId) return parent._id;
              parentId = parent.parentId;
              guard += 1;
            }
            return '';
          };
          
          allComments.forEach(comment => {
            comment.createTime = this.formatTime(comment.createTime);
            const commentAuthorOpenid = comment.authorOpenid || comment._openid || '';
            comment._openid = commentAuthorOpenid;
            comment.isOwner = commentAuthorOpenid === openid;
            comment.canDelete = comment.isOwner || isAdmin; // 作者或管理员可以删除
            comment.likes = comment.likes || comment.likeCount || 0;
            comment.liked = likedMap.has(comment._id);

            const userData = userMap.get(commentAuthorOpenid);
            if (userData) {
              comment.userInfo = userData.userInfo;
              comment.userType = userData.userType;
            } else {
              if (!comment.userInfo) {
                comment.userInfo = { 
                  avatarUrl: '/images/default-avatar.png', 
                  nickName: '微信用户' 
                };
              }
              if (!comment.userType) {
                comment.userType = 'CommunityWorker';
              }
            }

            if (!comment.parentId) { 
              comment.replies = []; 
              mainComments.push(comment); 
          } else {
              const rootParentId = resolveRootParentId(comment);
              if (!rootParentId) {
                comment.parentId = '';
                comment.replies = [];
                mainComments.push(comment);
                return;
              }
              if (!repliesMap[rootParentId]) {
                repliesMap[rootParentId] = [];
              }
              repliesMap[rootParentId].push(comment); 
          }
        });

          mainComments.forEach(comment => { 
            if (repliesMap[comment._id]) {
              comment.replies = repliesMap[comment._id]; 
            }
          });

          const mainIdSet = new Set(mainComments.map((item) => item && item._id).filter(Boolean));
          Object.keys(repliesMap).forEach((rootId) => {
            if (mainIdSet.has(rootId)) return;
            const orphanReplies = repliesMap[rootId] || [];
            orphanReplies.forEach((reply) => {
              if (!reply) return;
              reply.parentId = '';
              reply.replies = [];
              mainComments.push(reply);
            });
          });
          
          console.log('✅ 主评论数量:', mainComments.length);
          this._latestCommentCount = Math.max(0, allComments.length);
          const updates = { comments: mainComments };
          if (this.data.post) {
            updates['post.stats.comment'] = this._latestCommentCount;
          }
          this.setData(updates);
        });
      })
      .catch(err => {
        console.error('❌ 加载评论失败:', err);
      })
      .finally(() => {
        this._commentsLoadInflight = null;
        if (this._pendingCommentsReload) {
          this._pendingCommentsReload = false;
          this.loadComments(true);
        }
      });

    return this._commentsLoadInflight;
  },

  formatPostStatus(status, type) {
    const normalized = status || 'pending';
    if (type === 'demand') {
      const demandMap = {
        pending: '待接单',
        accepted: '已接单',
        processing: '施工中',
        constructing: '施工中',
        accepting: '验收中',
        completed: '已完成'
      };
      return demandMap[normalized] || '待接单';
    }
    const issueMap = {
      pending: '待处理',
      processing: '处理中',
      constructing: '处理中',
      accepting: '验收中',
      completed: '已完成'
    };
    return issueMap[normalized] || '待处理';
  },

  formatUrgency(value) {
    const map = {
      high: '高',
      medium: '中',
      low: '低'
    };
    return map[value] || '';
  },

  checkFollowStatus() {
    if (!this.data.post || this.data.post.isOwner) return;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) return;
    
    followUtil.checkFollowStatus(this.data.post._openid)
      .then(isFollowing => {
        this.setData({ isFollowing });
      })
      .catch(err => {
        console.error('检查关注状态失败:', err);
      });
  },

  syncLikeStatus(force = false) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      if (this.data.isLiked) this.setData({ isLiked: false });
      return Promise.resolve(false);
    }

    const now = Date.now();
    if (!force && this._likeStatusSyncInflight) return this._likeStatusSyncInflight;
    if (!force && this._likeStatusSyncAt && now - this._likeStatusSyncAt < STATUS_SYNC_TTL_MS) {
      return Promise.resolve(!!this.data.isLiked);
    }

    this._likeStatusSyncInflight = this.fetchInteractionStatuses([
      { id: this.data.postId, collection: 'posts', type: 'like' }
    ]).then((rows) => {
      const isLiked = !!(rows[0] && rows[0].status);
      if (isLiked !== this.data.isLiked) {
        this.setData({ isLiked });
      }
      this._likeStatusSyncAt = Date.now();
      return isLiked;
    }).catch((err) => {
      console.error('syncLikeStatus failed:', err);
      return !!this.data.isLiked;
    }).finally(() => {
      this._likeStatusSyncInflight = null;
    });

    return this._likeStatusSyncInflight;
  },

  syncFollowStatus(force = false) {
    if (!this.data.post || this.data.post.isOwner) {
      if (this.data.isFollowing) this.setData({ isFollowing: false });
      return Promise.resolve(false);
    }

    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      if (this.data.isFollowing) this.setData({ isFollowing: false });
      return Promise.resolve(false);
    }

    const now = Date.now();
    if (!force && this._followStatusSyncInflight) return this._followStatusSyncInflight;
    if (!force && this._followStatusSyncAt && now - this._followStatusSyncAt < STATUS_SYNC_TTL_MS) {
      return Promise.resolve(!!this.data.isFollowing);
    }

    this._followStatusSyncInflight = followUtil.checkFollowStatus(this.data.post._openid)
      .then((isFollowing) => {
        const next = !!isFollowing;
        if (next !== this.data.isFollowing) {
          this.setData({ isFollowing: next });
        }
        this._followStatusSyncAt = Date.now();
        return next;
      })
      .catch((err) => {
        console.error('syncFollowStatus failed:', err);
        return !!this.data.isFollowing;
      })
      .finally(() => {
        this._followStatusSyncInflight = null;
      });

    return this._followStatusSyncInflight;
  },

  syncCollectStatus(force = false) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      if (this.data.isCollected) this.setData({ isCollected: false });
      return Promise.resolve(false);
    }

    const now = Date.now();
    if (!force && this._collectStatusSyncInflight) return this._collectStatusSyncInflight;
    if (!force && this._collectStatusSyncAt && now - this._collectStatusSyncAt < STATUS_SYNC_TTL_MS) {
      return Promise.resolve(!!this.data.isCollected);
    }

    this._collectStatusSyncInflight = this.fetchInteractionStatuses([
      { id: this.data.postId, collection: 'posts', type: 'collect' }
    ])
      .then((rows) => {
        const isCollected = !!(rows[0] && rows[0].status);
        if (isCollected !== this.data.isCollected) {
          this.setData({ isCollected });
        }
        this._collectStatusSyncAt = Date.now();
        return isCollected;
      })
      .catch((err) => {
        console.error('syncCollectStatus failed:', err);
        return !!this.data.isCollected;
      })
      .finally(() => {
        this._collectStatusSyncInflight = null;
      });

    return this._collectStatusSyncInflight;
  },

  likePost() {
    if (!this.data.post) return;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const guardKey = `post-like:${this.data.postId}`;
    if (!this.acquireInteractionGuard(guardKey)) return;

    const prevLikeStatus = !!this.data.isLiked;
    const prevLikeCount = Math.max(0, Number(this.data.likeCount) || 0);
    const newLikeStatus = !prevLikeStatus;
    const newLikeCount = Math.max(0, prevLikeCount + (newLikeStatus ? 1 : -1));

    const optimisticUpdates = {
      isLiked: newLikeStatus,
      likeCount: newLikeCount
    };
    if (this.data.post) {
      optimisticUpdates['post.stats.like'] = newLikeCount;
    }
    this.setData(optimisticUpdates);

    wx.cloud.callFunction({
      name: 'toggleInteraction',
      data: {
        id: this.data.postId,
        collection: 'posts',
        type: 'like'
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const finalStatus = !!res.result.status;
        const finalCount = Number.isFinite(Number(res.result.count))
          ? Math.max(0, Number(res.result.count))
          : newLikeCount;
        const successUpdates = {
          isLiked: finalStatus,
          likeCount: finalCount
        };
        if (this.data.post) {
          successUpdates['post.stats.like'] = finalCount;
        }
        this.setData(successUpdates);
        return;
      }
      throw new Error((res.result && res.result.error) || '操作失败');
    }).catch(err => {
      console.error('点赞失败:', err);
      const rollbackUpdates = {
        isLiked: prevLikeStatus,
        likeCount: prevLikeCount
      };
      if (this.data.post) {
        rollbackUpdates['post.stats.like'] = prevLikeCount;
      }
      this.setData(rollbackUpdates);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }).finally(() => {
      this.releaseInteractionGuard(guardKey);
    });
  },

  toggleCollect() {
    if (!this.data.postId) return;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const guardKey = `post-collect:${this.data.postId}`;
    if (!this.acquireInteractionGuard(guardKey)) return;

    const prevCollected = !!this.data.isCollected;
    const prevCollectCount = Math.max(0, Number(this.data.collectCount) || 0);
    const nextCollected = !prevCollected;
    const nextCollectCount = Math.max(0, prevCollectCount + (nextCollected ? 1 : -1));
    const optimisticUpdates = {
      isCollected: nextCollected,
      collectCount: nextCollectCount
    };
    if (this.data.post) {
      optimisticUpdates['post.stats.collect'] = nextCollectCount;
    }
    this.setData(optimisticUpdates);

    wx.cloud.callFunction({
      name: 'toggleInteraction',
      data: {
        id: this.data.postId,
        collection: 'posts',
        type: 'collect'
      }
    }).then((res) => {
      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '操作失败');
      }
      const finalCollected = !!res.result.status;
      const finalCollectCount = Number.isFinite(Number(res.result.count))
        ? Math.max(0, Number(res.result.count))
        : nextCollectCount;
      const successUpdates = {
        isCollected: finalCollected,
        collectCount: finalCollectCount
      };
      if (this.data.post) {
        successUpdates['post.stats.collect'] = finalCollectCount;
      }
      this.setData(successUpdates);
      wx.showToast({
        title: finalCollected ? '收藏成功' : '已取消收藏',
        icon: 'success'
      });
    }).catch((err) => {
      console.error('收藏操作失败:', err);
      const rollbackUpdates = {
        isCollected: prevCollected,
        collectCount: prevCollectCount
      };
      if (this.data.post) {
        rollbackUpdates['post.stats.collect'] = prevCollectCount;
      }
      this.setData(rollbackUpdates);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }).finally(() => {
      this.releaseInteractionGuard(guardKey);
    });
  },

  toggleFollow() {
    if (!this.data.post) return;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const targetId = this.data.post._openid;
    const isFollowing = this.data.isFollowing;

    wx.showLoading({ title: '处理中...' });

    const promise = isFollowing 
      ? followUtil.unfollowUser(targetId)
      : followUtil.followUser(targetId);

    promise
      .then(() => {
        wx.hideLoading();
        this.setData({ isFollowing: !isFollowing });
        wx.showToast({ 
          title: isFollowing ? '已取消关注' : '关注成功', 
          icon: 'success' 
        });
      })
      .catch(err => {
        wx.hideLoading();
        console.error('操作失败:', err);
        wx.showToast({ 
          title: err.message || '操作失败', 
          icon: 'none' 
        });
      });
  },

  showCommentInput(e) {
    const replyToId = e.currentTarget.dataset.replyto || '';
    const replyToName = e.currentTarget.dataset.replyname || '';
    const placeholderText = replyToId ? `回复 ${replyToName}...` : '说点什么...';
    this.setData({
      replyToId,
      replyToName,
      placeholderText,
      isInputFocus: true
    });
  },

  onCommentInput(e) {
    this.setData({ newComment: e.detail.value });
  },

  resolveReplyParentId(replyToId) {
    const id = typeof replyToId === 'string' ? replyToId.trim() : '';
    if (!id) return '';
    const comments = this.data.comments || [];
    for (let i = 0; i < comments.length; i++) {
      const main = comments[i];
      if (!main) continue;
      if (main._id === id) return main._id;
      const replies = Array.isArray(main.replies) ? main.replies : [];
      for (let j = 0; j < replies.length; j++) {
        const reply = replies[j];
        if (reply && reply._id === id) {
          return main._id;
        }
      }
    }
    return id;
  },

  appendLocalComment(commentId, content, parentId, replyToId = '') {
    if (!commentId) return false;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    const userType = app.globalData.userType || wx.getStorageSync('userType') || 'CommunityWorker';
    const comment = {
      _id: commentId,
      _openid: openid,
      authorOpenid: openid,
      postId: this.data.postId,
      parentId: parentId || '',
      content,
      createTime: this.formatTime(Date.now()),
      isOwner: true,
      canDelete: true,
      likes: 0,
      likeCount: 0,
      liked: false,
      userInfo: {
        nickName: userInfo.nickName || '微信用户',
        avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
      },
      userType
    };

    const comments = Array.isArray(this.data.comments) ? this.data.comments.slice() : [];
    if (!parentId) {
      comment.replies = [];
      comments.unshift(comment);
      if (this._commentLikeCache) {
        this._commentLikeCache.set(commentId, false);
        this._commentLikeCacheAt = Date.now();
      }
      this.setData({ comments });
      return true;
    }

    let targetParentId = parentId || '';
    if (targetParentId) {
      const parentExists = comments.some((main) => main && main._id === targetParentId);
      if (!parentExists && replyToId) {
        for (let i = 0; i < comments.length; i++) {
          const main = comments[i];
          if (!main) continue;
          const replies = Array.isArray(main.replies) ? main.replies : [];
          if (replies.some((reply) => reply && reply._id === replyToId)) {
            targetParentId = main._id;
            break;
          }
        }
      }
    }
    comment.parentId = targetParentId || '';

    let attached = false;
    const nextComments = comments.map((main) => {
      if (!main || main._id !== targetParentId) return main;
      const replies = Array.isArray(main.replies) ? main.replies.slice() : [];
      replies.unshift(comment);
      attached = true;
      return Object.assign({}, main, { replies });
    });

    if (!attached) {
      comment.parentId = '';
      comment.replies = [];
      nextComments.unshift(comment);
    }
    if (this._commentLikeCache) {
      this._commentLikeCache.set(commentId, false);
      this._commentLikeCacheAt = Date.now();
    }
    this.setData({ comments: nextComments });
    return true;
  },

  removeLocalComment(commentId) {
    if (!commentId) return false;
    const comments = Array.isArray(this.data.comments) ? this.data.comments : [];
    if (!comments.length) return false;

    let touched = false;
    const nextComments = [];
    for (let i = 0; i < comments.length; i++) {
      const main = comments[i];
      if (!main) continue;
      if (main._id === commentId) {
        touched = true;
        continue;
      }
      const replies = Array.isArray(main.replies) ? main.replies : [];
      const nextReplies = replies.filter((item) => item && item._id !== commentId);
      if (nextReplies.length !== replies.length) {
        touched = true;
        nextComments.push(Object.assign({}, main, { replies: nextReplies }));
      } else {
        nextComments.push(main);
      }
    }

    if (!touched) return false;
    if (this._commentLikeCache) {
      this._commentLikeCache.delete(commentId);
      this._commentLikeCacheAt = Date.now();
    }
    this.setData({ comments: nextComments });
    return true;
  },

  onInputBlur() {
    setTimeout(() => {
    this.setData({ isInputFocus: false });
    }, 200);
  },

  submitComment() {
    const content = this.data.newComment.trim();
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const parentId = this.resolveReplyParentId(this.data.replyToId);
    wx.showLoading({ title: '发送中...' });
    wx.cloud.callFunction({
      name: 'createComment',
      data: {
        postId: this.data.postId,
        content,
        parentId,
        postTitle: (this.data.post && this.data.post.title) ? String(this.data.post.title).slice(0, 120) : ''
      }
    })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error((res.result && res.result.error) || '评论失败');
        }
        const appended = this.appendLocalComment(
          res.result.commentId,
          content,
          parentId,
          this.data.replyToId
        );
        if (this.data.post && Number.isFinite(Number(res.result.commentCount))) {
          const commentCount = Math.max(0, Number(res.result.commentCount));
          this._latestCommentCount = commentCount;
          this.setData({
            'post.stats.comment': commentCount
          });
        }
        wx.showToast({ title: '评论成功', icon: 'success' });
        this.setData({
          newComment: '',
          replyToId: '',
          replyToName: '',
          placeholderText: '说点什么...',
          isInputFocus: false
        });
        if (!appended) {
          this.scheduleCommentsReload(true);
        }
      })
      .catch(err => {
        console.error('评论失败:', err);
        wx.showToast({ title: '评论失败', icon: 'none' });
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  likeComment(e) {
    const { commentid } = e.currentTarget.dataset;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (!commentid) return;
    const guardKey = `comment-like:${commentid}`;
    if (!this.acquireInteractionGuard(guardKey)) return;

    wx.cloud.callFunction({
      name: 'toggleInteraction',
      data: {
        id: commentid,
        collection: 'comments',
        type: 'like'
      }
    }).then(res => {
      if (res.result && res.result.success) {
        if (!this._commentLikeCache) this._commentLikeCache = new Map();
        this._commentLikeCache.set(commentid, !!res.result.status);
        this._commentLikeCacheAt = Date.now();
        const patched = this.patchCommentLikeState(
          commentid,
          !!res.result.status,
          Number(res.result.count)
        );
        if (!patched) {
          this.scheduleCommentsReload(true);
        }
      }
    }).catch(err => {
      console.error('点赞评论失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }).finally(() => {
      this.releaseInteractionGuard(guardKey);
    });
  },

  deleteComment(e) {
    const { commentid } = e.currentTarget.dataset;
          wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评论吗？',
            success: (res) => {
              if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deleteComment',
            data: {
              commentId: commentid,
              postId: this.data.postId
            }
          }).then(res => {
            if (res.result && res.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              if (this.data.post && Number.isFinite(Number(res.result.commentCount))) {
                this._latestCommentCount = Math.max(0, Number(res.result.commentCount));
                this.setData({
                  'post.stats.comment': Math.max(0, Number(res.result.commentCount))
                });
              }
              const removed = this.removeLocalComment(commentid);
              if (!removed) {
                this.scheduleCommentsReload(true);
              }
        } else {
              throw new Error(res.result?.error || '删除失败');
            }
          }).catch(err => {
            console.error('删除评论失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }).finally(() => {
            wx.hideLoading();
          });
        }
      }
    });
  },

  deletePost() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这篇帖子吗？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deletePost',
            data: { postId: this.data.postId }
          }).then(res => {
            if (res.result && res.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 1500);
            } else {
              throw new Error(res.result?.error || '删除失败');
            }
          }).catch(err => {
            console.error('删除帖子失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }).finally(() => {
            wx.hideLoading();
          });
        }
      }
    });
  },

  previewImage(e) {
    const { current, urls } = e.currentTarget.dataset;
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  sharePost() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  navigateToProfile(e) {
    const openid = e.currentTarget.dataset.id;
    if (openid) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${openid}`
      });
    }
  },

  navigateToUserProfile(e) {
    const openid = e.currentTarget.dataset.openid;
    if (openid) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${openid}`
      });
    }
  },

  verifyIssue() {
    checkAndExecute(['Designer', 'ConstructionTeam', 'Government'], () => {
      wx.showModal({
        title: '核实问题',
        content: '确认该问题真实存在吗？',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '核实中...' });
            wx.cloud.callFunction({
              name: 'verifyIssue',
              data: { postId: this.data.postId }
            }).then(res => {
              if (res.result && res.result.success) {
                wx.showToast({ title: '核实成功', icon: 'success' });
                this.loadPostDetail();
              } else {
                throw new Error(res.result?.error || '核实失败');
              }
            }).catch(err => {
              console.error('核实失败:', err);
              wx.showToast({ title: '核实失败', icon: 'none' });
            }).finally(() => {
              wx.hideLoading();
            });
          }
        }
      });
    });
  },

  createDesignSolution() {
    checkAndExecute(['Designer'], () => {
      this.safeNavigateTo(`/pages/design/solution/create?postId=${this.data.postId}`);
    });
  },

  submitQuote() {
    checkAndExecute(['ConstructionTeam'], () => {
      this.safeNavigateTo(`/pages/project/create/index?postId=${this.data.postId}`);
    });
  },

  viewUserContact() {
    checkAndExecute(['Government'], () => {
      wx.showLoading({ title: '加载中...' });
      wx.cloud.callFunction({
        name: 'getUserContact',
        data: { targetId: this.data.post._openid }
      }).then(res => {
        if (res.result && res.result.success) {
          const contact = res.result.data;
          wx.showModal({
            title: '用户联系方式',
            content: `电话：${contact.phoneNumber || '未填写'}\n微信：${contact.wechat || '未填写'}`,
            showCancel: false
          });
        } else {
          throw new Error(res.result?.error || '获取失败');
        }
      }).catch(err => {
        console.error('获取联系方式失败:', err);
        wx.showToast({ title: '获取失败', icon: 'none' });
      }).finally(() => {
        wx.hideLoading();
        });
      });
  },

  formatTime(date) {
    if (!date) return '';
    
    let target;
    if (date instanceof Date) {
      target = date;
    } else if (typeof date === 'number') {
      target = new Date(date);
    } else if (typeof date === 'string') {
      target = new Date(date);
    } else if (date.$date) {
      target = new Date(date.$date);
    } else {
      return '';
    }

    const now = new Date();
    const diff = now - target;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    
    if (year === now.getFullYear()) {
      return `${month}-${day}`;
    }
    return `${year}-${month}-${day}`;
  },

  onShareAppMessage() {
    return {
      title: this.data.post?.content || '查看帖子详情',
      path: `/pages/post-detail/index?id=${this.data.postId}`,
      imageUrl: this.data.post?.images?.[0] || ''
    };
  },

  onShareTimeline() {
    return {
      title: this.data.post?.content || '查看帖子详情',
      query: `id=${this.data.postId}`,
      imageUrl: this.data.post?.images?.[0] || ''
    };
  }
});
