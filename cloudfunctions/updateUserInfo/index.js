const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const USER_TYPE_NORMAL = 'normal';
const MAX_NICKNAME_LEN = 20;
const MAX_PROFILE_KEYS = 50;
const MAX_PROFILE_STRING_LEN = 500;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

const USER_TYPE_CONFIG = {
  normal: {
    badge: { color: '#6B7280', icon: 'U', text: 'User' },
    permissions: {
      canVerifyIssue: false,
      canCreateProject: false,
      canPublishPolicy: false,
      canProvideConsultation: false,
      canDesignSolution: false,
      canUpdateProgress: false,
      canViewUserContact: false
    }
  },
  designer: {
    badge: { color: '#10B981', icon: 'D', text: 'Designer' },
    permissions: {
      canVerifyIssue: true,
      canCreateProject: false,
      canPublishPolicy: false,
      canProvideConsultation: true,
      canDesignSolution: true,
      canUpdateProgress: false,
      canViewUserContact: false
    }
  },
  contractor: {
    badge: { color: '#3B82F6', icon: 'C', text: 'Contractor' },
    permissions: {
      canVerifyIssue: true,
      canCreateProject: true,
      canPublishPolicy: false,
      canProvideConsultation: true,
      canDesignSolution: false,
      canUpdateProgress: true,
      canViewUserContact: false
    }
  },
  communityWorker: {
    badge: { color: '#EF4444', icon: 'W', text: 'Community Worker' },
    permissions: {
      canVerifyIssue: true,
      canCreateProject: true,
      canPublishPolicy: true,
      canProvideConsultation: true,
      canDesignSolution: false,
      canUpdateProgress: false,
      canViewUserContact: true
    }
  }
};

