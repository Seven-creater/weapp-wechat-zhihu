// 云函数：reviewGovCertification
// 审核政府用户认证申请
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 🔐 管理员 openid 列表
const ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ'  // 你的管理员账号（正确的 openid）
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const reviewerOpenid = wxContext.OPENID;

  try {
    const { applicationId, status, rejectReason } = event;

    // 验证参数
    if (!applicationId || !status) {
      return {
        success: false,
        error: '参数错误'
      };
    }

    if (!['approved', 'rejected'].includes(status)) {
      return {
        success: false,
        error: '状态参数错误'
      };
    }

    if (status === 'rejected' && !rejectReason) {
      return {
        success: false,
        error: '拒绝时必须填写原因'
      };
    }

    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(reviewerOpenid)) {
      return {
        success: false,
        error: '权限不足，仅管理员可以审核认证申请'
      };
    }

    // 获取申请信息
    const application = await db.collection('gov_certifications')
      .doc(applicationId)
      .get();

    if (!application.data) {
      return {
        success: false,
        error: '申请不存在'
      };
    }

    if (application.data.status !== 'pending') {
      return {
        success: false,
        error: '该申请已被审核'
      };
    }

    // 更新申请状态
    await db.collection('gov_certifications')
      .doc(applicationId)
      .update({
        data: {
          status: status,
          reviewTime: Date.now(),
          reviewerId: reviewerOpenid,
          rejectReason: status === 'rejected' ? rejectReason : null
        }
      });

    // 如果审核通过，更新用户信息
    if (status === 'approved') {
      const userOpenid = application.data.openid;
      
      console.log('🔍 准备更新用户身份，openid:', userOpenid);
      
      // 🔧 政府用户徽章配置
      const govBadge = {
        color: '#EF4444',
        icon: '🔴',
        text: '政府'
      };
      
      // 🔧 先尝试用 openid 查询
      let userQuery = await db.collection('users')
        .where({
          openid: userOpenid
        })
        .get();

      console.log('📊 查询用户结果（openid）:', userQuery.data.length, '条记录');

      // 🔧 如果没找到，尝试用 _openid 查询
      if (!userQuery.data || userQuery.data.length === 0) {
        console.log('🔍 尝试用 _openid 查询...');
        userQuery = await db.collection('users')
          .where({
            _openid: userOpenid
          })
          .get();
        
        console.log('📊 查询用户结果（_openid）:', userQuery.data.length, '条记录');
      }

      if (userQuery.data && userQuery.data.length > 0) {
        const user = userQuery.data[0];
        console.log('✅ 找到用户:', user.nickName, '当前身份:', user.userType);
        
        // 🔧 准备更新数据
        const updateData = {
          userType: 'government',
          badge: govBadge,  // 🔥 同时设置徽章
          userTypeLabel: '政府',  // 🔧 设置类型标签
          'profile.department': application.data.department,
          'profile.position': application.data.position,
          'profile.workId': application.data.workId,
          'profile.certificationStatus': 'approved',
          certificationTime: Date.now()
        };
        
        console.log('📝 准备更新数据:', updateData);
        
        // 🔧 同时尝试两种字段更新
        const updatePromises = [];
        
        // 尝试用 openid 更新
        updatePromises.push(
          db.collection('users')
            .where({ openid: userOpenid })
            .update({
              data: updateData
            })
            .then(res => {
              console.log('📝 更新结果（openid）:', res);
              return res;
            })
            .catch(err => {
              console.log('⚠️ 更新失败（openid）:', err.message);
              return null;
            })
        );
        
        // 尝试用 _openid 更新
        updatePromises.push(
          db.collection('users')
            .where({ _openid: userOpenid })
            .update({
              data: updateData
            })
            .then(res => {
              console.log('📝 更新结果（_openid）:', res);
              return res;
            })
            .catch(err => {
              console.log('⚠️ 更新失败（_openid）:', err.message);
              return null;
            })
        );
        
        const results = await Promise.all(updatePromises);
        const successCount = results.filter(r => r && r.stats && r.stats.updated > 0).length;
        
        console.log('✅ 更新完成，成功:', successCount, '个');
        
        if (successCount === 0) {
          console.error('❌ 所有更新都失败了');
          return {
            success: false,
            error: '更新用户身份失败，请检查数据库权限'
          };
        }
        
        console.log('✅ 用户身份已更新为政府用户:', userOpenid);
      } else {
        console.error('❌ 用户不存在:', userOpenid);
        return {
          success: false,
          error: '用户不存在，无法更新身份。请确认该用户已完成注册。'
        };
      }
    }

    return {
      success: true,
      message: status === 'approved' ? '审核通过' : '已拒绝申请'
    };

  } catch (err) {
    console.error('审核失败:', err);
    return {
      success: false,
      error: err.message || '审核失败，请稍后重试'
    };
  }
};

