// components/user-name/index.js
const { getUserBadge } = require('../../utils/userDisplay');

Component({
  properties: {
    // 用户昵称
    nickName: {
      type: String,
      value: '未知用户'
    },
    // 用户类型
    userType: {
      type: String,
      value: 'normal'
    },
    // 是否内联显示
    inline: {
      type: Boolean,
      value: false
    },
    // 是否垂直布局
    vertical: {
      type: Boolean,
      value: false
    }
  },

  data: {
    badge: null
  },

  lifetimes: {
    attached() {
      this.updateBadge();
    }
  },

  observers: {
    'userType': function(newVal) {
      this.updateBadge();
    }
  },

  methods: {
    updateBadge() {
      const badge = getUserBadge(this.data.userType);
      this.setData({ badge });
    }
  }
});

