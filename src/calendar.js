const { google } = require('googleapis');

// 認証クライアント作成
function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

// Calendarクライアント取得
function getCalendarClient() {
  const auth = getAuthClient();
  return google.calendar({ version: 'v3', auth });
}

// 予定追加（場所・メモ対応）
async function addEvent(date, time, title, duration = 60, location = null, memo = null) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  let event;

  if (time) {
    // 時間指定あり
    const startDateTime = `${date}T${time}:00`;
    const endDate = new Date(`${date}T${time}:00`);
    endDate.setMinutes(endDate.getMinutes() + duration);
    const endDateTime = endDate.toISOString().replace('Z', '');

    event = {
      summary: title,
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: endDateTime.split('.')[0],
        timeZone: 'Asia/Tokyo',
      },
    };
  } else {
    // 終日予定
    event = {
      summary: title,
      start: {
        date: date,
      },
      end: {
        date: date,
      },
    };
  }

  // 場所とメモを追加
  if (location) event.location = location;
  if (memo) event.description = memo;

  const result = await calendar.events.insert({
    calendarId,
    resource: event,
  });

  return result.data;
}

// 予定更新
async function updateEvent(date, title, newDate, newTime, newTitle) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  // 指定日の予定を取得
  const startOfDay = `${date}T00:00:00+09:00`;
  const endOfDay = `${date}T23:59:59+09:00`;

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: true,
  });

  const events = response.data.items || [];
  const targetEvent = events.find((ev) => ev.summary?.includes(title));

  if (!targetEvent) {
    return { success: false, error: '予定が見つかりません' };
  }

  // 更新内容を準備
  const updatedEvent = { ...targetEvent };

  if (newTitle) {
    updatedEvent.summary = newTitle;
  }

  if (newDate || newTime) {
    const targetDate = newDate || date;
    const hasTime = targetEvent.start.dateTime != null;

    if (newTime || hasTime) {
      const time = newTime || (hasTime ? targetEvent.start.dateTime.split('T')[1].substring(0, 5) : '09:00');
      const startDateTime = `${targetDate}T${time}:00`;

      // 元のイベントの長さを維持
      let duration = 60;
      if (targetEvent.start.dateTime && targetEvent.end.dateTime) {
        const startMs = new Date(targetEvent.start.dateTime).getTime();
        const endMs = new Date(targetEvent.end.dateTime).getTime();
        duration = (endMs - startMs) / 60000;
      }

      const endDate = new Date(`${targetDate}T${time}:00`);
      endDate.setMinutes(endDate.getMinutes() + duration);

      updatedEvent.start = { dateTime: startDateTime, timeZone: 'Asia/Tokyo' };
      updatedEvent.end = { dateTime: endDate.toISOString().split('.')[0], timeZone: 'Asia/Tokyo' };
    } else {
      updatedEvent.start = { date: targetDate };
      updatedEvent.end = { date: targetDate };
    }
  }

  await calendar.events.update({
    calendarId,
    eventId: targetEvent.id,
    resource: updatedEvent,
  });

  return { success: true, event: updatedEvent };
}

// 予定削除（タイトル部分一致）
async function deleteEvent(date, title) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  // 指定日の予定を取得
  const startOfDay = `${date}T00:00:00+09:00`;
  const endOfDay = `${date}T23:59:59+09:00`;

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: true,
  });

  const events = response.data.items || [];

  // タイトル部分一致で検索
  const targetEvent = events.find((ev) =>
    ev.summary?.includes(title)
  );

  if (!targetEvent) {
    return false;
  }

  await calendar.events.delete({
    calendarId,
    eventId: targetEvent.id,
  });

  return true;
}

// 期間指定で予定取得
async function getEvents(startDate, endDate) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  const timeMin = `${startDate}T00:00:00+09:00`;
  const timeMax = `${endDate}T23:59:59+09:00`;

  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

// 今日の予定を取得
async function getTodayEvents() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  return getEvents(today, today);
}

module.exports = {
  addEvent,
  updateEvent,
  deleteEvent,
  getEvents,
  getTodayEvents,
};
