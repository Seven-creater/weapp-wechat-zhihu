function validateString(value, { name = 'value', required = false, min = 0, max = 2000 } = {}) {
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: `${name} must be string` };
  }

  const text = value.trim();
  if (required && !text) {
    return { ok: false, error: `missing ${name}` };
  }
  if (text.length < min) {
    return { ok: false, error: `${name} too short` };
  }
  if (text.length > max) {
    return { ok: false, error: `${name} too long` };
  }

  return { ok: true, value: text };
}

function validateEnum(value, allowed, { name = 'value', required = false } = {}) {
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }
  if (!Array.isArray(allowed) || !allowed.includes(value)) {
    return { ok: false, error: `invalid ${name}` };
  }
  return { ok: true, value };
}

function validateIdList(list, { name = 'ids', maxSize = 50 } = {}) {
  if (!Array.isArray(list)) {
    return { ok: false, error: `${name} must be array` };
  }
  const ids = Array.from(new Set(
    list
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, maxSize)
  ));
  return { ok: true, value: ids };
}

module.exports = {
  validateString,
  validateEnum,
  validateIdList
};
