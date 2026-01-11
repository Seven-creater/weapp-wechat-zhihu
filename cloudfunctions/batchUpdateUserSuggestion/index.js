const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    // 更新 solutions 集合
    console.log('开始更新 solutions 集合...')
    let solutionsCount = 0
    
    // 获取所有没有 userSuggestion 字段的 solutions
    let solutionsRes = await db.collection('solutions')
      .where({
        userSuggestion: _.exists(false)
      })
      .get()
    
    console.log('找到 ' + solutionsRes.data.length + ' 个需要更新的 solutions')
    
    for (const doc of solutionsRes.data) {
      await db.collection('solutions').doc(doc._id).update({
        data: {
          userSuggestion: '我觉得这里应该加个坡道，这样轮椅用户就能方便进出了'
        }
      })
      solutionsCount++
      console.log('已更新 solution: ' + doc._id)
    }
    
    // 更新 posts 集合
    console.log('开始更新 posts 集合...')
    let postsCount = 0
    
    // 获取所有没有 userSuggestion 字段的 posts
    let postsRes = await db.collection('posts')
      .where({
        userSuggestion: _.exists(false)
      })
      .get()
    
    console.log('找到 ' + postsRes.data.length + ' 个需要更新的 posts')
    
    for (const doc of postsRes.data) {
      await db.collection('posts').doc(doc._id).update({
        data: {
          userSuggestion: '我觉得这里应该加个坡道，这样轮椅用户就能方便进出了'
        }
      })
      postsCount++
      console.log('已更新 post: ' + doc._id)
    }
    
    return {
      success: true,
      message: '批量更新成功！solutions: ' + solutionsCount + ' 个，posts: ' + postsCount + ' 个',
      solutionsCount: solutionsCount,
      postsCount: postsCount
    }
    
  } catch (err) {
    console.error('批量更新失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
