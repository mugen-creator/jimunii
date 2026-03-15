const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const MODEL = 'llama-3.3-70b-versatile';

// 今日の日付を取得
function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 意図解析システムプロンプト
function getIntentSystemPrompt(lastAction) {
  let contextInfo = '';
  if (lastAction) {
    contextInfo = `
直前の操作:
- 種類: ${lastAction.intent}
- 日付: ${lastAction.date || 'なし'}
- タイトル: ${lastAction.title || 'なし'}
- 時間: ${lastAction.time || 'なし'}

「それ」「その予定」「変更して」「やっぱりキャンセル」などは直前の操作を参照している可能性があります。
`;
  }

  return `あなたはLINEで動く事務アシスタントです。
ユーザーのメッセージを解析し、以下のJSONのみを返してください。
余分なテキストやマークダウンは一切不要です。

${contextInfo}

intent一覧:
- calendar_add: 予定を登録する
- calendar_delete: 予定を削除する
- calendar_get: 予定を確認する
- calendar_update: 予定を変更する（時間や日付の変更）
- drive_save: ファイルを保存する
- reminder_set: リマインダーをセットする
- chat: 上記以外の雑談・質問

JSON形式:
{
  "intent": "calendar_add" | "calendar_delete" | "calendar_get" | "calendar_update" | "drive_save" | "reminder_set" | "chat",
  "params": {
    "date": "YYYY-MM-DD形式",
    "startDate": "期間の開始日（calendar_get用）",
    "endDate": "期間の終了日（calendar_get用）",
    "time": "HH:MM形式",
    "title": "予定のタイトル",
    "newDate": "変更後の日付（calendar_update用）",
    "newTime": "変更後の時間（calendar_update用）",
    "newTitle": "変更後のタイトル（calendar_update用）",
    "duration": 分数（数値）,
    "location": "場所（オプション）",
    "memo": "メモ（オプション）",
    "fileName": "ファイル名",
    "folderPath": "保存先フォルダ（例: 請求書、経費/3月）",
    "message": "雑談の応答テキスト"
  },
  "refersPrevious": true/false（直前の操作を参照しているかどうか）
}

注意事項:
- 日付が相対表現（明日、来週月曜など）の場合は、今日の日付から計算してYYYY-MM-DD形式に変換
- 「今週」は今日から今週日曜まで、「来週」は来週月曜から日曜まで
- 時間が指定されていない予定は終日予定としてtimeを省略
- 「それ」「その予定」「やっぱり」「キャンセル」など曖昧な表現は直前の操作を参照
- chatの場合はparamsにmessageを含め、会話の流れを考慮した返答を入れる
- 場所が「@」や「で」の後に続く場合はlocationに抽出
- JSONのみを返し、説明文は一切付けない

今日の日付: ${getToday()}`;
}

// Groq APIを呼び出す
async function callGroq(systemPrompt, messages) {
  const response = await axios.post(
    GROQ_API_URL,
    {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.3,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
    }
  );
  return response.data.choices[0].message.content;
}

// メッセージから意図を解析（会話履歴付き）
async function parseIntent(message, conversationHistory = [], lastAction = null) {
  try {
    // 会話履歴をGroq形式に変換
    const messages = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 現在のメッセージを追加
    messages.push({ role: 'user', content: message });

    const response = await callGroq(getIntentSystemPrompt(lastAction), messages);

    // JSONを抽出（マークダウンのコードブロックが含まれる場合に対応）
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // 余分な空白を削除
    jsonStr = jsonStr.trim();

    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('Groq解析エラー:', err.response?.data || err.message);
    return null;
  }
}

// 雑談用の応答生成（会話履歴付き）
async function generateChatResponse(message, conversationHistory = []) {
  try {
    const systemPrompt = '合同会社無限の事務アシスタントとして、簡潔に日本語で答えてください。会話の流れを考慮して自然に応答してください。';

    const messages = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    messages.push({ role: 'user', content: message });

    return await callGroq(systemPrompt, messages);
  } catch (err) {
    console.error('Groq応答エラー:', err.response?.data || err.message);
    return 'すみません、応答を生成できませんでした。';
  }
}

module.exports = {
  parseIntent,
  generateChatResponse,
};
