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
- calendar_add: 予定を登録する（単発）
- calendar_add_recurring: 繰り返し予定を登録する（毎日、毎週、毎月など）
- calendar_delete: 予定を削除する
- calendar_get: 予定を確認する
- calendar_update: 予定を変更する（時間や日付の変更）
- drive_save: ファイルを保存する
- reminder_set: リマインダーをセットする
- expense_register: 経費を登録する（レシート読み取り後）
- expense_bulk: 複数の経費をまとめて登録する
- task_bulk: 複数のタスクをまとめて登録する
- task_add: タスクを追加する
- task_complete: タスクを完了にする
- task_delete: タスクを削除する
- task_list: タスク一覧を表示する
- attendance_in: 出勤を記録する
- attendance_out: 退勤を記録する
- attendance_status: 勤怠状況を確認する
- weather: 天気予報を取得する
- translate: テキストを翻訳する
- email_draft: メールの下書きを作成する
- daily_report: 日報を作成する
- template_get: 定型文を呼び出す
- template_add: 定型文を登録する
- template_list: 定型文一覧を表示する
- help: ヘルプ・使い方を表示する
- calculate: 計算する
- convert_unit: 単位変換する
- chat: 上記以外の雑談・質問

JSON形式:
{
  "intent": "calendar_add" | "calendar_add_recurring" | "calendar_delete" | "calendar_get" | "calendar_update" | "drive_save" | "reminder_set" | "expense_register" | "expense_bulk" | "task_add" | "task_bulk" | "task_complete" | "task_delete" | "task_list" | "attendance_in" | "attendance_out" | "attendance_status" | "weather" | "translate" | "email_draft" | "daily_report" | "template_get" | "template_add" | "template_list" | "help" | "calculate" | "convert_unit" | "chat",
  "params": {
    "date": "YYYY-MM-DD形式（繰り返し予定の開始日）",
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
    "recurrence": {
      "frequency": "daily" | "weekly" | "monthly" | "yearly",
      "days": ["月", "火", ...] （毎週の場合、曜日の配列）,
      "interval": 数値（2週間ごとなら2）,
      "dayOfMonth": 数値（毎月の場合、日付）
    },
    "fileName": "ファイル名",
    "folderPath": "保存先フォルダ（例: 請求書、経費/3月）",
    "expenseCategory": "経費カテゴリ（交通費、消耗品、飲食費、通信費、その他）",
    "expenseMemo": "経費のメモ",
    "expenseItems": [{"name": "項目名", "amount": 金額, "category": "カテゴリ"}],
    "taskItems": [{"title": "タスク名", "dueDate": "期限", "priority": "優先度"}],
    "taskTitle": "タスクのタイトル",
    "taskPriority": "high" | "normal" | "low",
    "taskDueDate": "タスクの期限（YYYY-MM-DD）",
    "weatherCity": "天気を調べる都市（東京、大阪、名古屋、福岡、札幌など）",
    "weatherDays": 天気予報の日数（1〜7）,
    "translateText": "翻訳するテキスト",
    "translateTo": "翻訳先の言語（日本語、英語、中国語、韓国語など）",
    "emailTo": "メールの宛先（名前）",
    "emailType": "メールの種類（お礼、お詫び、依頼、報告、確認など）",
    "emailSubject": "メールの件名や内容の概要",
    "dailyReportTasks": "今日やったこと（配列）",
    "dailyReportTomorrow": "明日やること",
    "dailyReportNotes": "備考・所感",
    "templateName": "定型文の名前",
    "templateContent": "定型文の内容（登録時）",
    "calcExpression": "計算式（例: 100+200, 1000*1.1）",
    "convertValue": 変換する数値,
    "convertUnit": "変換元の単位（マイル、キロ、華氏など）",
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
- 「毎週」「毎日」「毎月」などはcalendar_add_recurringを使用
  - 「毎週月曜」→ frequency: "weekly", days: ["月"]
  - 「毎週火曜と金曜」→ frequency: "weekly", days: ["火", "金"]
  - 「毎日」→ frequency: "daily"
  - 「毎月1日」→ frequency: "monthly", dayOfMonth: 1
  - 「隔週」→ frequency: "weekly", interval: 2
- 繰り返し予定のdateは次の該当日（来週月曜なら来週月曜の日付）
- 「経費に登録」「経費登録」「記録して」などはexpense_registerを使用
- 複数行の経費やタスクはexpense_bulk/task_bulkを使用
- 「経費まとめて」「タスクまとめて」「一括登録」などは一括処理
- 各項目を配列で返す（金額は数値、カテゴリは推測）
- 「やること」「TODO」「タスク追加」などはtask_add
- 「完了」「終わった」「できた」などはtask_complete
- 「タスク一覧」「やることリスト」などはtask_list
- 「重要」「急ぎ」「優先」はtaskPriority: "high"
- 「出勤」「おはよう」「出社」→ attendance_in
- 「退勤」「お疲れ」「帰ります」→ attendance_out
- 「勤怠」「今日の出勤」→ attendance_status
- 「天気」「明日の天気」→ weather（都市指定なければ東京）
- 「週間天気」→ weather, weatherDays: 7
- 「〇〇を英語に」「translate」「翻訳して」→ translate
- 翻訳先が未指定で日本語テキストなら英語、それ以外なら日本語
- 「〇〇さんにメール」「お礼メール作って」→ email_draft
- 「日報」「今日の報告」→ daily_report
- 「〇〇の定型文」→ template_get
- 「定型文一覧」→ template_list
- 「定型文登録：〇〇＝内容」→ template_add
- 「ヘルプ」「使い方」「何ができる」→ help
- 「100+200」「1000円の税込み」→ calculate
- 「5マイルは何キロ」「30度は華氏で」→ convert_unit
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

// 翻訳
async function translate(text, targetLang) {
  try {
    const systemPrompt = `あなたは翻訳者です。与えられたテキストを${targetLang}に翻訳してください。翻訳結果のみを返してください。説明や注釈は不要です。`;
    const response = await callGroq(systemPrompt, [{ role: 'user', content: text }]);
    return response.trim();
  } catch (err) {
    console.error('翻訳エラー:', err.response?.data || err.message);
    return null;
  }
}

// メール下書き作成
async function generateEmailDraft(to, type, subject) {
  try {
    const systemPrompt = `あなたはビジネスメールの作成者です。以下の情報を元に、丁寧で簡潔なビジネスメールを作成してください。

宛先：${to || '担当者'}様
種類：${type || '連絡'}
内容：${subject}

以下の形式で返してください：
件名：〇〇
---
本文`;

    const response = await callGroq(systemPrompt, [{ role: 'user', content: `${type}のメールを作成してください。` }]);
    return response.trim();
  } catch (err) {
    console.error('メール作成エラー:', err.response?.data || err.message);
    return null;
  }
}

// 日報作成
async function generateDailyReport(tasks, tomorrow, notes) {
  try {
    const today = getToday();
    const taskList = Array.isArray(tasks) ? tasks.join('\n- ') : tasks || '';

    const systemPrompt = `あなたは日報作成アシスタントです。以下の情報を元に、簡潔な日報を作成してください。

日付：${today}
今日やったこと：${taskList}
明日の予定：${tomorrow || ''}
備考：${notes || ''}

以下の形式で作成してください：
【日報】${today}
■ 本日の業務
■ 明日の予定
■ 所感・備考`;

    const response = await callGroq(systemPrompt, [{ role: 'user', content: '日報を作成してください。' }]);
    return response.trim();
  } catch (err) {
    console.error('日報作成エラー:', err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  parseIntent,
  generateChatResponse,
  translate,
  generateEmailDraft,
  generateDailyReport,
};
