// 期限監視・自動リマインド

const cron = require('node-cron');
const { pushMessage } = require('./line');
const { getAllTasks } = require('./task');
const { getRows } = require('./sheets');

// 期限監視を開始
function startDeadlineWatcher() {
  // 毎朝8時に期限チェック
  cron.schedule('0 8 * * *', async () => {
    console.log('期限チェック実行中...');

    const targets = process.env.DAILY_NOTIFICATION_TARGETS?.split(',') || [];

    for (const target of targets) {
      if (!target.trim()) continue;

      try {
        await checkDeadlines(target.trim());
      } catch (err) {
        console.error('期限チェックエラー:', err);
      }
    }
  }, {
    timezone: 'Asia/Tokyo',
  });

  // 夕方17時に未完了タスクリマインド
  cron.schedule('0 17 * * *', async () => {
    console.log('未完了タスクリマインド実行中...');

    const targets = process.env.DAILY_NOTIFICATION_TARGETS?.split(',') || [];

    for (const target of targets) {
      if (!target.trim()) continue;

      try {
        await remindPendingTasks(target.trim());
      } catch (err) {
        console.error('未完了リマインドエラー:', err);
      }
    }
  }, {
    timezone: 'Asia/Tokyo',
  });

  console.log('期限監視を開始しました（毎朝8時、夕方17時）');
}

// 期限チェック
async function checkDeadlines(groupId) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // スプレッドシートからタスクを取得
  const rows = await getRows('タスク');

  const overdue = [];
  const dueToday = [];
  const dueTomorrow = [];

  for (const row of rows) {
    if (row[5] === '完了') continue; // 完了済みはスキップ

    const dueDate = row[3]; // 期限列
    if (!dueDate) continue;

    const title = row[2];

    if (dueDate < today) {
      overdue.push({ title, dueDate });
    } else if (dueDate === today) {
      dueToday.push({ title });
    } else if (dueDate === tomorrow) {
      dueTomorrow.push({ title });
    }
  }

  // 通知メッセージ作成
  if (overdue.length === 0 && dueToday.length === 0 && dueTomorrow.length === 0) {
    return; // 通知なし
  }

  let msg = '⏰ 期限のお知らせ\n';

  if (overdue.length > 0) {
    msg += '\n🚨 【期限超過】';
    for (const task of overdue) {
      msg += `\n・${task.title}（${task.dueDate}）`;
    }
  }

  if (dueToday.length > 0) {
    msg += '\n\n⚠️ 【本日期限】';
    for (const task of dueToday) {
      msg += `\n・${task.title}`;
    }
  }

  if (dueTomorrow.length > 0) {
    msg += '\n\n📅 【明日期限】';
    for (const task of dueTomorrow) {
      msg += `\n・${task.title}`;
    }
  }

  await pushMessage(groupId, msg);
}

// 未完了タスクリマインド
async function remindPendingTasks(groupId) {
  const rows = await getRows('タスク');
  const today = new Date().toISOString().split('T')[0];

  // 今日作成された未完了タスク
  const pendingToday = rows.filter(row => {
    if (row[5] === '完了') return false;
    const created = row[6]?.split('T')[0];
    return created === today;
  });

  if (pendingToday.length === 0) return;

  let msg = '📋 本日の未完了タスク\n';
  for (const row of pendingToday) {
    msg += `\n・${row[2]}`;
  }
  msg += `\n\n残り${pendingToday.length}件です。お疲れさまでした！`;

  await pushMessage(groupId, msg);
}

module.exports = {
  startDeadlineWatcher,
  checkDeadlines,
  remindPendingTasks,
};
