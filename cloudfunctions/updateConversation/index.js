// cloudfunctions/updateConversation/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, targetId, lastMessage, targetUserInfo } = event;
  
  try {
    if (action === 'send') {
      // 发送消息时更新双方的会话记录
      await updateOrCreateConversation(openid, targetId, lastMessage, targetUserInfo, false);
      await updateOrCreateConversation(targetId, openid, lastMessage, null, true);
      
      return { success: true };
      
    } else if (action === 'read') {
      // 标记消息已读
      await db.collection('conversations').where({
        ownerId: openid,
        targetId: targetId
      }).update({
        data: {
          unread: 0
        }
      });
      
      return { success: true };
    }
    
    return { success: false, error: '未知操作' };
    
  } catch (err) {
    console.error('更新会话失败:', err);
    return { success: false, error: err.message };
  }
};

// 更新或创建会话记录
async function updateOrCreateConversation(userId, targetId, lastMessage, targetUserInfo, isReceiver) {
  const conversation = await db.collection('conversations').where({
    ownerId: userId,
    targetId: targetId
  }).get();
  
  // 如果没有提供targetUserInfo，尝试查询
  let userInfo = targetUserInfo;
  if (!userInfo) {
    const userRes = await db.collection('users').where({
      _openid: targetId
    }).field({
      userInfo: true
    }).limit(1).get();
    
    userInfo = userRes.data[0]?.userInfo || {
      nickName: '未知用户',
      avatarUrl: '/images/zhi.png'
    };
  }
  
  if (conversation.data.length > 0) {
    // 更新已有会话
    const updateData = {
      lastMessage: lastMessage,
      updateTime: db.serverDate()
    };
    
    if (isReceiver) {
      updateData.unread = _.inc(1);
    }
    
    await db.collection('conversations').doc(conversation.data[0]._id).update({
      data: updateData
    });
  } else {
    // 创建新会话
    await db.collection('conversations').add({
      data: {
        ownerId: userId,
        targetId: targetId,
        targetUserInfo: userInfo,
        lastMessage: lastMessage,
        unread: isReceiver ? 1 : 0,
        updateTime: db.serverDate()
      }
    });
  }
}
