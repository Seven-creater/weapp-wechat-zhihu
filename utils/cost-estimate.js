/**
 * 造价估算工具模块
 * 用于无障碍改造方案的造价计算
 */

// 建材价格数据库（示例数据，实际应从云数据库或API获取）
const MATERIAL_PRICES = {
  // 坡道材料
  ramp: {
    concrete: { name: '混凝土坡道', unit: '平方米', price: 180, quality: 'standard' },
    aluminum: { name: '铝合金坡道', unit: '平方米', price: 350, quality: 'premium' },
    rubber: { name: '橡胶防滑坡道', unit: '平方米', price: 220, quality: 'standard' },
  },
  // 扶手材料
  handrail: {
    stainless: { name: '不锈钢扶手', unit: '米', price: 120, quality: 'standard' },
    aluminum: { name: '铝合金扶手', unit: '米', price: 150, quality: 'premium' },
    pvc: { name: 'PVC扶手', unit: '米', price: 80, quality: 'economy' },
  },
  // 地面材料
  floor: {
    antislip: { name: '防滑地砖', unit: '平方米', price: 85, quality: 'standard' },
    rubber: { name: '橡胶地板', unit: '平方米', price: 120, quality: 'premium' },
    tactile: { name: '盲道砖', unit: '平方米', price: 95, quality: 'standard' },
  },
  // 门禁改造
  door: {
    automatic: { name: '自动门系统', unit: '套', price: 3500, quality: 'premium' },
    widening: { name: '门洞加宽', unit: '处', price: 800, quality: 'standard' },
    threshold: { name: '门槛消除', unit: '处', price: 200, quality: 'standard' },
  },
  // 卫生间设施
  toilet: {
    grab_bar: { name: '安全扶手', unit: '套', price: 280, quality: 'standard' },
    toilet_seat: { name: '无障碍坐便器', unit: '套', price: 1200, quality: 'standard' },
    sink: { name: '无障碍洗手台', unit: '套', price: 800, quality: 'standard' },
  },
  // 电梯改造
  elevator: {
    button_lowering: { name: '按钮降低改造', unit: '套', price: 500, quality: 'standard' },
    voice_system: { name: '语音播报系统', unit: '套', price: 1500, quality: 'premium' },
    braille: { name: '盲文标识', unit: '套', price: 300, quality: 'standard' },
  },
};

// 人工费用标准（元/工日）
const LABOR_COSTS = {
  mason: { name: '泥瓦工', dailyRate: 350, skill: 'standard' },
  carpenter: { name: '木工', dailyRate: 380, skill: 'standard' },
  electrician: { name: '电工', dailyRate: 400, skill: 'specialized' },
  plumber: { name: '水暖工', dailyRate: 380, skill: 'specialized' },
  painter: { name: '油漆工', dailyRate: 320, skill: 'standard' },
  general: { name: '普工', dailyRate: 280, skill: 'basic' },
};

// 改造方案模板库
const RENOVATION_TEMPLATES = {
  // 无障碍坡道改造
  accessible_ramp: {
    name: '无障碍坡道改造',
    category: '无障碍坡道',
    materials: [
      { type: 'ramp', subtype: 'concrete', quantity: 0, unit: '平方米' },
      { type: 'handrail', subtype: 'stainless', quantity: 0, unit: '米' },
      { type: 'floor', subtype: 'antislip', quantity: 0, unit: '平方米' },
    ],
    labor: [
      { type: 'mason', days: 2 },
      { type: 'general', days: 1 },
    ],
    description: '根据《无障碍设计规范》GB50763，坡道坡度不应大于1:12',
  },
  // 无障碍卫生间改造
  accessible_toilet: {
    name: '无障碍卫生间改造',
    category: '无障碍卫生间',
    materials: [
      { type: 'toilet', subtype: 'grab_bar', quantity: 1, unit: '套' },
      { type: 'toilet', subtype: 'toilet_seat', quantity: 1, unit: '套' },
      { type: 'door', subtype: 'widening', quantity: 1, unit: '处' },
      { type: 'floor', subtype: 'antislip', quantity: 0, unit: '平方米' },
    ],
    labor: [
      { type: 'plumber', days: 2 },
      { type: 'mason', days: 1 },
      { type: 'electrician', days: 0.5 },
    ],
    description: '卫生间门宽不应小于800mm，内部应设置安全扶手',
  },
  // 门槛消除
  threshold_removal: {
    name: '门槛消除改造',
    category: '无障碍通道',
    materials: [
      { type: 'door', subtype: 'threshold', quantity: 1, unit: '处' },
      { type: 'floor', subtype: 'antislip', quantity: 2, unit: '平方米' },
    ],
    labor: [
      { type: 'mason', days: 0.5 },
      { type: 'general', days: 0.5 },
    ],
    description: '消除门槛，确保轮椅通行无障碍',
  },
  // 扶手安装
  handrail_installation: {
    name: '扶手安装',
    category: '无障碍扶手',
    materials: [
      { type: 'handrail', subtype: 'stainless', quantity: 0, unit: '米' },
    ],
    labor: [
      { type: 'carpenter', days: 1 },
    ],
    description: '扶手高度应为850-900mm，直径30-40mm',
  },
  // 电梯无障碍改造
  elevator_accessibility: {
    name: '电梯无障碍改造',
    category: '无障碍电梯',
    materials: [
      { type: 'elevator', subtype: 'button_lowering', quantity: 1, unit: '套' },
      { type: 'elevator', subtype: 'voice_system', quantity: 1, unit: '套' },
      { type: 'elevator', subtype: 'braille', quantity: 1, unit: '套' },
    ],
    labor: [
      { type: 'electrician', days: 2 },
      { type: 'general', days: 1 },
    ],
    description: '按钮高度不应高于1100mm，应设置语音播报和盲文标识',
  },
};

