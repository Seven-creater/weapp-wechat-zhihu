Page({
  data: {
    caseList: [
      {
        id: 1,
        title: '现代简约花园设计',
        imgUrl: 'https://source.unsplash.com/random/600x800/?building,garden',
        author: '设计大师A',
        views: 1234
      },
      {
        id: 2,
        title: '欧式古典建筑风格',
        imgUrl: 'https://source.unsplash.com/random/600x900/?architecture,classic',
        author: '设计大师B',
        views: 2345
      },
      {
        id: 3,
        title: '日式枯山水庭院',
        imgUrl: 'https://source.unsplash.com/random/600x750/?japanese,garden',
        author: '设计大师C',
        views: 3456
      },
      {
        id: 4,
        title: '现代高层建筑设计',
        imgUrl: 'https://source.unsplash.com/random/600x850/?building,modern',
        author: '设计大师D',
        views: 4567
      },
      {
        id: 5,
        title: '北欧风格花园景观',
        imgUrl: 'https://source.unsplash.com/random/600x780/?garden,scandinavian',
        author: '设计大师E',
        views: 5678
      },
      {
        id: 6,
        title: '中式传统建筑设计',
        imgUrl: 'https://source.unsplash.com/random/600x820/?chinese,architecture',
        author: '设计大师F',
        views: 6789
      }
    ]
  },
  
  onLoad: function() {
  },
  
  onPullDownRefresh: function() {
    wx.stopPullDownRefresh();
  },
  
  goToDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '../answer/answer?id=' + id
    });
  }
});