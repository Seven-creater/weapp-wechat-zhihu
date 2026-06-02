function startTrace(functionName, extra = {}) {
  return {
    functionName: String(functionName || 'unknown'),
    startedAt: Date.now(),
    extra: extra || {}
  };
}

function endTrace(trace, result = {}, extra = {}) {
  const durationMs = Date.now() - trace.startedAt;
  const payloadBytes = estimateJsonBytes(result);
  console.log('[perf]', JSON.stringify({
    function: trace.functionName,
    durationMs,
    payloadBytes,
    ...trace.extra,
    ...extra
  }));
  return result;
}

function failTrace(trace, err, extra = {}) {
  const durationMs = Date.now() - trace.startedAt;
  console.warn('[perf-error]', JSON.stringify({
    function: trace.functionName,
    durationMs,
    error: sanitizeError(err),
    ...trace.extra,
    ...extra
  }));
}

function estimateJsonBytes(value) {
  try {
    return JSON.stringify(value || {}).length;
  } catch (err) {
    return 0;
  }
}

function sanitizeError(err) {
  if (!err) return 'unknown';
  const msg = typeof err.message === 'string' ? err.message : String(err);
  return msg.slice(0, 200);
}

module.exports = {
  startTrace,
  endTrace,
  failTrace,
  estimateJsonBytes
};
