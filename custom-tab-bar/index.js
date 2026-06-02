Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#002fa7",
    unreadCount: 0,
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
    this.syncUnreadCount();
  },

  pageLifetimes: {
    show() {
      this.setSelected();
      this.syncUnreadCount();
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
      if (!Array.isArray(pages) || pages.length === 0) return;
      const currentPage = pages[pages.length - 1];
      if (!currentPage || typeof currentPage.route !== "string" || !currentPage.route) return;
      const pagePath = "/" + currentPage.route;
      const selected = this.data.list.findIndex(item => item.pagePath === pagePath);

      if (selected !== -1 && selected !== this.data.selected) {
        this.setData({ selected });
      }
    },

    syncUnreadCount() {
      const app = getApp();
      const unreadCount = app && typeof app.getUnreadCount === "function"
        ? app.getUnreadCount()
        : ((app && app.globalData && app.globalData.unreadCount) || 0);
      if (unreadCount === this.data.unreadCount) return;
      this.setData({ unreadCount });
    },

    updateUnreadCount(count) {
      if (count === this.data.unreadCount) return;
      this.setData({ unreadCount: count });

      if (count > 0) {
        wx.setTabBarBadge({
          index: 3,
          text: count > 99 ? "99+" : String(count)
        });
      } else {
        wx.removeTabBarBadge({
          index: 3
        });
      }
    }
  }
});
