// 週次レポート生成

const { getEvents } = require('./calendar');
const { getRows } = require('./sheets');

// 週の開始日と終了日を取得
function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 月曜開始

  const start = new Date(d.setDate(diff));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const format = (dt) => dt.toISOString().split('T')[0];
  return { start: format(start), end: format(end) };
}

// 先週の範囲を取得
function getLastWeekRange() {
  const today = new Date();
  today.setDate(today.getDate() - 7);
  return getWeekRange(today);
}

// 週次レポートを生成
async function generateWeeklyReport(userId) {
  const { start, end } = getLastWeekRange();

  let report = `📊 週次レポート（${start} 〜 ${end}）\n`;

  // カレンダーの予定
  try {
    const events = await getEvents(start, end);
    report += `\n【予定】${events.length}件`;
    if (events.length > 0) {
      for (const ev of events.slice(0, 5)) {
        const date = ev.start.dateTime?.split('T')[0] || ev.start.date;
        report += `\n・${date} ${ev.summary}`;
      }
      if (events.length > 5) {
        report += `\n  ...他${events.length - 5}件`;
      }
    }
  } catch (err) {
    console.error('予定取得エラー:', err);
  }

  // タスク（スプレッドシートから）
  try {
    const tasks = await getRows('タスク');
    const weekTasks = tasks.filter(t => {
      const created = t[6]?.split('T')[0];
      return created >= start && created <= end;
    });
    const completed = weekTasks.filter(t => t[5] === '完了');

    report += `\n\n【タスク】`;
    report += `\n・作成：${weekTasks.length}件`;
    report += `\n・完了：${completed.length}件`;
  } catch (err) {
    console.error('タスク取得エラー:', err);
  }

  // 経費（スプレッドシートから）
  try {
    const expenses = await getRows('経費');
    const weekExpenses = expenses.filter(e => {
      const date = e[0];
      return date >= start && date <= end;
    });

    let total = 0;
    for (const e of weekExpenses) {
      total += parseInt(e[2]) || 0;
    }

    report += `\n\n【経費】`;
    report += `\n・件数：${weekExpenses.length}件`;
    report += `\n・合計：¥${total.toLocaleString()}`;
  } catch (err) {
    console.error('経費取得エラー:', err);
  }

  // 勤怠（スプレッドシートから）
  try {
    const attendance = await getRows('勤怠');
    const weekAttendance = attendance.filter(a => {
      const date = a[0];
      return date >= start && date <= end && a[2] === userId;
    });

    const workDays = new Set(weekAttendance.map(a => a[0])).size;
    report += `\n\n【勤怠】`;
    report += `\n・出勤日数：${workDays}日`;
  } catch (err) {
    console.error('勤怠取得エラー:', err);
  }

  report += `\n\n今週も頑張りましょう！`;

  return report;
}

module.exports = {
  generateWeeklyReport,
  getWeekRange,
  getLastWeekRange,
};
