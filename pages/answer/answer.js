//answer.js
Page({
  data: {
    projectDetail: {
      title: '城市绿洲 - 现代社区园林设计',
      location: '中国 上海',
      designTeam: '自然设计工作室',
      area: '8,500㎡',
      year: '2023',
      mainImage: 'https://source.unsplash.com/random/1200x800/?garden,landscape',
      content: '<p>本项目位于上海市中心的高端社区，旨在打造一个集休闲、社交、生态于一体的现代园林空间。设计理念融合了自然与都市生活，通过多层次的景观设计，创造出一个四季有景、步移景异的绿色绿洲。</p><p>设计采用了本土植物为主，结合现代硬质景观元素，形成了丰富的视觉层次。主要景观节点包括中央水景、下沉式广场、儿童游乐区、健身步道和休闲座椅区，满足了不同年龄段居民的需求。</p><p>在生态方面，项目引入了雨水收集系统、绿色屋顶和垂直绿化，有效提高了社区的生态效益。同时，通过合理的植物配置，创造了良好的微气候环境，降低了夏季温度，提高了空气质量。</p>',
      gallery: [
        'https://source.unsplash.com/random/1200x800/?garden,design',
        'https://source.unsplash.com/random/1200x800/?landscape,architecture',
        'https://source.unsplash.com/random/1200x800/?outdoor,garden',
        'https://source.unsplash.com/random/1200x800/?nature,landscape',
        'https://source.unsplash.com/random/1200x800/?garden,modern'
      ]
    },
    isFavorite: false,
    likes: 0,
    currentSwiper: 0
  },
  onLoad: function(options) {
    console.log('项目ID:', options.id);
  },
  
  // 收藏功能
  toggleFavorite: function() {
    this.setData({
      isFavorite: !this.data.isFavorite
    });
    // 这里可以添加收藏的逻辑
  },
  
  // 点赞功能
  addLike: function() {
    this.setData({
      likes: this.data.likes + 1
    });
    // 这里可以添加点赞的逻辑
  },
  
  // 咨询功能
  contactConsult: function() {
    wx.showToast({
      title: '咨询功能开发中',
      icon: 'none'
    });
    // 这里可以添加咨询的逻辑
  },
  
  // 轮播图变化
  swiperChange: function(e) {
    this.setData({
      currentSwiper: e.detail.current
    });
  }
})
