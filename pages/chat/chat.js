// pages/chat/chat.js
const app = getApp();

// 延迟初始化数据库
let db = null;
let _ = null;

const getDB = () => {
  if (!db) {
    try {
      db = wx.cloud.database();
      _ = db.command;
    } catch (err) {
      console.error('数据库初始化失败:', err);
      return null;
    }
  }
  return db;
};

Page({
  data: {
    userInfo: null,
    targetUserInfo: null,
    targetOpenId: '',
    messages: [],
    inputValue: '',
    toView: '',
    inputBottom: 0,
    loading: false,
    watcher: null
  },

  onLoad: function (options) {
    const targetOpenId = options.id;
    const nickname = options.nickname || '用户';
    
    if (!targetOpenId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ 
      targetOpenId,
      targetUserInfo: { nickName: nickname }
    });
    
    wx.setNavigationBarTitle({
      title: nickname
    });
    
    this.initUser();
    this.loadTargetUser(targetOpenId);
  },

  onUnload: function () {
    if (this.data.watcher) {
      this.data.watcher.close();
    }
  },

  initUser: function () {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (!openid || !userInfo) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再发起私信',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/index' });
          } else {
            wx.navigateBack();
          }
        }
      });
      return;
    }
    
    this.setData({ userInfo });
    this.initChatWatcher();
    this.markConversationRead();
  },

  loadTargetUser: function (openid) {
    console.log('========================================');
    console.log('📥 聊天页面：开始加载目标用户信息');
    console.log('目标 openid:', openid);
    console.log('当前登录用户 openid:', app.globalData.openid || wx.getStorageSync('openid'));
    console.log('========================================');

    // 🔥 使用云函数查询，避免权限问题
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: openid
      }
    }).then(res => {
      console.log('========================================');
      console.log('📊 聊天页面：云函数查询结果');
      console.log('完整结果:', res.result);
      console.log('========================================');
      
      if (res.result && res.result.success) {
        const userData = res.result.data;
        const targetUserInfo = userData.userInfo || {
          nickName: '用户',
          avatarUrl: '/images/zhi.png'
        };
        
        console.log('✅ 找到目标用户信息');
        console.log('nickName:', targetUserInfo.nickName);
        console.log('avatarUrl:', targetUserInfo.avatarUrl);
        
        this.setData({ targetUserInfo: targetUserInfo }, () => {
          console.log('========================================');
          console.log('✅ 聊天页面：setData 完成');
          console.log('页面当前 targetUserInfo:', this.data.targetUserInfo);
          console.log('页面当前 targetOpenId:', this.data.targetOpenId);
          console.log('========================================');
        });
        
        wx.setNavigationBarTitle({
          title: targetUserInfo.nickName || '聊天'
        });
      } else {
        console.log('========================================');
        console.log('❌ 聊天页面：用户不存在');
        console.log('查询的 openid:', openid);
        console.log('========================================');
      }
    }).catch(err => {
      console.log('========================================');
      console.error('❌ 聊天页面：加载用户信息失败');
      console.error('错误信息:', err);
      console.log('========================================');
    });
  },

  initChatWatcher: function () {
    const myOpenId = app.globalData.openid || wx.getStorageSync('openid');
    const targetOpenId = this.data.targetOpenId;
    const roomId = [myOpenId, targetOpenId].sort().join('_');

    const db = getDB();
    if (!db) {
      wx.showToast({ title: '数据库初始化失败', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    const watcher = db.collection('messages')
      .where({
        roomId: roomId
      })
      .orderBy('createTime', 'asc')
      .watch({
        onChange: (snapshot) => {
          const messages = snapshot.docs.map(doc => ({
            ...doc,
            isMy: doc._openid === myOpenId
          }));
          
          this.setData({
            messages,
            loading: false,
            toView: 'bottom-anchor' // Scroll to bottom
          });
        },
        onError: (err) => {
          console.error('监听消息失败', err);
          this.setData({ loading: false });
        }
      });

    this.setData({ watcher });
  },

  onInput: function (e) {
    this.setData({ inputValue: e.detail.value });
  },

  onFocus: function (e) {
    this.setData({ inputBottom: e.detail.height });
    setTimeout(() => {
      this.scrollToBottom();
    }, 100);
  },

  onBlur: function () {
    this.setData({ inputBottom: 0 });
  },

  hideKeyboard: function () {
    wx.hideKeyboard();
  },

  scrollToBottom: function () {
    this.setData({ toView: 'bottom-anchor' });
  },

  sendMessage: function () {
    const content = this.data.inputValue.trim();
    if (!content) {
      wx.showToast({ title: '请输入消息内容', icon: 'none' });
      return;
    }

    const myOpenId = app.globalData.openid || wx.getStorageSync('openid');
    const targetOpenId = this.data.targetOpenId;
    const roomId = [myOpenId, targetOpenId].sort().join('_');

    const db = getDB();
    if (!db) {
      wx.showToast({ title: '发送失败', icon: 'none' });
      return;
    }

    this.setData({ inputValue: '' }); // Clear input immediately

    db.collection('messages').add({
      data: {
        content,
        roomId,
        createTime: db.serverDate(),
        senderId: myOpenId,
        receiverId: targetOpenId,
        userInfo: this.data.userInfo
      }
    }).then(() => {
      // 调用云函数更新会话列表
      wx.cloud.callFunction({
        name: 'updateConversation',
        data: {
          action: 'send',
          targetId: targetOpenId,
          lastMessage: content,
          targetUserInfo: this.data.targetUserInfo
        }
      }).catch(err => {
        console.error('更新会话失败:', err);
      });
      
      this.scrollToBottom();
    }).catch(err => {
      console.error('发送失败', err);
      wx.showToast({ title: '发送失败', icon: 'none' });
    });
  },

  markConversationRead: function () {
    const targetOpenId = this.data.targetOpenId;
    if (!targetOpenId) return;

    wx.cloud.callFunction({
      name: 'updateConversation',
      data: {
        action: 'read',
        targetId: targetOpenId
      }
    }).catch(err => {
      console.error('标记已读失败:', err);
    });
  },

  // 🔥 新增：点击对方头像跳转到对方主页
  onTargetAvatarTap: function () {
    const targetOpenId = this.data.targetOpenId;
    if (targetOpenId) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${targetOpenId}`
      });
    }
  },

  // 🔥 新增：点击自己头像跳转到"我的"页面
  onMyAvatarTap: function () {
    wx.switchTab({
      url: '/pages/mine/index'
    });
  }
});
