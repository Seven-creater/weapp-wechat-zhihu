const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return fail('unauthorized');
  }

  try {
    const userRes = await db.collection('users')
      .where({ _openid: OPENID })
      .field({
        userType: true,
        isAdmin: true,
        permissions: true
      })
      .limit(1)
      .get();

    const user = Array.isArray(userRes.data) ? userRes.data[0] : null;
    const permissions = user && user.permissions ? user.permissions : {};
    const canManageUsers = user && (user.isAdmin === true || permissions.canManageUsers === true);
    const canViewUserContact = canManageUsers || permissions.canViewUserContact === true;

    return {
      success: true,
      data: {
        userType: user && user.userType ? user.userType : 'normal',
        isAdmin: !!canManageUsers,
        canManageUsers: !!canManageUsers,
        canViewUserContact: !!canViewUserContact
      }
    };
  } catch (err) {
    console.error('[getCurrentUserAccess] failed:', err && err.message ? err.message : err);
    return fail('query failed');
  }
};

function fail(error) {
  return {
    success: false,
    error
  };
}
