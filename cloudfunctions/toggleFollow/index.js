// 云函数：toggleFollow - 关注/取消关注用户
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { targetId, action } = event; // action: 'follow' 或 'unfollow'

  try {
    // 验证参数
    if (!targetId) {
      return { success: false, error: '缺少目标用户ID' };
    }

    if (!action || !['follow', 'unfollow'].includes(action)) {
      return { success: false, error: '无效的操作类型' };
    }

    // 不能关注自己
    if (OPENID === targetId) {
      return { success: false, error: '不能关注自己' };
    }

    // 使用事务处理
    const transaction = await db.startTransaction();

    try {
      if (action === 'follow') {
        // 关注用户
        // 1. 检查是否已经关注
        const existingFollow = await transaction.collection('follows')
          .where({
            followerId: OPENID,
            targetId: targetId
          })
          .get();

        if (existingFollow.data.length > 0) {
          await transaction.rollback();
          return { success: false, error: '已经关注过了' };
        }

        // 2. 添加关注记录
        await transaction.collection('follows').add({
          data: {
            followerId: OPENID,
            targetId: targetId,
            isMutual: false,
            createTime: db.serverDate()
          }
        });

        // 3. 检查是否互关
        const reverseFollow = await transaction.collection('follows')
          .where({
            followerId: targetId,
            targetId: OPENID
          })
          .get();

        const isMutual = reverseFollow.data.length > 0;

        // 4. 如果互关，更新两条记录
        if (isMutual) {
          await transaction.collection('follows')
            .where({
              followerId: OPENID,
              targetId: targetId
            })
            .update({
              data: {
                isMutual: true
              }
            });

          await transaction.collection('follows')
            .where({
              followerId: targetId,
              targetId: OPENID
            })
            .update({
              data: {
                isMutual: true
              }
            });
        }

        // 5. 更新统计数据（使用 where 查询）
        // 更新当前用户的关注数
        await transaction.collection('users')
          .where({
            _openid: OPENID
          })
          .update({
            data: {
              'stats.followingCount': _.inc(1)
            }
          });

        // 更新目标用户的粉丝数
        await transaction.collection('users')
          .where({
            _openid: targetId
          })
          .update({
            data: {
              'stats.followersCount': _.inc(1)
            }
          });

        // 提交事务
        await transaction.commit();

        return { 
          success: true, 
          action: 'follow',
          isMutual: isMutual
        };

      } else {
        // 取消关注
        // 1. 查找关注记录
        const followRes = await transaction.collection('follows')
          .where({
            followerId: OPENID,
            targetId: targetId
          })
          .get();

        if (followRes.data.length === 0) {
          await transaction.rollback();
          return { success: false, error: '未找到关注记录' };
        }

        // 2. 删除关注记录
        const followId = followRes.data[0]._id;
        await transaction.collection('follows').doc(followId).remove();

        // 3. 如果之前是互关，更新对方的记录
        await transaction.collection('follows')
          .where({
            followerId: targetId,
            targetId: OPENID
          })
          .update({
            data: {
              isMutual: false
            }
          });

        // 4. 更新统计数据（使用 where 查询）
        // 更新当前用户的关注数
        await transaction.collection('users')
          .where({
            _openid: OPENID
          })
          .update({
            data: {
              'stats.followingCount': _.inc(-1)
            }
          });

        // 更新目标用户的粉丝数
        await transaction.collection('users')
          .where({
            _openid: targetId
          })
          .update({
            data: {
              'stats.followersCount': _.inc(-1)
            }
          });

        // 提交事务
        await transaction.commit();

        return { 
          success: true, 
          action: 'unfollow'
        };
      }

    } catch (err) {
      // 回滚事务
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        console.error('回滚失败:', rollbackErr);
      }
      throw err;
    }

  } catch (err) {
    console.error('toggleFollow error:', err);
    return { 
      success: false, 
      error: err.message || '操作失败'
    };
  }
};