const ALLOWED_USER_TYPES = new Set(Object.keys(USER_TYPE_CONFIG));

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const {
    nickName,
    avatarUrl,
    phoneNumber,
    userType,
    profile
  } = event;

  try {
    const userQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    const existingUser = Array.isArray(userQuery.data) && userQuery.data.length > 0
      ? userQuery.data[0]
      : null;

    const normalizedNickName = safeTrim(nickName);
    if (!normalizedNickName && !(existingUser && existingUser.userInfo && safeTrim(existingUser.userInfo.nickName))) {
      return {
        success: false,
        error: 'nickName is required'
      };
    }
    if (normalizedNickName && normalizedNickName.length > MAX_NICKNAME_LEN) {
      return {
        success: false,
        error: `nickName too long (max ${MAX_NICKNAME_LEN})`
      };
    }

    const normalizedPhoneNumber = safeTrim(phoneNumber);
    if (normalizedPhoneNumber && !PHONE_PATTERN.test(normalizedPhoneNumber)) {
      return {
        success: false,
        error: 'invalid phoneNumber'
      };
    }
    if (!existingUser && !normalizedPhoneNumber) {
      return {
        success: false,
        error: 'phoneNumber is required for new user'
      };
    }

    const normalizedRequestedType = normalizeUserType(userType);
    const existingUserTypeRaw = safeTrim(existingUser && existingUser.userType);
    const normalizedExistingType = normalizeUserType(existingUserTypeRaw);
    const isExistingTypeInvalid = !!(
      existingUser &&
      existingUserTypeRaw &&
      !ALLOWED_USER_TYPES.has(existingUserTypeRaw)
    );
    const isSameTypeRefresh = !!(existingUser && userType && normalizedRequestedType === normalizedExistingType);
    const isDowngradeToNormal = !!(
      existingUser &&
      userType &&
      normalizedRequestedType === USER_TYPE_NORMAL &&
      normalizedExistingType !== USER_TYPE_NORMAL
    );

    if (existingUser && userType && !isSameTypeRefresh && !isDowngradeToNormal) {
      return {
        success: false,
        error: 'userType update is not allowed'
      };
    }

    const finalTypeId = existingUser
      ? (isDowngradeToNormal ? USER_TYPE_NORMAL : normalizedExistingType)
      : USER_TYPE_NORMAL;
    const finalTypeConfig = USER_TYPE_CONFIG[finalTypeId] || USER_TYPE_CONFIG[USER_TYPE_NORMAL];

    const existingUserInfo = (existingUser && existingUser.userInfo) || {};
    const finalNickName = normalizedNickName || safeTrim(existingUserInfo.nickName) || 'User';
    const finalAvatarUrl = safeTrim(avatarUrl) || safeTrim(existingUserInfo.avatarUrl) || '/images/zhi.png';
    const finalPhoneNumber = normalizedPhoneNumber || safeTrim(existingUser && existingUser.phoneNumber);

    const publicUserInfo = {
      nickName: finalNickName,
      avatarUrl: finalAvatarUrl
    };

    const profileResult = sanitizeProfile(profile);
    if (!profileResult.ok) {
      return {
        success: false,
        error: profileResult.error
      };
    }

    if (existingUser) {
      const updateData = {
        userInfo: publicUserInfo,
        updateTime: db.serverDate()
      };

      const shouldWriteTypeFields = isDowngradeToNormal ||
        isExistingTypeInvalid ||
        !existingUser.userType ||
        !existingUser.permissions;
      if (shouldWriteTypeFields) {
        updateData.userType = finalTypeId;
        updateData.userTypeLabel = finalTypeConfig.badge.text;
        updateData.badge = finalTypeConfig.badge;
        updateData.permissions = finalTypeConfig.permissions;
      }

      if (normalizedPhoneNumber) {
        updateData.phoneNumber = finalPhoneNumber;
      }

      if (profileResult.present) {
        updateData.profile = profileResult.value;
      }

      await db.collection('users').doc(existingUser._id).update({
        data: updateData
      });

      const actualUserType = updateData.userType || normalizedExistingType || USER_TYPE_NORMAL;
      const actualBadge = updateData.badge ||
        existingUser.badge ||
        (USER_TYPE_CONFIG[actualUserType] && USER_TYPE_CONFIG[actualUserType].badge) ||
        USER_TYPE_CONFIG[USER_TYPE_NORMAL].badge;

      return {
        success: true,
        userInfo: publicUserInfo,
        userType: actualUserType,
        badge: actualBadge
      };
    }

    await db.collection('users').add({
      data: {
        _openid: OPENID,
        userInfo: publicUserInfo,
        phoneNumber: finalPhoneNumber,
        userType: finalTypeId,
        userTypeLabel: finalTypeConfig.badge.text,
        badge: finalTypeConfig.badge,
        permissions: finalTypeConfig.permissions,
        profile: profileResult.present ? profileResult.value : {},
        stats: {
          followingCount: 0,
          followersCount: 0,
          likesCount: 0
        },
        reputation: {
          rating: 5,
          reviewCount: 0,
          completedTasks: 0,
          helpfulCount: 0,
          responseRate: 100,
          responseTime: 0
        },
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    return {
      success: true,
      userInfo: publicUserInfo,
      userType: finalTypeId,
      badge: finalTypeConfig.badge
    };
  } catch (err) {
    console.error('[updateUserInfo] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : 'update failed'
    };
  }
};

function normalizeUserType(input) {
  if (typeof input !== 'string') return USER_TYPE_NORMAL;
  const value = input.trim();
  if (!value) return USER_TYPE_NORMAL;
  return ALLOWED_USER_TYPES.has(value) ? value : USER_TYPE_NORMAL;
}

function sanitizeProfile(input) {
  if (typeof input === 'undefined') {
    return { ok: true, present: false, value: {} };
  }
  if (!isPlainObject(input)) {
    return { ok: false, error: 'invalid profile' };
  }

  const entries = Object.entries(input);
  if (entries.length > MAX_PROFILE_KEYS) {
    return { ok: false, error: 'too many profile fields' };
  }

  const output = {};
  for (const [rawKey, rawValue] of entries) {
    const key = safeTrim(rawKey);
    if (!key) continue;
    if (key.length > 64) {
      return { ok: false, error: 'profile field key too long' };
    }

    if (typeof rawValue === 'string') {
      output[key] = rawValue.trim().slice(0, MAX_PROFILE_STRING_LEN);
      continue;
    }

    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      output[key] = rawValue;
      continue;
    }

    if (rawValue === null) {
      output[key] = null;
      continue;
    }

    if (Array.isArray(rawValue)) {
      output[key] = rawValue.slice(0, 20).map((item) => normalizeArrayItem(item));
      continue;
    }

    if (isPlainObject(rawValue)) {
      output[key] = sanitizeNestedObject(rawValue);
      continue;
    }

    return { ok: false, error: `unsupported profile field: ${key}` };
  }

  return { ok: true, present: true, value: output };
}

function sanitizeNestedObject(value) {
  const result = {};
  Object.keys(value).slice(0, 20).forEach((k) => {
    const key = safeTrim(k);
    if (!key) return;
    const item = value[k];
    if (typeof item === 'string') {
      result[key] = item.trim().slice(0, MAX_PROFILE_STRING_LEN);
      return;
    }
    if (typeof item === 'number' || typeof item === 'boolean' || item === null) {
      result[key] = item;
      return;
    }
    result[key] = String(item).slice(0, MAX_PROFILE_STRING_LEN);
  });
  return result;
}

function normalizeArrayItem(item) {
  if (typeof item === 'string') return item.trim().slice(0, MAX_PROFILE_STRING_LEN);
  if (typeof item === 'number' || typeof item === 'boolean' || item === null) return item;
  return String(item).slice(0, MAX_PROFILE_STRING_LEN);
}

function safeTrim(input) {
  if (typeof input !== 'string') return '';
  return input.trim();
}

function isPlainObject(input) {
  return Object.prototype.toString.call(input) === '[object Object]';
}
