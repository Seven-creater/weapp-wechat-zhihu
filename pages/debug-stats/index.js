// 临时调试页面 - 查看统计数据
Page({
  data: {
    result: ''
  },

  onLoad: function() {
    this.checkStats();
  },

  checkStats: function() {
    const openid = wx.getStorageSync('openid');
    
    if (!openid) {
      this.setData({ result: '请先登录' });
      return;
    }

    let result = `当前用户 openid: ${openid}\n\n`;

    // 1. 使用云函数查询 follows 集合（绕过权限限制）
    wx.cloud.callFunction({
      name: 'fixUserStats',
      data: { targetId: openid }
    }).then(res => {
      result += `【云函数查询结果】\n`;
      result += JSON.stringify(res.result, null, 2) + '\n\n';

      // 2. 直接查询 follows（可能受权限限制）
      return wx.cloud.database().collection('follows').where({
        followerId: openid
      }).get();
    }).then(res => {
      result += `【我关注的人】（直接查询）\n`;
      result += `数量: ${res.data.length}\n`;
      res.data.forEach(item => {
        result += `- targetId: ${item.targetId}, isMutual: ${item.isMutual}\n`;
      });
      result += `\n`;

      return wx.cloud.database().collection('follows').where({
        targetId: openid
      }).get();
    }).then(res => {
      result += `【关注我的人】（直接查询）\n`;
      result += `数量: ${res.data.length}\n`;
      res.data.forEach(item => {
        result += `- followerId: ${item.followerId}, isMutual: ${item.isMutual}\n`;
      });
      result += `\n`;

      // 3. 查询 users 集合的 stats
      return wx.cloud.callFunction({
        name: 'getUserInfo',
        data: { targetId: openid }
      });
    }).then(res => {
      result += `【users 集合的 stats】\n`;
      if (res.result && res.result.success) {
        const stats = res.result.data.stats || {};
        result += `followingCount: ${stats.followingCount || 0}\n`;
        result += `followersCount: ${stats.followersCount || 0}\n`;
        result += `likesCount: ${stats.likesCount || 0}\n`;
      } else {
        result += `查询失败: ${res.result?.error}\n`;
      }
      result += `\n`;

      this.setData({ result });
    }).catch(err => {
      result += `\n错误: ${err.message || err.errMsg}\n`;
      this.setData({ result });
    });
  },

  // 运行修复
  runFix: function() {
    wx.showLoading({ title: '修复中...' });
    
    wx.cloud.callFunction({
      name: 'fixUserStats',
      data: {}
    }).then(res => {
      wx.hideLoading();
      wx.showModal({
        title: '修复完成',
        content: JSON.stringify(res.result),
        showCancel: false,
        success: () => {
          this.checkStats();
        }
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showModal({
        title: '修复失败',
        content: err.message || err.errMsg,
        showCancel: false
      });
    });
  },

  copyResult: function() {
    wx.setClipboardData({
      data: this.data.result,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  }
});

