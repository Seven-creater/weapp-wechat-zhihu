const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function fail(error) {
  return { success: false, error: toFriendlyError(error) };
}

function toFriendlyError(error) {
  if (error === 'unauthorized') return '请先登录';
  if (error === 'user not found') return '用户不存在，请先完成注册';
  if (error === 'pending application exists') return '您已有待审核的申请，请等待审核结果';
  if (error === 'submit certification failed') return '提交失败，请稍后重试';
  if (typeof error === 'string' && error.startsWith('missing ')) return '请填写完整的认证信息';
  if (typeof error === 'string' && error.endsWith(' must be string')) return '认证信息格式错误';
  if (typeof error === 'string' && error.endsWith(' too long')) return '认证信息过长';
  return error || '提交失败，请稍后重试';
}

function safeString(value, options = {}) {
  const { name = 'value', required = false, max = 80 } = options;
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') return { ok: false, error: `${name} must be string` };
  const text = value.trim();
  if (required && !text) return { ok: false, error: `missing ${name}` };
  if (text.length > max) return { ok: false, error: `${name} too long` };
  return { ok: true, value: text };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail('unauthorized');

  try {
    const communityCheck = safeString(event.community, {
      name: 'community',
      required: true,
      max: 32
    });
    if (!communityCheck.ok) return fail(communityCheck.error);

    const positionCheck = safeString(event.position, {
      name: 'position',
      required: true,
      max: 40
    });
    if (!positionCheck.ok) return fail(positionCheck.error);

    const workIdCheck = safeString(event.workId, {
      name: 'workId',
      required: true,
      max: 40
    });
    if (!workIdCheck.ok) return fail(workIdCheck.error);

    const userQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .field({
        _id: true,
        certificationApplication: true
      })
      .limit(1)
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      return fail('user not found');
    }

    const user = userQuery.data[0];
    if (user.certificationApplication && user.certificationApplication.status === 'pending') {
      return fail('pending application exists');
    }

    const certificationInfo = {
      community: communityCheck.value,
      position: positionCheck.value,
      workId: workIdCheck.value
    };

    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          certificationApplication: {
            type: 'communityWorker',
            info: certificationInfo,
            community: certificationInfo.community,
            position: certificationInfo.position,
            workId: certificationInfo.workId,
            status: 'pending',
            applyTime: Date.now(),
            reviewTime: null,
            reviewerId: null,
            rejectReason: null
          },
          updateTime: db.serverDate()
        }
      });

    console.log('[security] event logged');
    return {
      success: true,
      message: '认证申请已提交，请等待审核'
    };
  } catch (err) {
    console.error('[applyCommunityWorkerCertification] failed:', err && err.message ? err.message : err);
    return fail('submit certification failed');
  }
};
