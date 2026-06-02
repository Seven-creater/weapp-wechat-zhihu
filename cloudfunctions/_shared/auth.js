function parseOpenidsFromEnv() {
  const value = process.env.SUPER_ADMIN_OPENIDS || '';
  if (!value || typeof value !== 'string') return [];
  return Array.from(new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function maskOpenid(openid) {
  if (typeof openid !== 'string' || openid.length < 8) return 'unknown';
  return `${openid.slice(0, 3)}***${openid.slice(-3)}`;
}

async function isAdmin({ db, openid }) {
  if (!db || !openid) return false;

  const superAdmins = parseOpenidsFromEnv();
  if (superAdmins.includes(openid)) {
    return true;
  }

  const userQuery = await db.collection('users')
    .where({ _openid: openid })
    .field({ isAdmin: true, permissions: true })
    .limit(1)
    .get();

  const user = userQuery.data && userQuery.data[0];
  if (!user) return false;

  return user.isAdmin === true ||
    !!(user.permissions && user.permissions.canManageUsers === true);
}

async function assertAdmin({ db, openid, contextName = 'admin-check' }) {
  const ok = await isAdmin({ db, openid });
  if (ok) return true;
  console.warn(`[${contextName}] denied for ${maskOpenid(openid)}`);
  return false;
}

module.exports = {
  isAdmin,
  assertAdmin,
  maskOpenid
};
