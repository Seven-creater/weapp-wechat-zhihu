// config/index.js - 全局配置文件

module.exports = {
  // 云开发环境ID（请替换为你的实际环境ID）
  cloudEnvId: 'your-cloud-env-id',
  
  // 腾讯地图密钥（请替换为你的实际密钥）
  tencentMapKey: 'QTABZ-SI5CL-JMMPF-MJMVG-AND33-UHFCE',
  
  // API配置
  apiTimeout: 10000, // 接口超时时间（毫秒）
  
  // 分页配置
  pageSize: 20, // 默认每页数量
  
  // 图片配置
  maxImageSize: 10 * 1024 * 1024, // 最大图片大小 10MB
  maxImageCount: 9, // 最多上传图片数量
  
  // 地图配置
  defaultLocation: {
    latitude: 28.2282, // 长沙默认纬度
    longitude: 112.9388, // 长沙默认经度
  },
  
  // 搜索配置
  searchRadius: 5000, // 默认搜索半径（米）
  
  // 缓存配置
  cacheExpireTime: 30 * 60 * 1000, // 缓存过期时间 30分钟
};









