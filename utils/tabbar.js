// 更新自定义 tabBar 选中状态
function updateTabBarSelected(pagePath) {
  if (typeof this.getTabBar === 'function' && this.getTabBar()) {
    const tabBar = this.getTabBar();
    const list = tabBar.data.list;
    const selected = list.findIndex(item => item.pagePath === pagePath);
    
    if (selected !== -1) {
      tabBar.setData({
        selected: selected
      });
    }
  }
}

module.exports = {
  updateTabBarSelected
};

