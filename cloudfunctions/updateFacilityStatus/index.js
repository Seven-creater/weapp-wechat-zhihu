// 云函数：updateFacilityStatus
// 更新无障碍设施状态
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const {
      facilityId,
      newStatus,
      images,
      notes
    } = event;

    // 1. 验证必填参数
    if (!facilityId || !newStatus) {
      return {
        success: false,
        error: '缺少必填参数'
      };
    }

    // 2. 验证状态
    const validStatuses = ['accessible', 'blocked', 'maintenance', 'occupied'];
    if (!validStatuses.includes(newStatus)) {
      return {
        success: false,
        error: '无效的状态'
      };
    }

    // 3. 获取设施信息
    const facilityRes = await db.collection('facilities').doc(facilityId).get();
    if (!facilityRes.data) {
      return {
        success: false,
        error: '设施不存在'
      };
    }

    const facility = facilityRes.data;

    // 4. 获取用户信息
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userRes.data[0];
    const userType = user.userType || 'normal';
    const userInfo = user.userInfo || {};

    // 5. 权限检查
    const canUpdate = 
      userType === 'communityWorker' || // 社区工作者可以修改所有
      (userType === 'designer' && facility._openid === openid) || // 设计者可以修改自己的
      (userType === 'normal' && facility._openid === openid); // 普通用户可以修改自己的

    if (!canUpdate) {
      return {
        success: false,
        error: '无权限修改此设施'
      };
    }

    // 6. 构建状态历史记录
    const now = new Date().toISOString();
    const statusRecord = {
      status: newStatus,
      updateTime: now,
      updateBy: openid,
      updateByName: userInfo.nickName || '用户',
      updateByRole: userType,
      images: images || [],
      notes: notes || ''
    };

    // 7. 更新设施状态
    await db.collection('facilities').doc(facilityId).update({
      data: {
        status: newStatus,
        statusHistory: _.push(statusRecord),
        images: images || facility.images, // 如果有新图片，更新主图片
        lastUpdateTime: db.serverDate(),
        lastUpdateBy: openid,
        verified: userType === 'communityWorker' ? true : facility.verified // 社区工作者更新后自动验证
      }
    });

    console.log('✅ 设施状态已更新:', facilityId, '新状态:', newStatus);

    return {
      success: true,
      message: '状态更新成功',
      data: {
        facilityId: facilityId,
        newStatus: newStatus,
        updateTime: now
      }
    };

  } catch (err) {
    console.error('更新设施状态失败:', err);
    return {
      success: false,
      error: err.message || '更新失败，请稍后重试'
    };
  }
};

