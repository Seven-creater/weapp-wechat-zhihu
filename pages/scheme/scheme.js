Page({
  data: {
    showTypeFilterPopup: false,
    typeFilters: ['无障碍设计', '社区花园', '不限'],
    selectedTypes: ['不限'],
    
    showSortFilterPopup: false,
    sortOptions: ['推荐', '最新', '浏览数', '点赞数', '评论数'],
    selectedSort: '推荐',
    
    schemes: [
      {
        postId: 'post-001',
        image: '/images/24280.jpg',
        name: '城市社区无障碍花园改造',
        author: '至简名设—钱春',
        views: 7290,
        tags: ['无障碍设计', '社区花园']
      },
      {
        postId: 'post-002',
        image: '/images/24213.jpg',
        name: '老旧小区无障碍通道设计',
        author: '杨振彪',
        views: 1260,
        tags: ['无障碍设计']
      },
      {
        postId: 'post-003',
        image: '/images/1444983318907-_DSC1826.jpg',
        name: '居民共享社区花园',
        author: 'CrazyKen',
        views: 1869,
        tags: ['社区花园']
      },
      {
        postId: 'post-004',
        image: '/images/icon1.jpeg',
        name: '残疾人友好社区改造',
        author: '一木设计宇哥',
        views: 3301,
        tags: ['无障碍设计']
      },
      {
        postId: 'post-005',
        image: '/images/icon8.jpg',
        name: '屋顶社区花园设计',
        author: '庄育霖',
        views: 2560,
        tags: ['社区花园']
      },
      {
        postId: 'post-006',
        image: '/images/icon9.jpeg',
        name: '儿童无障碍游乐区设计',
        author: '徐铭锴',
        views: 4120,
        tags: ['无障碍设计']
      }
    ]
  },
  
  onLoad: function() {
  },
  
  onPullDownRefresh: function() {
    wx.stopPullDownRefresh();
  },
  
  showTypeFilter: function() {
    this.setData({
      showTypeFilterPopup: true,
      showSortFilterPopup: false
    });
  },
  
  hideTypeFilter: function() {
    this.setData({
      showTypeFilterPopup: false
    });
  },
  
  toggleTypeFilter: function(e) {
    const type = e.currentTarget.dataset.type;
    let selectedTypes = this.data.selectedTypes;
    
    if (type === '不限') {
      selectedTypes = ['不限'];
    } else {
      if (selectedTypes.indexOf('不限') > -1) {
        selectedTypes = selectedTypes.filter(item => item !== '不限');
      }
      
      const index = selectedTypes.indexOf(type);
      if (index > -1) {
        selectedTypes.splice(index, 1);
      } else {
        selectedTypes.push(type);
      }
      
      if (selectedTypes.length === 0) {
        selectedTypes = ['不限'];
      }
    }
    
    this.setData({
      selectedTypes: selectedTypes
    });
  },
  
  confirmTypeFilter: function() {
    this.hideTypeFilter();
  },
  
  showSortFilter: function() {
    this.setData({
      showSortFilterPopup: true,
      showTypeFilterPopup: false
    });
  },
  
  hideSortFilter: function() {
    this.setData({
      showSortFilterPopup: false
    });
  },
  
  selectSort: function(e) {
    const sort = e.currentTarget.dataset.sort;
    this.setData({
      selectedSort: sort
    });
  },
  
  confirmSortFilter: function() {
    this.hideSortFilter();
  },
  
  goToDetail: function(e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: '/pages/case-detail/case-detail?postId=' + postId
    });
  }
})