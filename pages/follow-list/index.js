const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    type: 'following', // following or followers
    users: [],
    loading: false
  },

  onLoad: function (options) {
    this.setData({ type: options.type || 'following' });
    wx.setNavigationBarTitle({
      title: options.type === 'followers' ? '粉丝' : '关注'
    });
    this.loadData();
  },

  loadData: function () {
    const openid = app.globalData.openid;
    if (!openid) return;

    this.setData({ loading: true });
    const collection = 'follows';
    let query = {};

    if (this.data.type === 'following') {
      query = { followerId: openid };
    } else {
      query = { targetId: openid };
    }

    db.collection(collection).where(query).get().then(async res => {
      const follows = res.data;
      const userIds = follows.map(f => this.data.type === 'following' ? f.targetId : f.followerId);
      
      if (userIds.length === 0) {
        this.setData({ users: [], loading: false });
        return;
      }

      // Fetch user info for these IDs
      // In a real app, you might want to use a lookup or store user info in the follow record
      // For now, let's assume we need to fetch from 'users' collection
      const usersRes = await db.collection('users').where({
        _openid: db.command.in(userIds)
      }).get();

      const userMap = {};
      usersRes.data.forEach(u => userMap[u._openid] = u);

      const users = follows.map(f => {
        const uid = this.data.type === 'following' ? f.targetId : f.followerId;
        return {
          ...f,
          userInfo: userMap[uid]?.userInfo || { nickName: '未知用户', avatarUrl: '' },
          isFollowing: this.data.type === 'following', // If I'm following them, it's true
          isSelf: uid === openid
        };
      });
            });
      this.setData({ users, loading: false });
    }).catch(err => {
      console.error(err);
      this.setData({ loading: false });
    });
      });
  },

  navigateToProfile: function (e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
        url: `/pages/user-profile/index?id=${id}`
        url: `/pages/user-profile/index?id=${id}`,
      });
    }
  },

    // Implement toggle follow logic if needed
    // For now just show toast
    wx.showToast({ title: '功能开发中', icon: 'none' });
  }
  },
});
