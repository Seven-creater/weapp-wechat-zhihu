const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[createComment] shared validate unavailable');
}

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  const { name = 'value', required = false, min = 0, max = 2000 } = options;
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') return { ok: false, error: `${name} must be string` };
  const text = value.trim();
  if (required && !text) return { ok: false, error: `missing ${name}` };
  if (text.length < min) return { ok: false, error: `${name} too short` };
  if (text.length > max) return { ok: false, error: `${name} too long` };
  return { ok: true, value: text };
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function normalizeUserInfo(userInfo) {
  return {
    nickName: toSafeString(userInfo && userInfo.nickName, 64) || '微信用户',
    avatarUrl: toSafeString(userInfo && userInfo.avatarUrl, 1024) || '/images/zhi.png'
  };
}

async function fetchUserProfile(openid) {
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .field({ userType: true, userInfo: true })
    .limit(1)
    .get();
  const user = userRes.data && userRes.data[0];
  return {
    userType: (user && user.userType) || 'CommunityWorker',
    userInfo: normalizeUserInfo(user && user.userInfo)
  };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, error: 'unauthorized' };
  }

  const postIdCheck = validateString(event.postId, {
    name: 'postId',
    required: true,
    min: 8,
    max: 64
  });
  if (!postIdCheck.ok) return { success: false, error: postIdCheck.error };

  const contentCheck = validateString(event.content, {
    name: 'content',
    required: true,
    min: 1,
    max: 1000
  });
  if (!contentCheck.ok) return { success: false, error: contentCheck.error };

  const parentIdCheck = validateString(event.parentId, {
    name: 'parentId',
    required: false,
    min: 8,
    max: 64
  });
  if (!parentIdCheck.ok) return { success: false, error: parentIdCheck.error };

  const postTitleCheck = validateString(event.postTitle, {
    name: 'postTitle',
    required: false,
    max: 120
  });
  if (!postTitleCheck.ok) return { success: false, error: postTitleCheck.error };

  const postId = postIdCheck.value;
  const content = contentCheck.value;
  const parentId = parentIdCheck.value || null;
  const postTitle = postTitleCheck.value || '';

  try {
    const postRes = await db.collection('posts')
      .doc(postId)
      .field({ _id: true })
      .get();
    if (!postRes.data || !postRes.data._id) {
      return { success: false, error: 'post not found' };
    }

    if (parentId) {
      const parentRes = await db.collection('comments')
        .doc(parentId)
        .field({ _id: true, postId: true })
        .get();
      const parent = parentRes.data;
      if (!parent || parent.postId !== postId) {
        return { success: false, error: 'invalid parentId' };
      }
    }

    const userProfile = await fetchUserProfile(OPENID);
    const commentData = {
      postId,
      content,
      parentId,
      authorOpenid: OPENID,
      userInfo: userProfile.userInfo,
      userType: userProfile.userType,
      likes: 0,
      likeCount: 0,
      createTime: db.serverDate()
    };
    if (postTitle) {
      commentData.postTitle = postTitle;
    }

    const addRes = await db.collection('comments').add({
      data: commentData
    });

    const countRes = await db.collection('comments')
      .where({ postId })
      .count();
    const commentCount = Math.max(0, countRes.total || 0);

    await db.collection('posts').doc(postId).update({
      data: {
        'stats.comment': commentCount
      }
    });

    return {
      success: true,
      commentId: addRes._id,
      commentCount
    };
  } catch (err) {
    console.error('[createComment] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : 'create comment failed'
    };
  }
};
