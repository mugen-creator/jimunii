const cron = require('node-cron');
const { getTodayEvents } = require('./calendar');
const { pushMessage, formatDate, getDayOfWeek } = require('./line');

// リマインダー保存（メモリ上）
const reminders = [];

// リマインダーをセット
function setReminder(groupId, date, time, message) {
  try {
    const [hour, minute] = time.split(':').map(Number);

    const reminder = {
      groupId,
      date,
      time,
      message,
      executed: false,
    };

    reminders.push(reminder);

    // 指定時刻にcronジョブを設定
    const cronExpression = `${minute} ${hour} * * *`;

    const job = cron.schedule(cronExpression, async () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      if (todayStr === date && !reminder.executed) {
        reminder.executed = true;
        await pushMessage(groupId, `⏰ リマインダー\n\n${message}`);
        job.stop();
      }
    });

    return { success: true };
  } catch (err) {
    console.error('リマインダー設定エラー:', err);
    return { success: false, error: err.message };
  }
}

// 毎朝10時の予定通知を開始
function startDailyReminder() {
  // 毎朝10時に実行
  cron.schedule('0 10 * * *', async () => {
    console.log('毎朝通知を実行中...');

    try {
      const events = await getTodayEvents();

      if (events.length === 0) {
        console.log('本日の予定はありません');
        return;
      }

      // 予定一覧を作成
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const dow = getDayOfWeek(now.toISOString().split('T')[0]);

      let msg = `📅 本日の予定（${month}月${day}日（${dow}））\n`;

      for (const event of events) {
        const timeStr = event.start.dateTime
          ? event.start.dateTime.split('T')[1].substring(0, 5)
          : '終日';
        msg += `\n- ${timeStr}：${event.summary}`;
      }

      // NOTE: 実際の運用では、通知先のグループIDまたはユーザーIDを
      // データベースや環境変数で管理する必要があります
      const notificationTargets = process.env.DAILY_NOTIFICATION_TARGETS?.split(',') || [];

      for (const target of notificationTargets) {
        if (target.trim()) {
          await pushMessage(target.trim(), msg);
        }
      }

      console.log('毎朝通知完了');
    } catch (err) {
      console.error('毎朝通知エラー:', err);
    }
  }, {
    timezone: 'Asia/Tokyo',
  });

  console.log('毎朝10時の予定通知スケジューラーを開始しました');
}

// 全リマインダーを取得（デバッグ用）
function getReminders() {
  return reminders;
}

module.exports = {
  setReminder,
  startDailyReminder,
  getReminders,
};
