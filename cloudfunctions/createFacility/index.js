// 云函数：createFacility
// 创建无障碍设施记录
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
      facilityType,
      name,
      latitude,
      longitude,
      address,
      formattedAddress,
      detailAddress,
      status,
      images,
      description
    } = event;

    // 1. 验证必填参数
    if (!facilityType || !latitude || !longitude || !address || !status) {
      return {
        success: false,
        error: '缺少必填参数'
      };
    }

    // 2. 验证设施类型
    const validTypes = ['无障碍停车位', '无障碍卫生间', '无障碍坡道', '无障碍电梯', '无障碍升降台'];
    if (!validTypes.includes(facilityType)) {
      return {
        success: false,
        error: '无效的设施类型'
      };
    }

    // 3. 验证状态
    const validStatuses = ['accessible', 'blocked', 'maintenance', 'occupied'];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: '无效的状态'
      };
    }

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
    // 普通用户只能创建障碍点
    if (userType === 'normal' && status !== 'blocked') {
      return {
        success: false,
        error: '普通用户只能标注障碍点'
      };
    }

    // 6. 构建设施数据
    const now = new Date().toISOString();
    const facilityData = {
      facilityType: facilityType,
      name: name || `${facilityType}`,
      location: new db.Geo.Point(longitude, latitude),
      address: address,
      formattedAddress: formattedAddress || address,
      detailAddress: detailAddress || '',
      status: status,
      statusHistory: [
        {
          status: status,
          updateTime: now,
          updateBy: openid,
          updateByName: userInfo.nickName || '用户',
          updateByRole: userType,
          images: images || [],
          notes: description || ''
        }
      ],
      images: images || [],
      description: description || '',
      creatorInfo: {
        nickName: userInfo.nickName || '用户',
        avatarUrl: userInfo.avatarUrl || '/images/zhi.png'
      },
      creatorRole: userType,
      lastUpdateTime: db.serverDate(),
      lastUpdateBy: openid,
      verified: userType === 'communityWorker', // 社区工作者创建的自动验证
      reportCount: 0,
      viewCount: 0,
      createTime: db.serverDate()
    };

    // 7. 创建设施记录
    const result = await db.collection('facilities').add({
      data: facilityData
    });

    console.log('✅ 设施已创建:', result._id, '类型:', facilityType, '状态:', status);

    return {
      success: true,
      message: '设施创建成功',
      facilityId: result._id,
      data: {
        ...facilityData,
        _id: result._id
      }
    };

  } catch (err) {
    console.error('创建设施失败:', err);
    return {
      success: false,
      error: err.message || '创建失败，请稍后重试'
    };
  }
};

