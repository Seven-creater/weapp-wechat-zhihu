Page({
  data: {
    menuList: [
      {
        icon: '/images/book.png',
        text: '我的设计'
      },
      {
        icon: '/images/star.png',
        text: '我的收藏'
      },
      {
        icon: '/images/comment2.png',
        text: '社区互动'
      },
      {
        icon: '/images/flag.png',
        text: '我要反馈'
      },
      {
        icon: '/images/setting.png',
        text: '账户管理'
      },
      {
        icon: '/images/computer.png',
        text: '获取电脑端'
      }
    ]
  },
  
  onLoad: function() {
    // 页面加载时的逻辑
  },
  
  onLogout: function() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          // 执行退出登录逻辑
          wx.showToast({
            title: '已退出',
            icon: 'success'
          });
        }
      }
    });
  }
})