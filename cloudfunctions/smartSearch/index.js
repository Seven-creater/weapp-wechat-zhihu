// 云函数：smartSearch - 基于DeepSeek API的智能语义搜索
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = 'sk-89c1cf66b1b145488fff26f421860840';

// 智能搜索主函数
exports.main = async (event, context) => {
  try {
    const { keyword, collection } = event;
    
    // 参数验证
    if (!keyword || !collection) {
      return {
        success: false,
        error: '缺少必要参数',
        code: 400
      };
    }
    
    // 验证集合名
    const validCollections = ['solutions', 'posts'];
    if (!validCollections.includes(collection)) {
      return {
        success: false,
        error: '无效的集合名称',
        validCollections,
        code: 400
      };
    }
    
    console.log(`开始智能搜索：集合=${collection}, 关键词=${keyword}`);
    
    // 1. 调用DeepSeek API获取核心关键词
    console.log('调用DeepSeek API分析关键词...');
    
    const aiResponse = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个搜索查询优化器。用户输入了：\'${keyword}\'。请分析其意图，提取 3-5 个核心搜索关键词。只返回关键词，用逗号分隔，不要任何其他废话。'
              .replace('${keyword}', keyword)
          }
        ],
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    let keywords = [];
    if (aiResponse.data && aiResponse.data.choices && aiResponse.data.choices[0]) {
      const rawKeywords = aiResponse.data.choices[0].message.content.trim();
      keywords = rawKeywords.split(',').map(key => key.trim()).filter(Boolean);
      console.log(`DeepSeek返回关键词：${rawKeywords}`);
    }
    
    // 如果AI没有返回有效关键词，使用原始关键词
    if (keywords.length === 0) {
      keywords = [keyword];
      console.log('使用原始关键词进行搜索');
    }
    
    // 2. 构造数据库查询条件
    console.log('构造数据库查询条件...');
    
    // 根据集合类型确定要查询的字段
    let fieldsToSearch = ['title', 'content'];
    if (collection === 'solutions') {
      fieldsToSearch = ['title', 'content', 'description', 'aiAnalysis'];
    } else if (collection === 'posts') {
      fieldsToSearch = ['title', 'content', 'aiDiagnosis', 'aiSolution'];
    }
    
    // 构造查询条件
    const keywordConditions = keywords.map(key => {
      // 对每个关键词，构造OR条件，匹配所有相关字段
      const fieldConditions = fieldsToSearch.map(field => {
        return {
          [field]: db.RegExp({ regexp: key, options: 'i' })
        };
      });
      return _.or(fieldConditions);
    });
    
    // 最终查询条件：只要匹配任意一个关键词即可
    const finalCondition = _.or(keywordConditions);
    
    // 3. 查询数据库
    console.log('查询数据库...');
    
    const result = await db.collection(collection)
      .where(finalCondition)
      .orderBy('createTime', 'desc')
      .limit(100) // 限制返回100条
      .get();
    
    console.log(`查询完成：找到${result.data.length}条记录`);
    
    // 4. 返回结果
    return {
      success: true,
      data: result.data,
      keyword: keyword,
      aiKeywords: keywords,
      count: result.data.length,
      collection: collection
    };
    
  } catch (error) {
    console.error('智能搜索失败:', error);
    
    // 错误处理
    let errorMessage = '搜索失败，请重试';
    let errorCode = 500;
    
    if (error.response) {
      // DeepSeek API错误
      errorMessage = `API错误: ${error.response.status} ${error.response.statusText}`;
      errorCode = error.response.status;
    } else if (error.request) {
      // 请求发送失败
      errorMessage = '网络错误，无法连接到AI服务';
    }
    
    return {
      success: false,
      error: errorMessage,
      details: error.message,
      code: errorCode
    };
  }
};
