//answer.js
const collectUtil = require("../../utils/collect.js");

Page({
  data: {
    projectDetail: {
      title: "城市绿洲 - 现代社区园林设计",
      location: "中国 上海",
      designTeam: "自然设计工作室",
      area: "8,500㎡",
      year: "2023",
      mainImage:
        "https://source.unsplash.com/random/1200x800/?garden,landscape",
      content:
        "<p>本项目位于上海市中心的高端社区，旨在打造一个集休闲、社交、生态于一体的现代园林空间。设计理念融合了自然与都市生活，通过多层次的景观设计，创造出一个四季有景、步移景异的绿色绿洲。</p><p>设计采用了本土植物为主，结合现代硬质景观元素，形成了丰富的视觉层次。主要景观节点包括中央水景、下沉式广场、儿童游乐区、健身步道和休闲座椅区，满足了不同年龄段居民的需求。</p><p>在生态方面，项目引入了雨水收集系统、绿色屋顶和垂直绿化，有效提高了社区的生态效益。同时，通过合理的植物配置，创造了良好的微气候环境，降低了夏季温度，提高了空气质量。</p>",
      gallery: [
        "https://source.unsplash.com/random/1200x800/?garden,design",
        "https://source.unsplash.com/random/1200x800/?landscape,architecture",
        "https://source.unsplash.com/random/1200x800/?outdoor,garden",
        "https://source.unsplash.com/random/1200x800/?nature,landscape",
        "https://source.unsplash.com/random/1200x800/?garden,modern",
      ],
    },
    id: "",
    isLiked: false,
    isCollected: false,
    userInfo: null,
    likes: 0,
    currentSwiper: 0,
  },
  onLoad: function (options) {
    const app = getApp();
    this.setData({
      id: options.id,
      userInfo: app.globalData.userInfo,
    });
    console.log("项目ID:", options.id);
    // 初始化检查点赞和收藏状态
    this.checkStatus();
  },

  getOpenid: function () {
    const app = getApp();
    return app.globalData.openid || wx.getStorageSync("openid");
  },

  // 初始化检查点赞和收藏状态
  checkStatus: function () {
    const db = wx.cloud.database();
    const currentId = this.data.id;
    const openid = this.getOpenid();

    if (!openid) {
      return;
    }

    db.collection("actions")
      .where({
        _openid: openid,
        postId: currentId,
        type: "like",
      })
      .get()
      .then((res) => {
        console.log("检查状态结果:", res);
        let isLiked = false;

        res.data.forEach((item) => {
          if (item.type === "like") {
            isLiked = true;
          }
        });

        this.setData({
          isLiked: isLiked,
        });
      })
      .catch((err) => {
        console.error("检查状态失败:", err);
      });

    collectUtil.initCollectStatus(this, "collect_post", currentId).catch(() => {
      // 初始化失败不影响主要流程
    });
  },

  // 点赞功能
  toggleLike: function () {
    const app = getApp();

    // 检查登录
    if (!app.globalData.userInfo) {
      wx.showToast({
        title: "请先登录",
        icon: "none",
      });
      return;
    }

    const db = wx.cloud.database();
    const currentId = this.data.id;
    const openid = this.getOpenid();

    if (!openid) {
      wx.showToast({
        title: "请先登录",
        icon: "none",
      });
      return;
    }

    // 查询是否已经点赞
    db.collection("actions")
      .where({
        _openid: openid,
        postId: currentId,
        type: "like",
      })
      .get()
      .then((res) => {
        if (res.data.length > 0) {
          // 已点赞，取消点赞
          db.collection("actions")
            .doc(res.data[0]._id)
            .remove()
            .then(() => {
              this.setData({
                isLiked: false,
                likes: this.data.likes - 1,
              });
              wx.showToast({
                title: "已取消点赞",
              });
            })
            .catch((err) => {
              console.error("取消点赞失败:", err);
              wx.showToast({
                title: "操作失败",
                icon: "none",
              });
            });
        } else {
          // 未点赞，添加点赞
          db.collection("actions")
            .add({
              data: {
                postId: currentId,
                type: "like",
                title: this.data.projectDetail.title,
                image: this.data.projectDetail.mainImage,
                createTime: db.serverDate(),
              },
            })
            .then(() => {
              this.setData({
                isLiked: true,
                likes: this.data.likes + 1,
              });
              wx.showToast({
                title: "点赞成功",
              });
            })
            .catch((err) => {
              console.error("添加点赞失败:", err);
              wx.showToast({
                title: "操作失败",
                icon: "none",
              });
            });
        }
      })
      .catch((err) => {
        console.error("查询点赞状态失败:", err);
        wx.showToast({
          title: "操作失败",
          icon: "none",
        });
      });
  },

  // 收藏功能
  toggleCollect: function () {
    const currentId = this.data.id;
    if (!currentId) return;

    const targetData = {
      title: this.data.projectDetail.title,
      image: this.data.projectDetail.mainImage,
    };

    collectUtil
      .toggleCollect(this, "collect_post", currentId, targetData)
      .catch((err) => {
        console.error("收藏操作失败:", err);
        this.setData({ isCollected: !this.data.isCollected });
        wx.showToast({
          title: "操作失败",
          icon: "none",
        });
      });
  },

  // 咨询功能
  contactConsult: function () {
    wx.showToast({
      title: "咨询功能开发中",
      icon: "none",
    });
    // 这里可以添加咨询的逻辑
  },

  // 轮播图变化
  swiperChange: function (e) {
    this.setData({
      currentSwiper: e.detail.current,
    });
  },
});
