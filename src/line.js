const crypto = require('crypto');
const axios = require('axios');
const { parseIntent } = require('./gemini');
const { addEvent, addRecurringEvent, updateEvent, deleteEvent, getEvents } = require('./calendar');
const { handleFileMessage, handleFileSaveIntent } = require('./drive');
const { setReminder } = require('./reminder');
const { getHistory, addMessage, setLastAction, getLastAction } = require('./conversation');
const { extractText, parseReceipt, formatReceiptResult } = require('./ocr');
const { registerExpense, formatExpenseList, getMonthlyTotal } = require('./expense');
const { addTask, completeTask, deleteTask, getAllTasks, formatTaskList } = require('./task');

// 最後に読み取ったレシート情報を保存
const lastReceipts = new Map();

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

      // 画像メッセージの処理（OCR）
      if (event.message.type === 'image') {
        await replyMessage(replyToken, '📸 画像を読み取り中...');

        try {
          const imageBuffer = await getFileContent(event.message.id);
          const text = await extractText(imageBuffer);
          const receipt = parseReceipt(text);
          const resultMsg = formatReceiptResult(receipt);

          // レシート情報を保存（後で経費登録に使う）
          if (receipt.total) {
            lastReceipts.set(groupId, {
              ...receipt,
              timestamp: Date.now(),
            });
          }

          // プッシュメッセージで結果を送信（replyTokenは既に使用済み）
          await pushMessage(groupId, resultMsg);
        } catch (err) {
          console.error('OCRエラー:', err);
          await pushMessage(groupId, '❌ 画像の読み取りに失敗しました。');
        }
        continue;
      }

      // テキストメッセージの処理
      if (event.message.type === 'text') {
        const text = event.message.text;

        // 会話履歴と前回の操作を取得
        const history = getHistory(groupId);
        const lastAction = getLastAction(groupId);

        // 意図解析（会話履歴付き）
        const result = await parseIntent(text, history, lastAction);

        // ユーザーメッセージを履歴に追加
        addMessage(groupId, 'user', text);

        if (!result || !result.intent) {
          const errorMsg = '❌ メッセージを理解できませんでした。もう一度お試しください。';
          addMessage(groupId, 'assistant', errorMsg);
          await replyMessage(replyToken, errorMsg);
          continue;
        }

        let { intent, params } = result;

        // 直前の操作を参照している場合、パラメータを補完
        if (result.refersPrevious && lastAction) {
          if (!params.date && lastAction.date) params.date = lastAction.date;
          if (!params.title && lastAction.title) params.title = lastAction.title;
          if (!params.time && lastAction.time) params.time = lastAction.time;
        }

        let responseMsg = '';

        switch (intent) {
          case 'calendar_add': {
            const eventResult = await addEvent(
              params.date,
              params.time,
              params.title,
              params.duration || 60,
              params.location,
              params.memo
            );
            const dateFormatted = formatDate(params.date);
            const timeStr = params.time || '終日';
            let msg = `✅ 予定を登録しました！\n\n📅 ${dateFormatted} ${timeStr}\n📝 ${params.title}`;
            if (params.location) msg += `\n📍 ${params.location}`;
            if (params.memo) msg += `\n💬 ${params.memo}`;
            responseMsg = msg;

            // 最後の操作を保存
            setLastAction(groupId, {
              intent: 'calendar_add',
              date: params.date,
              time: params.time,
              title: params.title,
            });
            break;
          }

          case 'calendar_add_recurring': {
            const recurrence = params.recurrence || { frequency: 'weekly' };
            await addRecurringEvent(
              params.date,
              params.time,
              params.title,
              recurrence,
              params.duration || 60,
              params.location
            );

            // 繰り返しパターンの説明を生成
            let patternStr = '';
            switch (recurrence.frequency) {
              case 'daily':
                patternStr = recurrence.interval > 1 ? `${recurrence.interval}日ごと` : '毎日';
                break;
              case 'weekly':
                if (recurrence.days && recurrence.days.length > 0) {
                  patternStr = `毎週${recurrence.days.join('・')}曜`;
                } else {
                  patternStr = recurrence.interval > 1 ? `${recurrence.interval}週間ごと` : '毎週';
                }
                break;
              case 'monthly':
                if (recurrence.dayOfMonth) {
                  patternStr = `毎月${recurrence.dayOfMonth}日`;
                } else {
                  patternStr = '毎月';
                }
                break;
              case 'yearly':
                patternStr = '毎年';
                break;
            }

            const dateFormatted = formatDate(params.date);
            const timeStr = params.time || '終日';
            let msg = `✅ 繰り返し予定を登録しました！\n\n🔄 ${patternStr}\n📅 開始：${dateFormatted} ${timeStr}\n📝 ${params.title}`;
            if (params.location) msg += `\n📍 ${params.location}`;
            responseMsg = msg;

            setLastAction(groupId, {
              intent: 'calendar_add_recurring',
              date: params.date,
              time: params.time,
              title: params.title,
            });
            break;
          }

          case 'calendar_update': {
            const updateResult = await updateEvent(
              params.date,
              params.title,
              params.newDate,
              params.newTime,
              params.newTitle
            );
            if (updateResult.success) {
              const newDateStr = params.newDate || params.date;
              const newTimeStr = params.newTime || params.time || '終日';
              const newTitleStr = params.newTitle || params.title;
              responseMsg = `✅ 予定を変更しました！\n\n📅 ${formatDate(newDateStr)} ${newTimeStr}\n📝 ${newTitleStr}`;

              setLastAction(groupId, {
                intent: 'calendar_update',
                date: newDateStr,
                time: params.newTime || params.time,
                title: newTitleStr,
              });
            } else {
              responseMsg = `❌ ${updateResult.error}`;
            }
            break;
          }

          case 'calendar_delete': {
            const deleted = await deleteEvent(params.date, params.title);
            if (deleted) {
              responseMsg = `✅ 予定「${params.title}」を削除しました。`;
            } else {
              responseMsg = `❌ 予定「${params.title}」が見つかりませんでした。`;
            }
            break;
          }

          case 'calendar_get': {
            const startDate = params.startDate || params.date;
            const endDate = params.endDate || params.date;
            const calEvents = await getEvents(startDate, endDate);

            if (calEvents.length === 0) {
              responseMsg = '📅 該当する予定はありません。';
            } else {
              // 日付ごとにグループ化
              const grouped = {};
              for (const ev of calEvents) {
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
              responseMsg = msg;
            }
            break;
          }

          case 'drive_save': {
            const saveResult = await handleFileSaveIntent(groupId, params.fileName, params.folderPath);
            if (saveResult.success) {
              responseMsg = `✅ 保存しました！\n\n📁 フォルダ：${saveResult.folderName}\n🔗 ${saveResult.fileUrl}`;
            } else {
              responseMsg = `❌ ${saveResult.error}`;
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
              responseMsg = `⏰ リマインダーをセットしました！\n\n📅 ${dateFormatted} ${params.time}\n「${params.title || params.message}」をお知らせします`;

              setLastAction(groupId, {
                intent: 'reminder_set',
                date: params.date,
                time: params.time,
                title: params.title || params.message,
              });
            } else {
              responseMsg = `❌ リマインダーの設定に失敗しました。`;
            }
            break;
          }

          case 'expense_register': {
            // 直前のレシート読み取り結果を使用
            const lastReceipt = lastReceipts.get(groupId);

            if (!lastReceipt || Date.now() - lastReceipt.timestamp > 10 * 60 * 1000) {
              responseMsg = '❌ レシート情報が見つかりません。\n先にレシートの画像を送ってください。';
            } else {
              const expense = await registerExpense({
                date: lastReceipt.date,
                store: lastReceipt.store,
                amount: lastReceipt.total,
                category: params.expenseCategory || 'その他',
                memo: params.expenseMemo || '',
              });

              responseMsg = `✅ 経費を登録しました！\n\n📅 ${expense.date}\n🏪 ${expense.store}\n💰 ¥${expense.amount.toLocaleString()}\n📂 ${expense.category}`;
              if (expense.memo) responseMsg += `\n💬 ${expense.memo}`;

              // 使用済みのレシート情報を削除
              lastReceipts.delete(groupId);
            }
            break;
          }

          case 'task_add': {
            const task = await addTask(
              groupId,
              params.taskTitle || params.title,
              params.taskDueDate || params.date,
              params.taskPriority || 'normal'
            );
            const priorityLabel = { high: '🔴 高', normal: '⚪ 中', low: '🔵 低' };
            let msg = `✅ タスクを追加しました！\n\n📝 ${task.title}`;
            if (task.dueDate) msg += `\n📅 期限：${task.dueDate}`;
            msg += `\n⚡ 優先度：${priorityLabel[task.priority]}`;
            responseMsg = msg;
            break;
          }

          case 'task_complete': {
            const completed = await completeTask(groupId, params.taskTitle || params.title);
            if (completed) {
              responseMsg = `✅ タスク「${completed.title}」を完了しました！`;
            } else {
              responseMsg = '❌ タスクが見つかりませんでした。';
            }
            break;
          }

          case 'task_delete': {
            const deleted = deleteTask(groupId, params.taskTitle || params.title);
            if (deleted) {
              responseMsg = `✅ タスクを削除しました。`;
            } else {
              responseMsg = '❌ タスクが見つかりませんでした。';
            }
            break;
          }

          case 'task_list': {
            const allTasks = getAllTasks(groupId);
            responseMsg = formatTaskList(allTasks, true);
            break;
          }

          case 'chat': {
            responseMsg = params.message || result.response || 'お手伝いできることはありますか？';
            break;
          }

          default:
            responseMsg = '❌ 対応していない操作です。';
        }

        // アシスタントの返答を履歴に追加
        addMessage(groupId, 'assistant', responseMsg);
        await replyMessage(replyToken, responseMsg);
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
