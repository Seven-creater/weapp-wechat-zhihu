# 微信小程序协作开发指南

## 📋 项目信息

- **仓库地址**: https://github.com/Seven-creater/weapp-wechat-zhihu.git
- **分支策略**: 使用 `master` 作为主分支

## 👥 邀请好友协作

### 方法一：GitHub 网页邀请（推荐）

1. **项目所有者操作**：

   - 访问 https://github.com/Seven-creater/weapp-wechat-zhihu
   - 点击「Settings」设置
   - 左侧菜单点击「Collaborators」
   - 点击「Add people」
   - 输入好友的 GitHub 用户名或邮箱
   - 发送邀请

2. **好友接受邀请**：
   - 访问 https://github.com/notifications
   - 找到邀请通知并接受
   - 获得仓库的写权限

### 方法二：设置团队协作

1. 创建 GitHub 组织：

   - https://github.com/organizations/new
   - 创建组织后，将项目转移到组织下

2. 邀请团队成员：
   - 在组织设置中添加成员
   - 设置成员的权限级别

## 🛠 本地开发环境设置

### 1. 克隆仓库

```bash
# 好友克隆仓库
git clone https://github.com/Seven-creater/weapp-wechat-zhihu.git
cd weapp-wechat-zhihu
```

### 2. 安装 Git（如果未安装）

- Windows: https://git-scm.com/download/win
- Mac: `brew install git`
- Linux: `sudo apt-get install git`

### 3. 配置 Git 用户信息

```bash
# 设置用户名
git config --global user.name "你的名字"

# 设置邮箱（建议与GitHub邮箱一致）
git config --global user.email "your@email.com"

# 设置默认编辑器（可选）
git config --global core.editor "code --wait"
```

### 4. 配置 SSH 密钥（推荐）

```bash
# 生成SSH密钥
ssh-keygen -t rsa -b 4096 -C "your@email.com"

# 查看公钥
cat ~/.ssh/id_rsa.pub

# 将公钥添加到GitHub
# 访问 https://github.com/settings/keys
# 点击「New SSH key」粘贴公钥
```

## 📝 日常开发流程

### 1. 开始工作前

```bash
# 确保本地代码最新
git checkout master
git pull origin master
```

### 2. 创建功能分支

```bash
# 创建新分支
git checkout -b feature/你的功能名

# 查看所有分支
git branch -a
```

### 3. 提交代码

```bash
# 查看修改状态
git status

# 添加修改的文件
git add .

# 或者添加单个文件
git add 文件名

# 提交修改
git commit -m "feat: 添加新功能描述"

# 提交规范：
# feat: 新功能
# fix: 修复bug
# docs: 文档更新
# style: 代码格式（不影响功能）
# refactor: 重构
# test: 测试相关
# chore: 构建/工具相关
```

### 4. 推送代码

```bash
# 第一次推送分支到远程
git push -u origin feature/你的功能名

# 后续推送
git push
```

### 5. 创建 Pull Request

1. 访问 https://github.com/Seven-creater/weapp-wechat-zhihu
2. 点击「Pull requests」→「New pull request」
3. 选择你的分支与 master 分支对比
4. 填写 PR 描述
5. 提交 PR，等待代码审核
6. 合并后删除功能分支

## 🔄 协同工作注意事项

### 避免冲突的技巧

1. **频繁同步**：

   - 每天开始工作前 `git pull origin master`
   - 定期将 master 合并到你的分支

2. **及时沟通**：

   - 与团队成员沟通正在开发的功能
   - 避免多人同时修改同一个文件

3. **小步提交**：
   - 将大功能拆分成小步骤提交
   - 每次提交都应该是一个完整的、可工作的状态

### 解决冲突

```bash
# 拉取最新代码
git fetch origin
git merge origin/master

# 如果有冲突，手动解决后
git add 冲突文件
git commit -m "merge: 解决冲突"
```

## 📱 微信开发者工具设置

1. 打开微信开发者工具
2. 点击「导入项目」
3. 选择项目目录
4. AppID 使用测试号或正式号
5. 勾选「使用云开发」（如果需要）

## 🐛 常见问题

### Q: 提交时提示权限错误？

A:

```bash
# 检查远程URL
git remote -v

# 如果是HTTPS，尝试使用SSH
git remote set-url origin git@github.com:Seven-creater/weapp-wechat-zhihu.git
```

### Q: 想要放弃本地修改？

```bash
# 放弃所有本地修改（谨慎使用）
git checkout -- .
git clean -fd
```

### Q: 想要回退到之前的版本？

```bash
# 查看提交历史
git log --oneline

# 回退到指定版本
git checkout 版本号
```

## 📚 参考资源

- Git 官方文档：https://git-scm.com/doc
- GitHub 帮助：https://help.github.com
- Git 交互式学习：https://learngitbranching.js.org

## ✅ 快速开始清单

- [ ] Git 安装完成
- [ ] GitHub 账户创建
- [ ] 收到协作邀请并接受
- [ ] 本地仓库克隆完成
- [ ] .gitignore 已配置
- [ ] 了解基本 Git 命令
- [ ] 微信开发者工具导入项目测试

---

**happy coding! 🚀**
