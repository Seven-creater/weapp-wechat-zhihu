const app = getApp();

Page({
  data: {
    diagnosis: "",
    issueId: "",
    solutionId: "",
    schemes: [
      { id: "ramp", name: "加装坡道", desc: "适用于有高差的入口，施工周期短" },
      {
        id: "lift",
        name: "安装升降机",
        desc: "适用于高差较大且空间有限的场景",
      },
      { id: "handrail", name: "加装扶手", desc: "辅助行走，成本低" },
    ],
    selectedScheme: "ramp",
    area: "",
    materials: ["不锈钢", "防腐木", "混凝土", "防滑地砖"],
    materialIndex: 0,
    loading: false,
    result: null,
  },

  onLoad: function (options) {
    if (options.issueId) {
      this.setData({ issueId: options.issueId });
    }
    if (options.diagnosis) {
      this.setData({ diagnosis: decodeURIComponent(options.diagnosis) });
    }
  },

  goBack: function () {
    wx.navigateBack();
  },

  onSchemeChange: function (e) {
    this.setData({ selectedScheme: e.detail.value });
  },

  onAreaInput: function (e) {
    this.setData({ area: e.detail.value });
  },

  ensureLogin: function () {
    return app.checkLogin().catch(() => {
      return new Promise((resolve, reject) => {
        wx.showModal({
          title: "提示",
          content: "生成方案需要先登录",
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

  onMaterialChange: function (e) {
    this.setData({ materialIndex: e.detail.value });
  },

  generatePlan: function () {
    if (!this.data.area) {
      wx.showToast({ title: "请输入用地尺寸", icon: "none" });
      return;
    }

    const scheme = this.data.schemes.find(
      (s) => s.id === this.data.selectedScheme,
    );
    if (!scheme) {
      wx.showToast({ title: "请选择改造方案", icon: "none" });
      return;
    }

    const material = this.data.materials[this.data.materialIndex];
    const area = Number(this.data.area);
    if (!Number.isFinite(area) || area <= 0) {
    this.ensureLogin()
      .then(() => {
        return wx.cloud.callFunction({
          name: "generateSolution",
          data: {
            issueId: this.data.issueId,
            schemeId: scheme.id,
            schemeName: scheme.name,
            material,
            area,
            diagnosis: this.data.diagnosis || "",
          },
        });
        issueId: this.data.issueId,
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "生成失败");
        }

        const plan = res.result.plan || null;
        const solutionId = res.result.solutionId || "";
        area,
        diagnosis: this.data.diagnosis || "",
      })
      .then((result) => {
        const plan = result.plan || null;
        const solutionId = result.solutionId || "";

        this.setData({
          result: plan,
          solutionId,
        });

        wx.pageScrollTo({
          selector: ".result-section",
          duration: 300,
        });
      })
      .catch((err) => {
        if (err && err.message === "未登录") return;
        wx.showToast({ title: err.message || "生成失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  goToConstruction: function () {
    if (!this.data.solutionId) {
      wx.showToast({ title: "请先生成方案", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/construction/construction?solutionId=${this.data.solutionId}`,
    });
  },
});
