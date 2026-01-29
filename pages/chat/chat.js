// pages/chat/chat.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

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
    const targetOpenId = options.id; // Assuming id passed is openid
    if (!targetOpenId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ targetOpenId });
    this.initUser();
    this.loadTargetUser(targetOpenId);
  },

  onUnload: function () {
    if (this.data.watcher) {
      this.data.watcher.close();
    }
  },

  initUser: function () {
    app.checkLogin().then(() => {
      this.setData({ userInfo: app.globalData.userInfo });
      this.initChatWatcher();
      this.markConversationRead();
    }).catch(() => {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    });
  },

  loadTargetUser: function (openid) {
    db.collection('users').where({
      _openid: openid
    }).get().then(res => {
      if (res.data.length > 0) {
        this.setData({ targetUserInfo: res.data[0].userInfo });
        wx.setNavigationBarTitle({
          title: res.data[0].userInfo.nickName || '聊天'
        });
      }
    });
  },

  initChatWatcher: function () {
    const myOpenId = app.globalData.openid;
    const targetOpenId = this.data.targetOpenId;
    const roomId = [myOpenId, targetOpenId].sort().join('_');

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
    this.scrollToBottom();
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
    if (!content) return;

    const myOpenId = app.globalData.openid;
    const targetOpenId = this.data.targetOpenId;
    const roomId = [myOpenId, targetOpenId].sort().join('_');

    this.setData({ inputValue: '' }); // Clear input immediately

    db.collection('messages').add({
      data: {
        content,
        roomId,
        createTime: db.serverDate(),
        senderId: myOpenId,
        receiverId: targetOpenId,
        userInfo: this.data.userInfo // Store sender info for easy display in list
      }
    }).then(() => {
      // Update conversation list (optional, can be done via cloud function trigger)
      this.updateConversation(roomId, content, targetOpenId);
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

  updateConversation: function (roomId, lastMessage, targetOpenId) {
    wx.cloud.callFunction({
      name: 'updateConversation',
      data: {
        action: 'send',
        targetId: targetOpenId,
        lastMessage: lastMessage,
        userInfo: this.data.userInfo
      }
    }).catch(err => {
      console.error('更新会话失败:', err);
    });
  }
});
