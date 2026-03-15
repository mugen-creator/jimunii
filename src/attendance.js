// 勤怠管理

const { appendRow, getRows } = require('./sheets');

// 出勤/退勤を記録
async function recordAttendance(userId, type, memo = '') {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].substring(0, 5);

  const record = {
    userId,
    date,
    time,
    type, // 'in' or 'out'
    memo,
    timestamp: now.toISOString(),
  };

  // スプレッドシートに保存
  await appendRow('勤怠', [
    record.date,
    record.time,
    record.userId,
    type === 'in' ? '出勤' : '退勤',
    memo,
  ]);

  return record;
}

// 今日の勤怠状況を取得
async function getTodayAttendance(userId) {
  const today = new Date().toISOString().split('T')[0];
  const rows = await getRows('勤怠');

  const todayRecords = rows.filter(row =>
    row[0] === today && row[2] === userId
  );

  const clockIn = todayRecords.find(r => r[3] === '出勤');
  const clockOut = todayRecords.find(r => r[3] === '退勤');

  return {
    clockIn: clockIn ? clockIn[1] : null,
    clockOut: clockOut ? clockOut[1] : null,
  };
}

// 月の勤怠集計
async function getMonthlyAttendance(userId, year, month) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await getRows('勤怠');

  const monthRecords = rows.filter(row =>
    row[0]?.startsWith(monthStr) && row[2] === userId
  );

  // 日ごとにグループ化
  const byDate = {};
  for (const row of monthRecords) {
    const date = row[0];
    if (!byDate[date]) byDate[date] = {};
    if (row[3] === '出勤') byDate[date].in = row[1];
    if (row[3] === '退勤') byDate[date].out = row[1];
  }

  // 勤務時間を計算
  let totalMinutes = 0;
  let workDays = 0;

  for (const [date, times] of Object.entries(byDate)) {
    if (times.in && times.out) {
      const inTime = times.in.split(':').map(Number);
      const outTime = times.out.split(':').map(Number);
      const minutes = (outTime[0] * 60 + outTime[1]) - (inTime[0] * 60 + inTime[1]);
      if (minutes > 0) {
        totalMinutes += minutes;
        workDays++;
      }
    }
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainMinutes = totalMinutes % 60;

  return {
    workDays,
    totalTime: `${totalHours}時間${remainMinutes}分`,
    totalMinutes,
    records: byDate,
  };
}

// 勤怠フォーマット
function formatAttendanceStatus(today) {
  let msg = '🕐 今日の勤怠\n';

  if (today.clockIn) {
    msg += `\n出勤：${today.clockIn}`;
  } else {
    msg += '\n出勤：まだ';
  }

  if (today.clockOut) {
    msg += `\n退勤：${today.clockOut}`;

    // 勤務時間計算
    if (today.clockIn) {
      const inTime = today.clockIn.split(':').map(Number);
      const outTime = today.clockOut.split(':').map(Number);
      const minutes = (outTime[0] * 60 + outTime[1]) - (inTime[0] * 60 + inTime[1]);
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      msg += `\n\n⏱️ 勤務時間：${hours}時間${mins}分`;
    }
  } else {
    msg += '\n退勤：まだ';
  }

  return msg;
}

module.exports = {
  recordAttendance,
  getTodayAttendance,
  getMonthlyAttendance,
  formatAttendanceStatus,
};
