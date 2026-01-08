// pages/solutions/index.js
const db = wx.cloud.database()

Page({
  data: {
    solutions: [],
    currentCategory: '',
    searchKeyword: '',
    page: 1,
    limit: 10,
    hasMore: true,
    loading: false
  },

  onLoad: function(options) {
    this.loadSolutions()
  },

  onPullDownRefresh: function() {
    this.setData({
      page: 1,
      solutions: [],
      hasMore: true
    })
    this.loadSolutions().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 加载解决方案列表
  loadSolutions: function() {
    if (this.data.loading) return Promise.resolve()
    
    this.setData({ loading: true })
    
    const { page, limit, currentCategory, searchKeyword } = this.data
    const skip = (page - 1) * limit
    
    // 构建查询条件
    let query = db.collection('solutions')
    
    if (currentCategory) {
      query = query.where({
        category: currentCategory
      })
    }
    
    if (searchKeyword) {
      query = query.where({
        title: db.RegExp({
          regexp: searchKeyword,
          options: 'i'
        })
      })
    }
    
    return query
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
      .then(res => {
        const newSolutions = res.data
        const solutions = page === 1 ? newSolutions : [...this.data.solutions, ...newSolutions]
        
        this.setData({
          solutions,
          hasMore: newSolutions.length === limit,
          loading: false
        })
        
        // 更新浏览量
        this.updateViewCount(newSolutions)
      })
      .catch(err => {
        console.error('加载解决方案失败:', err)
        this.setData({ loading: false })
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  // 更新浏览量
  updateViewCount: function(solutions) {
    solutions.forEach(solution => {
      db.collection('solutions').doc(solution._id).update({
        data: {
          viewCount: db.command.inc(1)
        }
      })
    })
  },

  // 分类筛选
  onFilterChange: function(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      currentCategory: category,
      page: 1,
      solutions: [],
      hasMore: true
    })
    this.loadSolutions()
  },

  // 搜索输入
  onSearchInput: function(e) {
    const keyword = e.detail.value
    this.setData({
      searchKeyword: keyword
    })
    
    // 防抖搜索
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.setData({
        page: 1,
        solutions: [],
        hasMore: true
      })
      this.loadSolutions()
    }, 500)
  },

  // 加载更多
  loadMore: function() {
    if (!this.data.hasMore || this.data.loading) return
    
    this.setData({
      page: this.data.page + 1
    })
    this.loadSolutions()
  },

  // 跳转到详情页
  goToDetail: function(e) {
    const solutionId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/solution-detail/index?id=${solutionId}`
    })
  }
})