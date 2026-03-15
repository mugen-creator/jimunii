const crypto = require('crypto');
const axios = require('axios');
const { parseIntent } = require('./gemini');
const { addEvent, deleteEvent, getEvents } = require('./calendar');
const { handleFileMessage, handleFileSaveIntent } = require('./drive');
const { setReminder } = require('./reminder');

const LINE_API_URL = 'https://api.line.me/v2/bot/message';
const CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
const CHANNEL_SECRET = (process.env.LINE_CHANNEL_SECRET || '').trim();

// 署名検証
function validateSignature(body, signature) {
  const hash = crypto
    .createHmac('sha256', CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// LINE返信
async function replyMessage(replyToken, message) {
  try {
    await axios.post(
      `${LINE_API_URL}/reply`,
      {
        replyToken,
        messages: [{ type: 'text', text: message }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
  } catch (err) {
    console.error('LINE返信エラー:', err.response?.data || err.message);
  }
}

// LINEプッシュ通知
async function pushMessage(to, message) {
  try {
    await axios.post(
      `${LINE_API_URL}/push`,
      {
        to,
        messages: [{ type: 'text', text: message }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
  } catch (err) {
    console.error('LINEプッシュエラー:', err.response?.data || err.message);
  }
}

// ファイルコンテンツ取得
async function getFileContent(messageId) {
  const response = await axios.get(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      responseType: 'arraybuffer',
    }
  );
  return Buffer.from(response.data);
}

// 曜日取得
function getDayOfWeek(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

// 日付フォーマット
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dow = getDayOfWeek(dateStr);
  return `${month}/${day}（${dow}）`;
}

// Webhook処理
async function handleWebhook(req) {
  const signature = req.headers['x-line-signature'];
  const body = req.body;

  if (!validateSignature(body, signature)) {
    console.error('署名検証失敗');
    return;
  }

  const events = JSON.parse(body.toString()).events;

  for (const event of events) {
    if (event.type !== 'message') continue;

    const replyToken = event.replyToken;
    const source = event.source;
    const userId = source.userId;
    const groupId = source.groupId || userId;

    try {
      // ファイルメッセージの処理
      if (event.message.type === 'file') {
        const fileContent = await getFileContent(event.message.id);
        const fileName = event.message.fileName;
        handleFileMessage(groupId, fileContent, fileName);
        await replyMessage(replyToken, '📎 ファイルを受け取りました。\n保存先やファイル名を教えてください。');
        continue;
      }

      // テキストメッセージの処理
      if (event.message.type === 'text') {
        const text = event.message.text;

        // 意図解析
        const result = await parseIntent(text);

        if (!result || !result.intent) {
          await replyMessage(replyToken, '❌ メッセージを理解できませんでした。もう一度お試しください。');
          continue;
        }

        const { intent, params } = result;

        switch (intent) {
          case 'calendar_add': {
            const eventResult = await addEvent(
              params.date,
              params.time,
              params.title,
              params.duration || 60
            );
            const dateFormatted = formatDate(params.date);
            const timeStr = params.time || '終日';
            await replyMessage(
              replyToken,
              `✅ 予定を登録しました！\n\n📅 ${dateFormatted} ${timeStr} ${params.title}`
            );
            break;
          }

          case 'calendar_delete': {
            const deleted = await deleteEvent(params.date, params.title);
            if (deleted) {
              await replyMessage(replyToken, `✅ 予定「${params.title}」を削除しました。`);
            } else {
              await replyMessage(replyToken, `❌ 予定「${params.title}」が見つかりませんでした。`);
            }
            break;
          }

          case 'calendar_get': {
            const startDate = params.startDate || params.date;
            const endDate = params.endDate || params.date;
            const events = await getEvents(startDate, endDate);

            if (events.length === 0) {
              await replyMessage(replyToken, '📅 該当する予定はありません。');
            } else {
              // 日付ごとにグループ化
              const grouped = {};
              for (const ev of events) {
                const dateKey = ev.start.dateTime
                  ? ev.start.dateTime.split('T')[0]
                  : ev.start.date;
                if (!grouped[dateKey]) grouped[dateKey] = [];
                const timeStr = ev.start.dateTime
                  ? ev.start.dateTime.split('T')[1].substring(0, 5)
                  : '終日';
                grouped[dateKey].push(`- ${timeStr}：${ev.summary}`);
              }

              let msg = `📅 予定一覧\n`;
              for (const [date, items] of Object.entries(grouped)) {
                msg += `\n${formatDate(date)}\n${items.join('\n')}`;
              }
              await replyMessage(replyToken, msg);
            }
            break;
          }

          case 'drive_save': {
            const saveResult = await handleFileSaveIntent(groupId, params.fileName, params.folderPath);
            if (saveResult.success) {
              await replyMessage(
                replyToken,
                `✅ 保存しました！\n\n📁 フォルダ：${saveResult.folderName}\n🔗 ${saveResult.fileUrl}`
              );
            } else {
              await replyMessage(replyToken, `❌ ${saveResult.error}`);
            }
            break;
          }

          case 'reminder_set': {
            const reminderResult = setReminder(
              groupId,
              params.date,
              params.time,
              params.title || params.message
            );
            if (reminderResult.success) {
              const dateFormatted = formatDate(params.date);
              await replyMessage(
                replyToken,
                `⏰ リマインダーをセットしました！\n\n📅 ${dateFormatted} ${params.time}\n「${params.title || params.message}」をお知らせします`
              );
            } else {
              await replyMessage(replyToken, `❌ リマインダーの設定に失敗しました。`);
            }
            break;
          }

          case 'chat': {
            await replyMessage(replyToken, params.message || result.response || 'お手伝いできることはありますか？');
            break;
          }

          default:
            await replyMessage(replyToken, '❌ 対応していない操作です。');
        }
      }
    } catch (err) {
      console.error('メッセージ処理エラー:', err);
      await replyMessage(replyToken, `❌ エラーが発生しました：${err.message}`);
    }
  }
}

module.exports = {
  handleWebhook,
  pushMessage,
  formatDate,
  getDayOfWeek,
};
