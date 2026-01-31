// 云函数：removeGovCertification
// 移除政府用户身份
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 🔐 管理员 openid 列表
const ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ'  // 你的管理员账号
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;

  try {
    const { userOpenid } = event;

    // 验证参数
    if (!userOpenid) {
      return {
        success: false,
        error: '参数错误：缺少用户openid'
      };
    }

    console.log('🔍 准备移除政府身份，用户openid:', userOpenid);

    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(adminOpenid)) {
      return {
        success: false,
        error: '权限不足，仅管理员可以移除政府身份'
      };
    }

    // 🔧 先尝试用 openid 查询
    let userQuery = await db.collection('users')
      .where({
        openid: userOpenid
      })
      .get();

    console.log('📊 查询结果（openid）:', userQuery.data.length, '条记录');

    // 🔧 如果没找到，尝试用 _openid 查询
    if (!userQuery.data || userQuery.data.length === 0) {
      console.log('🔍 尝试用 _openid 查询...');
      userQuery = await db.collection('users')
        .where({
          _openid: userOpenid
        })
        .get();
      
      console.log('📊 查询结果（_openid）:', userQuery.data.length, '条记录');
    }

    if (!userQuery.data || userQuery.data.length === 0) {
      console.error('❌ 用户不存在，openid:', userOpenid);
      return {
        success: false,
        error: '用户不存在，请确认该用户已完成注册'
      };
    }

    const user = userQuery.data[0];
    console.log('✅ 找到用户:', user.nickName, '当前身份:', user.userType);

    // 检查是否是政府用户
    if (user.userType !== 'government') {
      return {
        success: false,
        error: `该用户当前身份是"${user.userType}"，不是政府用户`
      };
    }

    // 🔧 更新用户身份为普通用户（同时更新徽章）
    const updatePromises = [];
    
    // 🆕 普通用户的徽章配置
    const normalBadge = {
      color: '#6B7280',
      icon: '👤',
      text: '用户'
    };
    
    // 尝试用 openid 更新
    updatePromises.push(
      db.collection('users')
        .where({ openid: userOpenid })
        .update({
          data: {
            userType: 'normal',
            badge: normalBadge,  // 🔧 同步更新徽章
            userTypeLabel: '用户',  // 🔧 更新类型标签
            'profile.certificationStatus': 'removed',
            certificationRemovedTime: Date.now(),
            certificationRemovedBy: adminOpenid
          }
        })
    );

    // 尝试用 _openid 更新
    updatePromises.push(
      db.collection('users')
        .where({ _openid: userOpenid })
        .update({
          data: {
            userType: 'normal',
            badge: normalBadge,  // 🔧 同步更新徽章
            userTypeLabel: '用户',  // 🔧 更新类型标签
            'profile.certificationStatus': 'removed',
            certificationRemovedTime: Date.now(),
            certificationRemovedBy: adminOpenid
          }
        })
    );

    await Promise.all(updatePromises);
    console.log('✅ 用户身份已更新为普通用户，徽章已同步更新');

    // 更新认证申请记录状态
    await db.collection('gov_certifications')
      .where({
        openid: userOpenid,
        status: 'approved'
      })
      .update({
        data: {
          status: 'removed',
          removeTime: Date.now(),
          removedBy: adminOpenid
        }
      });

    console.log('✅ 认证记录已更新');
    console.log('✅ 已成功移除政府身份:', userOpenid);

    return {
      success: true,
      message: '已成功移除政府身份'
    };

  } catch (err) {
    console.error('移除政府身份失败:', err);
    return {
      success: false,
      error: err.message || '操作失败，请稍后重试'
    };
  }
};

