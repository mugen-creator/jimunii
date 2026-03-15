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
function getIntentSystemPrompt() {
  return `あなたはLINEで動く事務アシスタントです。
ユーザーのメッセージを解析し、以下のJSONのみを返してください。
余分なテキストやマークダウンは一切不要です。

intent一覧:
- calendar_add: 予定を登録する
- calendar_delete: 予定を削除する
- calendar_get: 予定を確認する
- drive_save: ファイルを保存する
- reminder_set: リマインダーをセットする
- chat: 上記以外の雑談・質問

JSON形式:
{
  "intent": "calendar_add" | "calendar_delete" | "calendar_get" | "drive_save" | "reminder_set" | "chat",
  "params": {
    "date": "YYYY-MM-DD形式",
    "startDate": "期間の開始日（calendar_get用）",
    "endDate": "期間の終了日（calendar_get用）",
    "time": "HH:MM形式",
    "title": "予定のタイトル",
    "duration": 分数（数値）,
    "fileName": "ファイル名",
    "folderPath": "保存先フォルダ（例: 請求書、経費/3月）",
    "message": "雑談の応答テキスト"
  }
}

注意事項:
- 日付が相対表現（明日、来週月曜など）の場合は、今日の日付から計算してYYYY-MM-DD形式に変換
- 「今週」は今日から今週日曜まで、「来週」は来週月曜から日曜まで
- 時間が指定されていない予定は終日予定としてtimeを省略
- chatの場合はparamsにmessageを含め、雑談の返答を入れる
- JSONのみを返し、説明文は一切付けない

今日の日付: ${getToday()}`;
}

// Groq APIを呼び出す
async function callGroq(systemPrompt, userMessage) {
  const response = await axios.post(
    GROQ_API_URL,
    {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
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

// メッセージから意図を解析
async function parseIntent(message) {
  try {
    const response = await callGroq(getIntentSystemPrompt(), message);

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

// 雑談用の応答生成
async function generateChatResponse(message) {
  try {
    const systemPrompt = '合同会社無限の事務アシスタントとして、簡潔に日本語で答えてください。';
    return await callGroq(systemPrompt, message);
  } catch (err) {
    console.error('Groq応答エラー:', err.response?.data || err.message);
    return 'すみません、応答を生成できませんでした。';
  }
}

module.exports = {
  parseIntent,
  generateChatResponse,
};
