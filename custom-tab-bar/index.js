Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#002fa7",
    unreadCount: 0,  // 🆕 未读消息数量
    list: [
      {
        pagePath: "/pages/index/index",
        text: "地图",
        iconPath: "/images/index.png",
        selectedIconPath: "/images/index_focus.png"
      },
      {
        pagePath: "/pages/community/community",
        text: "社区",
        iconPath: "/images/discovery.png",
        selectedIconPath: "/images/discovery_focus.png"
      },
      {
        pagePath: "/pages/post/create",
        text: "",
        iconPath: "/images/plus.svg",
        selectedIconPath: "/images/plus.svg",
        isSpecial: true
      },
      {
        pagePath: "/pages/notify/notify",
        text: "消息",
        iconPath: "/images/chat.png",
        selectedIconPath: "/images/chat_focus.png"
      },
      {
        pagePath: "/pages/mine/index",
        text: "我",
        iconPath: "/images/ring.png",
        selectedIconPath: "/images/ring_focus.png"
      }
    ]
  },
  
  attached() {
    this.setSelected();
    this.loadUnreadCount();  // 🆕 加载未读消息数量
  },

  pageLifetimes: {
    show() {
      this.setSelected();
      this.loadUnreadCount();  // 🆕 页面显示时刷新未读消息数量
    }
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      
      wx.switchTab({ url });
    },

    setSelected() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const pagePath = '/' + currentPage.route;
      
      const selected = this.data.list.findIndex(item => item.pagePath === pagePath);
      
      if (selected !== -1) {
        this.setData({
          selected: selected
        });
      }
    },

    /**
     * 🆕 加载未读消息数量
     */
    loadUnreadCount() {
      const app = getApp();
      const openid = app.globalData.openid || wx.getStorageSync('openid');
      
      if (!openid) {
        return;
      }

      // 从云数据库查询未读消息数量（统计所有会话的未读数）
      wx.cloud.database().collection('conversations')
        .where({
          ownerId: openid  // 🔧 使用 ownerId 而不是 targetId
        })
        .field({
          unreadCount: true
        })
        .get()
        .then(res => {
          const conversations = res.data || [];
          // 🔧 计算所有会话的未读数量总和
          const totalUnread = conversations.reduce((sum, conv) => {
            return sum + (conv.unreadCount || 0);
          }, 0);
          
          console.log('📊 未读消息统计:', totalUnread, '条');
          
          this.setData({
            unreadCount: totalUnread
          });
          
          // 🔧 同时设置 TabBar 角标
          if (totalUnread > 0) {
            wx.setTabBarBadge({
              index: 3,  // 消息是第4个tab（索引为3）
              text: totalUnread > 99 ? '99+' : String(totalUnread)
            });
          } else {
            wx.removeTabBarBadge({
              index: 3
            });
          }
        })
        .catch(err => {
          console.error('加载未读消息数量失败:', err);
        });
    },

    /**
     * 🆕 更新未读消息数量（供外部调用）
     */
    updateUnreadCount(count) {
      this.setData({
        unreadCount: count
      });
      
      // 更新系统 TabBar 角标
      if (count > 0) {
        wx.setTabBarBadge({
          index: 3,
          text: count > 99 ? '99+' : String(count)
        });
      } else {
        wx.removeTabBarBadge({
          index: 3
        });
      }
    }
  }
});

