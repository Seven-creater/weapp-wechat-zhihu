// utils/categories.js
// 无障碍设施分类配置

/**
 * 设施分类列表
 */
const FACILITY_CATEGORIES = [
  { id: 'parking', name: '无障碍停车位', shortName: '停车位' },
  { id: 'restroom', name: '无障碍卫生间', shortName: '卫生间' },
  { id: 'ramp', name: '无障碍坡道', shortName: '坡道' },
  { id: 'elevator', name: '无障碍电梯', shortName: '电梯' },
  { id: 'lift', name: '无障碍升降台', shortName: '升降台' },
  { id: 'service', name: '无障碍服务台', shortName: '服务台' },
  { id: 'passage', name: '无障碍通道', shortName: '通道' },
  { id: 'entrance', name: '无障碍出入口', shortName: '出入口' },
  { id: 'door', name: '无障碍门', shortName: '门' },
  { id: 'steps', name: '台阶', shortName: '台阶' },
  { id: 'handrail', name: '扶手', shortName: '扶手' },
  { id: 'tactile', name: '盲道', shortName: '盲道' },
  { id: 'curb', name: '缘石坡道', shortName: '缘石坡道' }
];

/**
 * 根据ID获取分类名称
 * @param {string} id - 分类ID
 * @returns {string} 分类名称
 */
function getCategoryName(id) {
  const category = FACILITY_CATEGORIES.find(cat => cat.id === id);
  return category ? category.name : '未分类';
}

/**
 * 根据ID获取分类短名称
 * @param {string} id - 分类ID
 * @returns {string} 分类短名称
 */
function getCategoryShortName(id) {
  const category = FACILITY_CATEGORIES.find(cat => cat.id === id);
  return category ? category.shortName : '未分类';
}

/**
 * 根据名称获取分类ID
 * @param {string} name - 分类名称
 * @returns {string} 分类ID
 */
function getCategoryId(name) {
  const category = FACILITY_CATEGORIES.find(cat => cat.name === name);
  return category ? category.id : '';
}

/**
 * 获取所有分类
 * @returns {Array} 分类列表
 */
function getAllCategories() {
  return FACILITY_CATEGORIES;
}

/**
 * 获取案例导航分类（包含"全部"）
 * @returns {Array} 导航分类列表
 */
function getCaseNavCategories() {
  return [
    { id: 'all', name: '全部', shortName: '全部' },
    ...FACILITY_CATEGORIES
  ];
}

module.exports = {
  FACILITY_CATEGORIES,
  getCategoryName,
  getCategoryShortName,
  getCategoryId,
  getAllCategories,
  getCaseNavCategories
};

