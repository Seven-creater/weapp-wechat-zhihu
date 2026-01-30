// pages/test-diagnosis/index.js
Page({
  data: {
    diagnosisResult: '',
    isRunning: false,
  },

  onLoad: function () {
    console.log('诊断页面加载');
  },

  /**
   * 开始诊断
   */
  startDiagnosis: function () {
    this.setData({
      isRunning: true,
      diagnosisResult: '正在诊断...\n\n',
    });

    this.runDiagnosis();
  },

  /**
   * 执行诊断
   */
  runDiagnosis: async function () {
    let result = '';

    try {
      // 1. 检查 openid
      result += '【步骤1】检查用户登录状态\n';
      const openid = wx.getStorageSync('openid');
      if (openid) {
        result += `✅ 已登录\n`;
        result += `   openid: ${openid.substring(0, 10)}...\n\n`;
      } else {
        result += `❌ 未登录\n`;
        result += `   请先登录！\n\n`;
        this.setData({ diagnosisResult: result, isRunning: false });
        return;
      }

      // 2. 检查本地用户信息
      result += '【步骤2】检查本地用户信息\n';
      const localUserInfo = wx.getStorageSync('userInfo');
      if (localUserInfo && localUserInfo.nickName) {
        result += `✅ 本地信息存在\n`;
        result += `   昵称: ${localUserInfo.nickName}\n`;
        result += `   头像: ${localUserInfo.avatarUrl ? '已设置' : '未设置'}\n\n`;
      } else {
        result += `❌ 本地信息缺失\n\n`;
      }
      this.setData({ diagnosisResult: result });

      // 3. 测试 updateUserInfo 云函数
      result += '【步骤3】测试 updateUserInfo 云函数\n';
      this.setData({ diagnosisResult: result });
      
      try {
        const testRes = await wx.cloud.callFunction({
          name: 'updateUserInfo',
          data: {
            nickName: localUserInfo?.nickName || '测试用户',
            avatarUrl: localUserInfo?.avatarUrl || '/images/zhi.png',
            phoneNumber: '13800138000',
          },
        });

        if (testRes.result && testRes.result.success) {
          result += `✅ 云函数正常\n`;
          result += `   用户信息已保存到数据库\n\n`;
        } else {
          result += `❌ 云函数返回错误\n`;
          result += `   错误: ${testRes.result?.error || '未知错误'}\n\n`;
        }
      } catch (err) {
        result += `❌ 云函数调用失败\n`;
        result += `   错误: ${err.errMsg || err.message}\n`;
        result += `   ⚠️ 请检查云函数是否已部署！\n\n`;
      }
      this.setData({ diagnosisResult: result });

      // 4. 检查数据库中的用户记录
      result += '【步骤4】检查数据库用户记录\n';
      this.setData({ diagnosisResult: result });

      try {
        const dbRes = await wx.cloud.database().collection('users').where({
          _openid: openid,
        }).get();

        if (dbRes.data && dbRes.data.length > 0) {
          const user = dbRes.data[0];
          result += `✅ 找到用户记录\n`;
          result += `   昵称: ${user.userInfo?.nickName || '❌ 缺失'}\n`;
          result += `   头像: ${user.userInfo?.avatarUrl ? '✅ 已设置' : '❌ 缺失'}\n`;
          result += `   手机号: ${user.phoneNumber ? '✅ 已设置' : '❌ 缺失'}\n`;
          result += `   统计数据: ${user.stats ? '✅ 已设置' : '❌ 缺失'}\n`;
          
          if (user.stats) {
            result += `   - 关注数: ${user.stats.followingCount || 0}\n`;
            result += `   - 粉丝数: ${user.stats.followersCount || 0}\n`;
            result += `   - 点赞数: ${user.stats.likesCount || 0}\n`;
          }
          result += '\n';
        } else {
          result += `❌ 未找到用户记录\n`;
          result += `   ⚠️ 需要重新登录！\n\n`;
        }
      } catch (err) {
        result += `❌ 数据库查询失败\n`;
        result += `   错误: ${err.errMsg || err.message}\n\n`;
      }
      this.setData({ diagnosisResult: result });

      // 5. 测试 updateUserStats 云函数
      result += '【步骤5】测试 updateUserStats 云函数\n';
      this.setData({ diagnosisResult: result });

      try {
        await wx.cloud.callFunction({
          name: 'updateUserStats',
          data: {},
        });
        result += `✅ 云函数正常\n\n`;
      } catch (err) {
        result += `❌ 云函数调用失败\n`;
        result += `   错误: ${err.errMsg || err.message}\n`;
        result += `   ⚠️ 请检查云函数是否已部署！\n\n`;
      }
      this.setData({ diagnosisResult: result });

      // 6. 检查 follows 集合
      result += '【步骤6】检查关注数据\n';
      this.setData({ diagnosisResult: result });

      try {
        const followsRes = await wx.cloud.database().collection('follows').where({
          followerId: openid,
        }).count();

        result += `✅ 关注集合正常\n`;
        result += `   我关注的人数: ${followsRes.total}\n\n`;
      } catch (err) {
        result += `❌ 关注集合查询失败\n`;
        result += `   错误: ${err.errMsg || err.message}\n\n`;
      }
      this.setData({ diagnosisResult: result });

      // 7. 总结
      result += '━━━━━━━━━━━━━━━━━━━━\n';
      result += '【诊断总结】\n\n';
      
      if (result.includes('❌ 云函数调用失败')) {
        result += '⚠️ 发现问题：云函数未部署\n\n';
        result += '解决方案：\n';
        result += '1. 打开微信开发者工具\n';
        result += '2. 找到 cloudfunctions/updateUserInfo\n';
        result += '3. 右键 → 上传并部署：云端安装依赖\n';
        result += '4. 同样部署 updateUserStats\n';
        result += '5. 重新运行诊断\n\n';
      } else if (result.includes('❌ 未找到用户记录')) {
        result += '⚠️ 发现问题：用户信息未保存\n\n';
        result += '解决方案：\n';
        result += '1. 退出登录\n';
        result += '2. 重新登录\n';
        result += '3. 填写昵称和手机号\n';
        result += '4. 完成登录\n';
        result += '5. 重新运行诊断\n\n';
      } else {
        result += '✅ 所有检查通过！\n\n';
        result += '如果仍有问题，请检查：\n';
        result += '1. 其他用户是否也重新登录\n';
        result += '2. 数据库权限设置是否正确\n';
        result += '3. 云函数日志是否有错误\n\n';
      }

      result += '诊断完成！\n';

    } catch (err) {
      result += `\n❌ 诊断过程出错\n`;
      result += `错误: ${err.message || err.errMsg}\n`;
    }

    this.setData({
      diagnosisResult: result,
      isRunning: false,
    });
  },

  /**
   * 复制结果
   */
  copyResult: function () {
    wx.setClipboardData({
      data: this.data.diagnosisResult,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success',
        });
      },
    });
  },

  /**
   * 前往登录页
   */
  goToLogin: function () {
    wx.navigateTo({
      url: '/pages/login/index',
    });
  },
});

