// pages/solution-detail/index.js
const db = wx.cloud.database()

Page({
  data: {
    solution: {},
    showModal: false,
    feedbackLetter: ''
  },

  onLoad: function(options) {
    if (options.id) {
      this.loadSolutionDetail(options.id)
    }
  },

  // 加载解决方案详情
  loadSolutionDetail: function(solutionId) {
    wx.showLoading({
      title: '加载中...'
    })

    db.collection('solutions').doc(solutionId).get()
      .then(res => {
        const solution = res.data
        this.setData({ solution })
        
        // 动态设置页面标题
        wx.setNavigationBarTitle({
          title: solution.title
        })
        
        // 更新浏览量
        this.updateViewCount(solutionId)
        
        wx.hideLoading()
      })
      .catch(err => {
        console.error('加载解决方案详情失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  // 更新浏览量
  updateViewCount: function(solutionId) {
    db.collection('solutions').doc(solutionId).update({
      data: {
        viewCount: db.command.inc(1)
      }
    })
  },

  // 预览图片
  previewImage: function(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      urls: [src]
    })
  },

  // 复制方案文本
  copySolutionText: function() {
    const { solution } = this.data
    const textToCopy = `【${solution.title}】\n\nAI诊断报告：\n${solution.aiAnalysis}`
    
    wx.setClipboardData({
      data: textToCopy,
      success: () => {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        })
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        })
      }
    })
  },

  // 生成反馈函
  generateFeedbackLetter: function() {
    const { solution } = this.data
    const currentDate = new Date().toLocaleDateString('zh-CN')
    
    const letter = `无障碍设施整改反馈函

致相关管理部门：

我们在 ${currentDate} 发现以下无障碍设施问题，现向贵部门反馈，希望得到及时整改：

问题描述：
${solution.title}

问题分类：${solution.category}

AI诊断分析：
${solution.aiAnalysis}

建议整改措施：
1. 请尽快安排专业人员现场勘查
2. 根据AI建议制定整改方案
3. 在合理时间内完成整改工作
4. 整改完成后进行验收

我们相信通过贵部门的努力，能够为残障人士创造更加友好的出行环境。期待您的回复和整改结果。

此致
敬礼！

反馈人：无障碍随手拍用户
${currentDate}`

    this.setData({
      feedbackLetter: letter,
      showModal: true
    })
  },

  // 隐藏模态框
  hideModal: function() {
    this.setData({
      showModal: false
    })
  },

  // 复制反馈函文本
  copyLetterText: function() {
    wx.setClipboardData({
      data: this.data.feedbackLetter,
      success: () => {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        })
        this.hideModal()
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        })
      }
    })
  }
})