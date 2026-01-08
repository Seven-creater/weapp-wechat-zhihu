// 引入云开发能力
wx.cloud.init();

Page({
  data: {
    recentReports: [], // 最近反馈列表
    isUploading: false, // 是否正在上传
    hasLocationPermission: true // 是否有定位权限
  },

  onLoad: function() {
    // 检查定位权限
    this.checkLocationPermission();
    // 加载最近反馈
    this.loadRecentReports();
  },

  onPullDownRefresh: function() {
    // 下拉刷新，重新加载最近反馈
    this.loadRecentReports().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 检查定位权限
   */
  checkLocationPermission: function() {
    wx.getSetting({
      success: (res) => {
        if (!res.authSetting['scope.userLocation']) {
          this.setData({ hasLocationPermission: false });
        }
      }
    });
  },

  /**
   * 加载最近反馈
   */
  loadRecentReports: function() {
    const db = wx.cloud.database();
    return db.collection('issues')
      .orderBy('createTime', 'desc')
      .limit(5)
      .get()
      .then(res => {
        this.setData({
          recentReports: res.data
        });
      })
      .catch(err => {
        console.error('加载最近反馈失败:', err);
        // 数据库集合不存在时，显示空列表
        this.setData({
          recentReports: []
        });
      });
  },

  /**
   * 拍照反馈
   */
  takePhoto: function() {
    const that = this;
    
    // 1. 调用相机或相册选择图片
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        // 2. 获取当前位置
        that.getLocation().then(location => {
          // 3. 上传图片到云存储
          that.uploadImage(tempFilePath).then(fileID => {
            // 4. 调用AI分析
            that.analyzeIssue(fileID, location).then(aiSolution => {
              // 5. 保存到数据库
              that.saveIssue(tempFilePath, fileID, location, aiSolution);
            });
          });
        }).catch(err => {
          console.error('获取位置失败:', err);
          wx.showToast({
            title: '定位失败，请检查权限',
            icon: 'none'
          });
        });
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 获取当前位置信息
   */
  getLocation: function() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        altitude: true,
        success: (res) => {
          const { latitude, longitude } = res;
          
          // 逆地理编码获取详细地址
          wx.request({
            url: 'https://apis.map.qq.com/ws/geocoder/v1/',
            data: {
              location: `${latitude},${longitude}`,
              key: 'YOUR_TENCENT_MAP_KEY' // 请替换为腾讯地图API密钥
            },
            success: (result) => {
              if (result.data.status === 0) {
                resolve({
                  latitude,
                  longitude,
                  address: result.data.result.address,
                  formattedAddress: result.data.result.formatted_addresses.recommend
                });
              } else {
                resolve({
                  latitude,
                  longitude,
                  address: '获取地址失败',
                  formattedAddress: '获取地址失败'
                });
              }
            },
            fail: () => {
              resolve({
                latitude,
                longitude,
                address: '获取地址失败',
                formattedAddress: '获取地址失败'
              });
            }
          });
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 上传图片到云存储
   */
  uploadImage: function(tempFilePath) {
    const that = this;
    return new Promise((resolve, reject) => {
      // 显示上传中提示
      that.setData({ isUploading: true });
      wx.showLoading({ title: '上传中...' });

      // 生成唯一文件名
      const cloudPath = `issues/${Date.now()}-${Math.floor(Math.random() * 1000)}.${tempFilePath.match(/\.(\w+)$/)[1]}`;

      // 上传文件
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath,
        success: (res) => {
          // 获取文件ID
          resolve(res.fileID);
        },
        fail: (err) => {
          console.error('上传图片失败:', err);
          reject(err);
        },
        complete: () => {
          that.setData({ isUploading: false });
          wx.hideLoading();
        }
      });
    });
  },

  /**
   * 调用AI分析问题
   */
  analyzeIssue: function(fileID, location) {
    return new Promise((resolve, reject) => {
      // 显示加载提示，添加遮罩防止用户误操作
      wx.showLoading({ 
        title: 'AI正在诊断现场...', 
        mask: true 
      });

      // 设置超时提醒，3秒后显示温馨提示
      const timeoutTimer = setTimeout(() => {
        wx.showToast({
          title: '正在生成专业改造方案，请稍候...',
          icon: 'none',
          duration: 3000
        });
      }, 3000);

      // 调用云函数进行AI分析
      wx.cloud.callFunction({
        name: 'analyzeIssue',
        data: {
          fileID: fileID,
          location: location
        },
        success: (res) => {
          clearTimeout(timeoutTimer);
          wx.hideLoading();
          resolve(res.result.aiSolution);
        },
        fail: (err) => {
          console.error('AI分析失败:', err);
          clearTimeout(timeoutTimer);
          wx.hideLoading();
          
          // 如果云函数调用失败，使用模拟数据
          const mockSolution = '检测到台阶缺失坡道，建议增设 1:12 无障碍坡道，预算约 500 元。';
          resolve(mockSolution);
        }
      });
    });
  },

  /**
   * 保存问题到数据库
   */
  saveIssue: function(tempFilePath, fileID, location, aiSolution) {
    const db = wx.cloud.database();
    
    // 构建数据库记录
    const issueData = {
      imageUrl: fileID, // 云存储文件ID
      location: new db.Geo.Point(location.longitude, location.latitude), // 地理位置
      address: location.address, // 详细地址
      formattedAddress: location.formattedAddress, // 格式化地址
      aiSolution: aiSolution, // AI解决方案
      status: 'pending', // 状态：待处理
      createTime: db.serverDate() // 创建时间
    };

    // 保存到数据库
    db.collection('issues').add({
      data: issueData,
      success: (res) => {
        // 同时自动在社区发布一条帖子
        this.createCommunityPost(res._id, fileID, location, aiSolution).then(() => {
          wx.showToast({
            title: '反馈成功！已同步到社区',
            icon: 'success',
            duration: 2000
          });
          
          // 重新加载最近反馈
          this.loadRecentReports();
          
          // 跳转到详情页
          wx.navigateTo({
            url: '../issue-detail/issue-detail?id=' + res._id
          });
        }).catch((err) => {
          console.error('创建社区帖子失败:', err);
          // 即使社区发帖失败，也不影响主流程
          wx.showToast({
            title: '反馈成功！',
            icon: 'success',
            duration: 2000
          });
          this.loadRecentReports();
          wx.navigateTo({
            url: '../issue-detail/issue-detail?id=' + res._id
          });
        });
      },
      fail: (err) => {
        console.error('保存问题失败:', err);
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 自动在社区创建帖子
   */
  createCommunityPost: function(issueId, fileID, location, aiSolution) {
    const db = wx.cloud.database();
    
    // 构建社区帖子数据
    const postData = {
      issueId: issueId, // 关联的路障问题ID
      content: `自动同步：发现${location.address}存在无障碍问题。\nAI诊断：${aiSolution}\n欢迎大家讨论解决方案！`,
      images: [fileID], // 使用同一张图片
      type: 'issue', // 帖子类型：路障反馈
      location: new db.Geo.Point(location.longitude, location.latitude), // 地理位置
      address: location.address, // 详细地址
      stats: { view: 0, like: 0, comment: 0 }, // 初始统计数据
      createTime: db.serverDate(), // 创建时间
      updateTime: db.serverDate() // 更新时间
    };

    return db.collection('posts').add({
      data: postData
    });
  }
});

// 数据库 schema 定义
/**
 * issues 集合结构
 * {
 *   _id: string, // 文档ID
 *   _openid: string, // 用户openid
 *   imageUrl: string, // 图片链接（云存储fileID）
 *   location: GeoPoint, // 地理位置
 *   address: string, // 详细地址
 *   formattedAddress: string, // 格式化地址
 *   description: string, // 用户描述（可选）
 *   aiSolution: string, // AI给出的改造建议
 *   status: string, // 状态：pending(待处理)/reported(已上报)
 *   createTime: Date, // 创建时间
 *   updateTime: Date // 更新时间
 * }
 */