Page({
  data: {
    posts: [
      {
        postId: 'post-001',
        title: '征集：社区花园无障碍设计方案',
        desc: '北京市 2室2厅 90㎡',
        image: '/images/icon1.jpeg',
        tags: ['#业主需求', '#社区花园', '#无障碍设计'],
        avatar: '/images/icon8.jpg',
        author: 'weixRMIu',
        date: '2023-01-18',
        views: '8w',
        comments: '74',
        likes: '688'
      },
      {
        postId: 'post-002',
        title: '分享：我家小区的无障碍通道改造',
        desc: '',
        image: '/images/icon9.jpeg',
        tags: ['#改造分享', '#无障碍设计', '#社区改造'],
        avatar: '/images/icon1.jpeg',
        author: '徐铭锴',
        date: '2022-02-10',
        views: '2.4w',
        comments: '73',
        likes: '716'
      },
      {
        postId: 'post-003',
        title: '求助：如何在社区花园中加入无障碍设施',
        desc: '厦门市 2室1厅 75㎡',
        image: '/images/24213.jpg',
        tags: ['#业主需求', '#社区花园', '#无障碍设计'],
        avatar: '/images/icon8.jpg',
        author: '_刺刺trex',
        date: '2023-01-26',
        views: '4.4w',
        comments: '46',
        likes: '717'
      },
      {
        postId: 'post-004',
        title: '案例：上海某社区花园无障碍设计实践',
        desc: '',
        image: '/images/24280.jpg',
        tags: ['#案例分享', '#社区花园', '#无障碍设计'],
        avatar: '/images/icon1.jpeg',
        author: '至简名设—钱春',
        date: '2023-03-15',
        views: '3.2w',
        comments: '58',
        likes: '892'
      }
    ]
  },
  
  onLoad: function() {
  },
  
  onPullDownRefresh: function() {
    wx.stopPullDownRefresh();
  },
  
  goToDetail: function(e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: '/pages/case-detail/case-detail?postId=' + postId
    });
  }
})