/**
 * 根据障碍类型匹配改造方案模板
 * @param {string} category - 障碍分类
 * @param {object} aiDiagnosis - AI诊断结果
 * @returns {object} 匹配的方案模板
 */
function matchTemplate(category, aiDiagnosis) {
  const categoryMap = {
    '无障碍坡道': 'accessible_ramp',
    '无障碍卫生间': 'accessible_toilet',
    '无障碍通道': 'threshold_removal',
    '无障碍扶手': 'handrail_installation',
    '无障碍电梯': 'elevator_accessibility',
    '无障碍停车位': 'accessible_ramp', // 停车位也需要坡道
    '无障碍升降台': 'elevator_accessibility',
  };

  const templateKey = categoryMap[category] || 'accessible_ramp';
  return JSON.parse(JSON.stringify(RENOVATION_TEMPLATES[templateKey]));
}

/**
 * 计算材料费用
 * @param {array} materials - 材料清单
 * @returns {object} 材料费用明细
 */
function calculateMaterialCost(materials) {
  let totalCost = 0;
  const details = [];

  materials.forEach(item => {
    if (item.quantity > 0) {
      const priceInfo = MATERIAL_PRICES[item.type]?.[item.subtype];
      if (priceInfo) {
        const itemCost = priceInfo.price * item.quantity;
        totalCost += itemCost;
        details.push({
          name: priceInfo.name,
          quantity: item.quantity,
          unit: priceInfo.unit,
          unitPrice: priceInfo.price,
          totalPrice: itemCost,
          quality: priceInfo.quality,
        });
      }
    }
  });

  return { totalCost, details };
}

/**
 * 计算人工费用
 * @param {array} labor - 人工清单
 * @returns {object} 人工费用明细
 */
function calculateLaborCost(labor) {
  let totalCost = 0;
  const details = [];

  labor.forEach(item => {
    if (item.days > 0) {
      const laborInfo = LABOR_COSTS[item.type];
      if (laborInfo) {
        const itemCost = laborInfo.dailyRate * item.days;
        totalCost += itemCost;
        details.push({
          name: laborInfo.name,
          days: item.days,
          dailyRate: laborInfo.dailyRate,
          totalPrice: itemCost,
          skill: laborInfo.skill,
        });
      }
    }
  });

  return { totalCost, details };
}

/**
 * 生成完整的造价估算报告
 * @param {string} category - 障碍分类
 * @param {object} params - 参数（面积、长度等）
 * @param {object} aiDiagnosis - AI诊断结果
 * @returns {object} 造价估算报告
 */
function generateCostEstimate(category, params = {}, aiDiagnosis = {}) {
  // 1. 匹配方案模板
  const template = matchTemplate(category, aiDiagnosis);

  // 2. 根据参数调整材料数量
  if (params.area) {
    template.materials.forEach(item => {
      if (item.unit === '平方米' && item.quantity === 0) {
        item.quantity = params.area;
      }
    });
  }

  if (params.length) {
    template.materials.forEach(item => {
      if (item.unit === '米' && item.quantity === 0) {
        item.quantity = params.length;
      }
    });
  }

  // 3. 计算材料费用
  const materialCost = calculateMaterialCost(template.materials);

  // 4. 计算人工费用
  const laborCost = calculateLaborCost(template.labor);

  // 5. 计算其他费用（管理费、税费等）
  const subtotal = materialCost.totalCost + laborCost.totalCost;
  const managementFee = subtotal * 0.08; // 8% 管理费
  const tax = subtotal * 0.03; // 3% 税费
  const contingency = subtotal * 0.05; // 5% 不可预见费

  const totalCost = subtotal + managementFee + tax + contingency;

  // 6. 生成报告
  return {
    projectName: template.name,
    category: template.category,
    description: template.description,
    materials: materialCost.details,
    labor: laborCost.details,
    costBreakdown: {
      materialCost: materialCost.totalCost,
      laborCost: laborCost.totalCost,
      managementFee: managementFee,
      tax: tax,
      contingency: contingency,
      subtotal: subtotal,
      total: totalCost,
    },
    estimatedDuration: template.labor.reduce((sum, item) => sum + item.days, 0),
    createdAt: new Date().toISOString(),
  };
}

/**
 * 格式化金额显示
 * @param {number} amount - 金额
 * @returns {string} 格式化后的金额字符串
 */
function formatCurrency(amount) {
  return `¥${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

module.exports = {
  MATERIAL_PRICES,
  LABOR_COSTS,
  RENOVATION_TEMPLATES,
  matchTemplate,
  calculateMaterialCost,
  calculateLaborCost,
  generateCostEstimate,
  formatCurrency,
};









