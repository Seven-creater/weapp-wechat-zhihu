// 云函数：getCertificationApplications
// 获取所有角色的认证申请列表（管理员使用）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 🔐 超级管理员列表（硬编码）
const SUPER_ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',
  'oOJhu3T9Us9TAnibhfctmyRw2Urc'
];

/**
 * 检查是否是管理员
 */
async function isAdmin(openid) {
  // 1. 首先检查是否是超级管理员
  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    console.log('✅ 超级管理员权限验证通过:', openid);
    return true;
  }

  // 2. 检查数据库中的管理员标识
  try {
    const userQuery = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();

    if (userQuery.data && userQuery.data.length > 0) {
      const user = userQuery.data[0];
      
      if (user.isAdmin === true || 
          (user.permissions && user.permissions.canManageUsers === true)) {
        console.log('✅ 数据库管理员权限验证通过:', openid);
        return true;
      }
    }
  } catch (err) {
    console.error('查询管理员权限失败:', err);
  }

  console.log('❌ 管理员权限验证失败:', openid);
  return false;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // ✅ 验证管理员权限（混合检查：硬编码 + 数据库）
    const hasAdminPermission = await isAdmin(openid);
    if (!hasAdminPermission) {
      return {
        success: false,
        error: '权限不足，仅管理员可以查看认证申请'
      };
    }

    const { status = 'pending', page = 1, pageSize = 20, userType } = event;

    // 构建查询条件
    let query = {
      'certificationApplication.status': status
    };

    // 如果指定了用户类型，添加过滤
    if (userType && ['designer', 'contractor', 'communityWorker'].includes(userType)) {
      query['certificationApplication.type'] = userType;
    }

    // 查询认证申请
    const result = await db.collection('users')
      .where(query)
      .orderBy('certificationApplication.applyTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    // 格式化数据
    const applications = result.data.map(user => {
      const app = user.certificationApplication || {};
      const info = app.info || {};
      
      // ✅ 根据不同角色提取对应的认证信息
      let certData = {
        _id: user._id,
        openid: user._openid,
        nickName: user.userInfo?.nickName || '未知用户',
        avatarUrl: user.userInfo?.avatarUrl || '',
        phoneNumber: user.phoneNumber || '', // ✅ 添加电话号码
        userType: app.type,
        userTypeLabel: app.type === 'designer' ? '设计者' : 
                       app.type === 'contractor' ? '施工方' : 
                       app.type === 'communityWorker' ? '社区工作者' : '未知',
        status: app.status,
        applyTime: app.applyTime,
        reviewTime: app.reviewTime,
        rejectReason: app.rejectReason
      };
      
      // ✅ 根据角色类型展开认证信息到顶层
      if (app.type === 'communityWorker') {
        certData.community = info.community || '';
        certData.position = info.position || '';
        certData.workId = info.workId || '';
      } else if (app.type === 'designer') {
        certData.organization = info.organization || '';
        certData.title = info.title || '';
        certData.expertise = info.expertise || '';
      } else if (app.type === 'contractor') {
        certData.companyName = info.companyName || '';
        certData.contactPerson = info.contactPerson || '';
        certData.serviceArea = info.serviceArea || '';
        certData.specialties = info.specialties || '';
      }
      
      return certData;
    });

    // 查询总数
    const countResult = await db.collection('users')
      .where(query)
      .count();

    return {
      success: true,
      applications,
      total: countResult.total,
      hasMore: page * pageSize < countResult.total
    };

  } catch (err) {
    console.error('获取认证申请列表失败:', err);
    return {
      success: false,
      error: err.message || '获取失败'
    };
  }
};



