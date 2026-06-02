// pages/chat/chat.js
const app = getApp();
const { formatUserName } = require('../../utils/userDisplay');

let db = null;
const MARK_READ_THROTTLE_MS = 5 * 1000;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
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

  onLoad(options) {
    const targetOpenId = options.id;
    const nickname = options.nickname || '用户';
    if (!targetOpenId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({
      targetOpenId,
      targetUserInfo: { nickName: nickname, avatarUrl: '/images/zhi.png' }
    });
    wx.setNavigationBarTitle({ title: nickname });

    this.initUser();
    this.loadTargetUser(targetOpenId);
  },

  onShow() {
    const hasWatcher = !!this.data.watcher;
    if (!hasWatcher && this.data.targetOpenId && this.data.userInfo) {
      this.initChatWatcher();
    }
    this.markConversationRead();
  },

  onHide() {
    this.closeWatcher();
  },

  onUnload() {
    this.closeWatcher();
  },

  closeWatcher() {
    const watcher = this.data.watcher;
    if (watcher && typeof watcher.close === 'function') {
      watcher.close();
    }
    if (this.data.watcher) {
      this.setData({ watcher: null });
    }
  },

  initUser() {
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
    this.markConversationRead(true);
  },

  loadTargetUser(openid) {
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: { targetId: openid }
    }).then((res) => {
      if (!res.result || !res.result.success) return;

      const userData = res.result.data || {};
      const targetUserInfo = userData.userInfo || {
        nickName: '用户',
        avatarUrl: '/images/zhi.png'
      };
      const userType = userData.userType || 'normal';

      this.setData({
        targetUserInfo,
        targetUserType: userType
      });
      const displayName = formatUserName(targetUserInfo.nickName || '聊天', userType, true);
      wx.setNavigationBarTitle({ title: displayName });
    }).catch((err) => {
      console.error('load target user failed:', err);
    });
  },

  initChatWatcher() {
    const myOpenId = app.globalData.openid || wx.getStorageSync('openid');
    const targetOpenId = this.data.targetOpenId;
    if (!myOpenId || !targetOpenId) return;

    const dbInstance = getDB();
    const roomId = [myOpenId, targetOpenId].sort().join('_');
    this.closeWatcher();
    this.setData({ loading: true });

    const watcher = dbInstance.collection('messages')
      .where({ roomId })
      .orderBy('createTime', 'asc')
      .watch({
        onChange: (snapshot) => {
          const currentMessages = this.data.messages || [];
          const docChanges = snapshot.docChanges || [];
          let nextMessages;

          // 初始化或缺少 diff 信息时，回退全量构建
          if (!docChanges.length || !currentMessages.length) {
            nextMessages = (snapshot.docs || []).map((doc) => ({
              ...doc,
              isMy: doc._openid === myOpenId
            }));
          } else {
            const map = new Map(currentMessages.map((item) => [item._id, item]));
            docChanges.forEach((change) => {
              const doc = change.doc || {};
              const id = doc._id || change.docId;
              if (!id) return;
              const dataType = change.dataType || change.type;
              if (dataType === 'remove') {
                map.delete(id);
                return;
              }
              map.set(id, {
                ...doc,
                isMy: doc._openid === myOpenId
              });
            });
            nextMessages = Array.from(map.values()).sort((a, b) => {
              const ta = toTime(a.createTime);
              const tb = toTime(b.createTime);
              return ta - tb;
            });
          }

          this.setData({
            messages: nextMessages,
            loading: false,
            toView: 'bottom-anchor'
          });
        },
        onError: (err) => {
          console.error('watch messages failed', err);
          this.setData({ loading: false });
        }
      });

    this.setData({ watcher });
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onFocus() {
    setTimeout(() => {
      this.scrollToBottom();
    }, 300);
  },

  onBlur() {},

  hideKeyboard() {
    wx.hideKeyboard();
  },

  scrollToBottom() {
    this.setData({ toView: 'bottom-anchor' });
  },

  sendMessage() {
    const content = (this.data.inputValue || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入消息内容', icon: 'none' });
      return;
    }

    const myOpenId = app.globalData.openid || wx.getStorageSync('openid');
    const targetOpenId = this.data.targetOpenId;
    if (!myOpenId || !targetOpenId) return;

    if (this._sendMessageInflight) return;
    this._sendMessageInflight = true;
    this.setData({ inputValue: '' });

    wx.cloud.callFunction({
      name: 'sendMessage',
      data: {
        targetId: targetOpenId,
        content,
      }
    }).then((res) => {
      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || 'send failed');
      }
      this.scrollToBottom();
    }).catch((err) => {
      console.error('send message failed:', err);
      this.setData({ inputValue: content });
      wx.showToast({ title: '发送失败', icon: 'none' });
    }).finally(() => {
      this._sendMessageInflight = false;
    });
  },

  markConversationRead(force = false) {
    const targetOpenId = this.data.targetOpenId;
    if (!targetOpenId) return;

    const now = Date.now();
    if (!force && now - (this._lastReadMarkedAt || 0) < MARK_READ_THROTTLE_MS) {
      return;
    }
    this._lastReadMarkedAt = now;

    wx.cloud.callFunction({
      name: 'updateConversation',
      data: {
        action: 'read',
        targetId: targetOpenId
      }
    }).then(() => {
      if (app && typeof app.updateUnreadCount === 'function') {
        app.updateUnreadCount({ force: true, source: 'chat_read' });
      }
    }).catch((err) => {
      console.error('mark read failed:', err);
    });
  },

  onTargetAvatarTap() {
    const targetOpenId = this.data.targetOpenId;
    if (targetOpenId) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${targetOpenId}`
      });
    }
  },

  onMyAvatarTap() {
    wx.switchTab({
      url: '/pages/mine/index'
    });
  }
});

function toTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (value.toDate) return value.toDate().getTime() || 0;
  if (value.$date) return new Date(value.$date).getTime() || 0;
  return 0;
}
