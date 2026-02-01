// 用户类型配置
// 三类用户：普通用户、设计者、施工方
// 政府需要认证

const USER_TYPES = {
  // 1. 普通用户
  normal: {
    id: 'normal',
    label: '普通用户',
    description: '发现问题，参与讨论，监督施工',
    badge: {
      color: '#6B7280',
      icon: '👤',
      text: '用户'
    },
    permissions: {
      canVerifyIssue: false,        // 不能核实问题
      canCreateProject: false,       // 不能创建项目
      canPublishPolicy: false,       // 不能发布政策
      canProvideConsultation: false, // 不能提供咨询
      canDesignSolution: false,      // 不能设计方案
      canUpdateProgress: false,      // 不能更新施工进度
      canViewUserContact: false      // 不能查看用户联系方式
    },
    features: [
      '📸 发布问题反馈（随手拍）',
      '💬 参与社区讨论',
      '👀 监督施工进度',
      '✅ 验收改造成果',
      '⭐ 评价施工方',
      '🔍 查看改造案例'
    ]
  },

  // 2. 设计者（包含志愿者、学生、专家）
  designer: {
    id: 'designer',
    label: '设计者',
    description: '设计方案，解答问题，创建案例',
    badge: {
      color: '#10B981',
      icon: '🟢',
      text: '设计者'
    },
    permissions: {
      canVerifyIssue: true,          // 可以核实问题
      canCreateProject: false,       // 不能创建项目（只能设计方案）
      canPublishPolicy: false,       // 不能发布政策
      canProvideConsultation: true,  // 可以提供咨询
      canDesignSolution: true,       // 可以设计方案
      canUpdateProgress: false,      // 不能更新施工进度
      canViewUserContact: false      // 不能查看用户联系方式
    },
    features: [
      '📐 设计改造方案',
      '💬 回答专业问题',
      '✅ 核实问题真实性',
      '📚 创建改造案例',
      '💡 提供设计建议',
      '🎓 分享设计经验'
    ],
    profileFields: []  // 🔧 删除自定义字段
  },

  // 3. 施工方
  contractor: {
    id: 'contractor',
    label: '施工方',
    description: '承接改造，推进施工，展示案例',
    badge: {
      color: '#3B82F6',
      icon: '🔵',
      text: '施工方'
    },
    permissions: {
      canVerifyIssue: true,          // 可以核实问题
      canCreateProject: true,        // 可以创建施工项目
      canPublishPolicy: false,       // 不能发布政策
      canProvideConsultation: true,  // 可以提供咨询
      canDesignSolution: false,      // 不能设计方案（但可以施工）
      canUpdateProgress: true,       // 可以更新施工进度
      canViewUserContact: false      // 不能查看用户联系方式（除非用户主动联系）
    },
    features: [
      '📋 查看改造需求',
      '💰 提交报价方案',
      '🏗️ 创建施工项目',
      '📸 上传施工进度',
      '✅ 完工验收',
      '🏆 展示成功案例'
    ],
    profileFields: []  // 🔧 删除自定义字段
  },

  // 4. 社区工作者（需要认证）
  communityWorker: {
    id: 'communityWorker',
    label: '社区工作者',
    description: '服务社区，推进项目，协调资源',
    badge: {
      color: '#EF4444',
      icon: '🔴',
      text: '社区工作者'
    },
    needCertification: true,  // 需要认证
    permissions: {
      canVerifyIssue: true,          // 可以核实问题
      canCreateProject: true,        // 可以创建社区项目
      canPublishPolicy: true,        // 可以发布通知
      canProvideConsultation: true,  // 可以提供咨询
      canDesignSolution: false,      // 不能设计方案
      canUpdateProgress: false,      // 不能更新施工进度（但可以监督）
      canViewUserContact: true       // 可以查看用户联系方式
    },
    features: [
      '📊 查看数据统计',
      '📞 联系用户核实',
      '🎯 发布改造项目',
      '👷 协调施工方',
      '👀 监督施工进度',
      '📢 发布社区通知'
    ],
    profileFields: [
      // 🔧 社区工作者必须填写认证信息
      { key: 'community', label: '所属社区', placeholder: '如：XX社区居委会', required: true },
      { key: 'position', label: '职位', placeholder: '如：社区主任、网格员', required: true },
      { key: 'workId', label: '工作证号', placeholder: '用于认证', required: true }
    ]
  }
};

/**
 * 获取用户类型配置
 * @param {string} typeId - 用户类型ID
 * @returns {object} 用户类型配置
 */
function getUserTypeConfig(typeId) {
  return USER_TYPES[typeId] || USER_TYPES.normal;
}

/**
 * 获取所有用户类型列表
 * @returns {array} 用户类型列表
 */
function getAllTypes() {
  return Object.values(USER_TYPES);
}

/**
 * 获取不需要认证的用户类型
 * @returns {array} 用户类型列表
 */
function getPublicTypes() {
  return Object.values(USER_TYPES).filter(type => !type.needCertification);
}

/**
 * 检查用户是否有某个权限
 * @param {string} typeId - 用户类型ID
 * @param {string} permission - 权限名称
 * @returns {boolean} 是否有权限
 */
function hasPermission(typeId, permission) {
  const config = getUserTypeConfig(typeId);
  return config.permissions[permission] || false;
}

/**
 * 获取用户类型的徽章样式
 * @param {string} typeId - 用户类型ID
 * @returns {object} 徽章配置
 */
function getBadgeStyle(typeId) {
  const config = getUserTypeConfig(typeId);
  return config.badge;
}

module.exports = {
  USER_TYPES,
  getUserTypeConfig,
  getAllTypes,
  getPublicTypes,
  hasPermission,
  getBadgeStyle
};

