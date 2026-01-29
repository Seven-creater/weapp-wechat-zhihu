const app = getApp();

Page({
  data: {
    teams: [
      { id: 1, name: '邵东市第一建筑公司', rating: 4.9, tags: '资质认证 | 经验丰富', cases: 128, logo: '/images/icon1.jpeg', phone: '13800138000' },
      { id: 2, name: '安居无障碍改造队', rating: 4.8, tags: '专注适老化 | 价格透明', cases: 86, logo: '/images/icon8.jpg', phone: '13800138001' },
      { id: 3, name: '便民维修服务中心', rating: 4.7, tags: '响应快 | 社区推荐', cases: 215, logo: '/images/icon9.jpeg', phone: '13800138002' }
    ],
    selectedTeam: 1,
    solutionId: "",
    solution: null,
    loading: false,
    projectStatus: 'pending',
    timeline: [
      { title: '发布需求', date: '2026-01-27', done: true },
      { title: '施工方接单', date: '待定', done: false },
      { title: '上门勘测', date: '待定', done: false },
      { title: '进场施工', date: '待定', done: false },
      { title: '验收交付', date: '待定', done: false }
    ]
  },

  onLoad: function (options) {
    if (options.solutionId) {
      this.setData({ solutionId: options.solutionId }, () => this.loadSolution());
    }
  },

  goBack: function() {
    wx.navigateBack();
  },

  ensureLogin: function () {
    return app.checkLogin().catch(() => {
      return new Promise((resolve, reject) => {
        wx.showModal({
          title: "提示",
          content: "该操作需要先登录",
          confirmText: "去登录",
          cancelText: "取消",
          success: (res) => {
            if (!res.confirm) {
              reject(new Error("未登录"));
              return;
            }
            app
              .login()
              .then(() => resolve(true))
              .catch((err) => reject(err));
          },
        });
      });
    });
  },

  loadSolution: function () {
    const solutionId = this.data.solutionId;
    if (!solutionId) return;

    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: "getPublicData",
      data: { collection: "solutions", docId: solutionId },
      success: (res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }
        const solution = res.result.data || null;
        const construction = (solution && solution.construction) || {};
        const status = construction && construction.status ? construction.status : "pending";
        const teamId = construction && construction.team && construction.team.id ? construction.team.id : this.data.selectedTeam;
        const timeline = Array.isArray(construction.timeline) && construction.timeline.length ? construction.timeline : this.data.timeline;

        this.setData({
          solution,
          projectStatus: status === "completed" ? "completed" : status === "active" ? "active" : "pending",
          selectedTeam: teamId,
          timeline,
          loading: false,
        });
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: "加载失败", icon: "none" });
      },
    });
  },

  selectTeam: function(e) {
    if (this.data.projectStatus === 'active') return;
    if (this.data.projectStatus === 'completed') return;
    this.setData({ selectedTeam: e.currentTarget.dataset.id });
  },

  submitRequest: function() {
    if (!this.data.solutionId) {
      wx.showToast({ title: "缺少方案ID", icon: "none" });
      return;
    }
    const team = this.data.teams.find((t) => t.id === this.data.selectedTeam);
    if (!team) {
      wx.showToast({ title: "请选择施工团队", icon: "none" });
      return;
    }

    wx.showLoading({ title: "提交中..." });
    this.ensureLogin()
      .then(() => {
        return wx.cloud.callFunction({
          name: "updateConstruction",
          data: {
            solutionId: this.data.solutionId,
            action: "start",
            team,
          },
        });
      })
      .then((res) => {
        wx.hideLoading();
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "提交失败");
        }
        wx.showToast({ title: "需求已发布", icon: "success" });
        this.loadSolution();
      })
      .catch((err) => {
        wx.hideLoading();
        if (err && err.message === "未登录") return;
        wx.showToast({ title: err.message || "提交失败", icon: "none" });
      });
  },

  advanceStage: function () {
    if (!this.data.solutionId) return;
    wx.showLoading({ title: "更新中..." });
    this.ensureLogin()
      .then(() => {
        return wx.cloud.callFunction({
          name: "updateConstruction",
          data: {
            solutionId: this.data.solutionId,
            action: "advance",
          },
        });
      })
      .then((res) => {
        wx.hideLoading();
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "更新失败");
        }
        this.loadSolution();
      })
      .catch((err) => {
        wx.hideLoading();
        if (err && err.message === "未登录") return;
        wx.showToast({ title: err.message || "更新失败", icon: "none" });
      });
  },

  chooseAfterImage: function () {
    if (!this.data.solutionId) return;
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const filePath = res.tempFilePaths && res.tempFilePaths[0];
        if (!filePath) return;
        wx.showLoading({ title: "上传中..." });
        const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
        const cloudPath = `solutions/after/${this.data.solutionId}-${Date.now()}.${ext}`;
        wx.cloud
          .uploadFile({ cloudPath, filePath })
          .then((up) => {
            return wx.cloud.callFunction({
              name: "updateConstruction",
              data: {
                solutionId: this.data.solutionId,
                action: "complete",
                afterImg: up.fileID,
              },
            });
          })
          .then((res2) => {
            wx.hideLoading();
            if (!res2.result || !res2.result.success) {
              throw new Error(res2.result?.error || "完工失败");
            }
            wx.showToast({ title: "已验收完成", icon: "success" });
            this.loadSolution();
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: err.message || "上传失败", icon: "none" });
          });
      },
    });
  },

  publishCase: function () {
    if (!this.data.solutionId) return;
    wx.showLoading({ title: "发布中..." });
    this.ensureLogin()
      .then(() => {
        return wx.cloud.callFunction({
          name: "updateConstruction",
          data: {
            solutionId: this.data.solutionId,
            action: "publishCase",
          },
        });
      })
      .then((res) => {
        wx.hideLoading();
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "发布失败");
        }
        wx.showToast({ title: "已发布", icon: "success" });
        const postId = res.result.postId;
        if (postId) {
          wx.navigateTo({ url: `/pages/post-detail/index?id=${postId}` });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        if (err && err.message === "未登录") return;
        wx.showToast({ title: err.message || "发布失败", icon: "none" });
      });
  },

  contactTeam: function() {
    const team = this.data.teams.find((t) => t.id === this.data.selectedTeam);
    if (!team || !team.phone) {
      wx.showToast({ title: "未找到联系方式", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: team.phone });
  }
});
