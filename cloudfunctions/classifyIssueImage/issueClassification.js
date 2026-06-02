const ISSUE_CLASSIFICATION_SCHEMA = {
  '台阶': ['第一级太高', '台阶面太滑', '扶手缺失或不适', '台阶破损'],
  '入户门': ['门槛太高', '门太窄', '把手太高或难拧', '开门太费力', '门前空间不足'],
  '电梯': ['电梯门太窄', '按钮太高', '无语音或盲文', '开关门太快'],
  '坡道': ['坡道太陡', '坡道太窄', '无扶手或高度不对', '坡面太滑', '坡道破损或头尾无平台', '坡道衔接平台有坎'],
  '雨水箅子': ['格栅孔太大', '箅子破损或缺失', '格栅方向不对'],
  '路障': ['间距太窄', '无醒目标识', '路障不稳', '挡住无障碍通道'],
  '盲道': ['盲道中断', '盲道被占用', '盲道破损', '颜色不明显', '起点或终点缺提示砖']
};

const ISSUE_CATEGORIES = Object.keys(ISSUE_CLASSIFICATION_SCHEMA);

function getSubtypes(category) {
  return ISSUE_CLASSIFICATION_SCHEMA[category] || [];
}

module.exports = {
  ISSUE_CLASSIFICATION_SCHEMA,
  ISSUE_CATEGORIES,
  getSubtypes
};
