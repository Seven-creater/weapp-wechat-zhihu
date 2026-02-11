// pages/map-view/index.js
const { getCaseNavCategories, getCategoryName } = require('../../utils/categories.js');

Page({
  data: {
    // 地图相关
    latitude: 39.9042,  // 默认北京
    longitude: 116.4074,
    scale: 14,
    markers: [],
    setting: {
      skew: 0,
      rotate: 0,
      showLocation: false,
      showScale: false,
      subKey: '',
      layerStyle: 1,
      enableZoom: true,
      enableScroll: true,
      enableRotate: false,
      showCompass: false,
      enable3D: false,
      enableOverlooking: false,
      enableSatellite: false,
      enableTraffic: false,
    },
    
    // 数据相关
    allPosts: [],  // 所有问题帖子
    filteredPosts: [],  // 筛选后的帖子
    
    // 筛选相关
    selectedCategory: 'all',
    selectedCategoryName: '全部分类',  // 当前选中的分类名称
    categories: [],
    
    // 状态相关
    loading: false,
    showCategoryPanel: false,
  },

  onLoad: function () {
    // 初始化分类列表
    const categories = getCaseNavCategories();
    this.setData({ categories });
    
    // 获取用户位置
    this.getUserLocation();
    
    // 加载问题帖子
    this.loadIssuePosts();
  },

  onShow: function () {
    // 更新 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0  // 地图是第一个tab
      });
    }
  },

  // 获取用户位置
  getUserLocation: function () {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        console.log('📍 获取到用户位置:', res.latitude, res.longitude);
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
        });
      },
      fail: (err) => {
        console.log('❌ 获取位置失败:', err);
        wx.showToast({
          title: '无法获取位置',
          icon: 'none'
        });
      }
    });
  },

  // 加载所有问题帖子
  loadIssuePosts: function () {
    this.setData({ loading: true });
    
    wx.cloud.callFunction({
      name: 'getPublicData',
      data: {
        collection: 'posts',
        type: 'issue',  // 只加载问题类型
        page: 1,
        pageSize: 1000,  // 加载大量数据
        orderBy: 'createTime',
        order: 'desc'
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const posts = res.result.data || [];
        console.log('📊 加载到的问题帖子数量:', posts.length);
        
        // 过滤出有位置信息的帖子
        const postsWithLocation = posts.filter(post => {
          const location = post.location;
          if (!location) return false;
          
          // 检查是否有有效的经纬度
          if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
            return true;
          }
          
          // 检查 GeoJSON 格式
          if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
            return true;
          }
          
          return false;
        });
        
        console.log('📍 有位置信息的帖子数量:', postsWithLocation.length);
        
        this.setData({
          allPosts: postsWithLocation,
          filteredPosts: postsWithLocation
        }, () => {
          this.updateMarkers();
        });
      } else {
        throw new Error(res.result?.error || '加载失败');
      }
    }).catch(err => {
      console.error('❌ 加载问题帖子失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }).finally(() => {
      this.setData({ loading: false });
    });
  },

  // 更新地图标记
  updateMarkers: function () {
    const { filteredPosts } = this.data;
    
    const markers = filteredPosts.map((post, index) => {
      return this.postToMarker(post, index);
    }).filter(Boolean);
    
    console.log('🗺️ 生成的标记数量:', markers.length);
    
    this.setData({ markers });
  },

  // 将帖子转换为地图标记
  postToMarker: function (post, index) {
    const location = post.location;
    let latitude = 0;
    let longitude = 0;

    // 解析位置信息
    if (location) {
      // 格式1: { latitude: xx, longitude: xx }
      if (typeof location.latitude === 'number') {
        latitude = location.latitude;
        longitude = location.longitude;
      }
      // 格式2: GeoJSON { coordinates: [lng, lat] }
      else if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
        longitude = Number(location.coordinates[0]);
        latitude = Number(location.coordinates[1]);
      }
    }

    // 如果没有有效的位置信息，跳过
    if (!latitude || !longitude) {
      return null;
    }

    // 获取分类标签
    const categoryLabel = post.categoryName || getCategoryName(post.category) || '路障';
    
    // 获取标题
    const title = post.title || post.content || '路障反馈';
    const displayTitle = title.length > 15 ? `${title.slice(0, 15)}...` : title;
    
    // 根据状态选择图标颜色
    let iconPath = '/images/marker_alert.svg';
    let bgColor = '#ffffff';
    
    switch(post.status) {
      case 'pending':
        bgColor = '#fef3c7';  // 黄色 - 待处理
        break;
      case 'processing':
        bgColor = '#dbeafe';  // 蓝色 - 处理中
        break;
      case 'completed':
        bgColor = '#d1fae5';  // 绿色 - 已完成
        break;
      default:
        bgColor = '#ffffff';
    }

    return {
      id: index,
      latitude,
      longitude,
      iconPath: iconPath,
      width: 32,
      height: 32,
      callout: {
        content: `${categoryLabel}: ${displayTitle}`,
        color: '#1f2937',
        fontSize: 12,
        borderRadius: 8,
        padding: 8,
        bgColor: bgColor,
        display: 'BYCLICK',
      },
      postId: post._id  // 保存帖子ID用于跳转
    };
  },

  // 切换分类筛选
  switchCategory: function (e) {
    const categoryId = e.currentTarget.dataset.id;
    
    if (categoryId === this.data.selectedCategory) return;
    
    // 查找分类名称
    const category = this.data.categories.find(c => c.id === categoryId);
    const categoryName = category ? category.shortName : '全部分类';
    
    this.setData({ 
      selectedCategory: categoryId,
      selectedCategoryName: categoryName,
      showCategoryPanel: false  // 选择后关闭面板
    }, () => {
      this.filterPosts();
    });
  },

  // 筛选帖子
  filterPosts: function () {
    const { allPosts, selectedCategory } = this.data;
    
    let filteredPosts = allPosts;
    
    // 如果不是"全部"，则按分类筛选
    if (selectedCategory !== 'all') {
      filteredPosts = allPosts.filter(post => {
        // 兼容新旧数据
        const categoryId = post.category;
        const categoryName = post.categoryName;
        const targetName = getCategoryName(selectedCategory);
        
        return categoryId === selectedCategory || categoryName === targetName;
      });
    }
    
    console.log('🔍 筛选结果:', {
      分类: selectedCategory,
      原始数量: allPosts.length,
      筛选后数量: filteredPosts.length
    });
    
    this.setData({ filteredPosts }, () => {
      this.updateMarkers();
    });
  },

  // 点击地图标记
  handleMarkerTap: function (e) {
    const markerId = e.detail.markerId || e.markerId;
    if (typeof markerId !== 'number') return;
    
    const marker = this.data.markers[markerId];
    if (!marker || !marker.postId) return;
    
    // 跳转到帖子详情页
    wx.navigateTo({
      url: `/pages/post-detail/index?id=${marker.postId}`
    });
  },

  // 切换分类面板
  toggleCategoryPanel: function () {
    this.setData({
      showCategoryPanel: !this.data.showCategoryPanel
    });
  },

  // 刷新数据
  onRefresh: function () {
    this.getUserLocation();
    this.loadIssuePosts();
  },

  // 回到当前位置
  backToMyLocation: function () {
    this.getUserLocation();
  }
});
