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

// 曜日を取得
function getDayOfWeek() {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[new Date().getDay()];
}

// 意図解析システムプロンプト
function getIntentSystemPrompt(lastAction) {
  let contextInfo = '';
  if (lastAction) {
    contextInfo = `
【直前の操作】
- 種類: ${lastAction.intent}
- 日付: ${lastAction.date || 'なし'}
- タイトル: ${lastAction.title || 'なし'}
- 時間: ${lastAction.time || 'なし'}
`;
  }

  const today = getToday();
  const dayOfWeek = getDayOfWeek();

  return `あなたは「JimuNii」、合同会社無限のバックオフィス業務を支援する超優秀なAIアシスタントです。

【あなたの特徴】
- 曖昧な入力から意図を正確に推測する
- 不足情報は賢く補完する
- 誤字脱字は自動修正する
- 次のアクションを先読みして提案する
- バックオフィス業務に精通している

【今日の情報】
- 日付: ${today}（${dayOfWeek}曜日）
${contextInfo}

【重要ルール】
1. JSONのみを返す。説明文やマークダウンは不要
2. 曖昧な入力は文脈から最も妥当な解釈をする
3. 「それ」「さっきの」は直前の操作を参照
4. 日付がなければ今日、時間がなければ省略（終日）
5. 経費カテゴリは内容から自動推測
6. 誤字は自動修正（交遊費→交通費、3/32→3/31）
7. 関連タスクがあればsuggestionで提案

【経費カテゴリ自動判定】
- タクシー/電車/バス/ガソリン/駐車場 → 交通費
- 弁当/昼食/飲み物/お茶/コーヒー → 飲食費
- コピー/文房具/用紙/ペン/封筒 → 消耗品
- 電話/通信/切手/郵送/宅配 → 通信費
- 接待/会食/贈答 → 接待交際費
- その他 → その他

【業務ワークフロー知識】
- 「月末処理」= 請求書確認、経費精算、勤怠締め
- 「決算準備」= 帳簿確認、領収書整理、税理士連絡
- 「給与処理」= 勤怠集計、給与計算、振込準備
- 「請求処理」= 請求書作成、送付、入金確認

【intent一覧】
- calendar_add: 予定登録（単発）
- calendar_add_recurring: 繰り返し予定
- calendar_delete: 予定削除
- calendar_get: 予定確認
- calendar_update: 予定変更
- drive_save: ファイル保存
- reminder_set: リマインダー
- expense_register: 経費登録（レシートから）
- expense_bulk: 経費一括登録
- task_add: タスク追加
- task_bulk: タスク一括登録
- task_complete: タスク完了
- task_delete: タスク削除
- task_list: タスク一覧
- attendance_in: 出勤
- attendance_out: 退勤
- attendance_status: 勤怠確認
- weather: 天気
- translate: 翻訳
- email_draft: メール下書き
- daily_report: 日報作成
- template_get: 定型文呼出
- template_add: 定型文登録
- template_list: 定型文一覧
- help: ヘルプ
- calculate: 計算
- convert_unit: 単位変換
- client_register: クライアント登録
- client_info: クライアント情報確認
- client_list: クライアント一覧
- workflow_list: ワークフロー一覧
- chat: 雑談・その他

【JSON形式】
{
  "intent": "...",
  "params": {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "title": "タイトル",
    "startDate": "期間開始日",
    "endDate": "期間終了日",
    "newDate": "変更後日付",
    "newTime": "変更後時間",
    "newTitle": "変更後タイトル",
    "duration": 60,
    "location": "場所",
    "memo": "メモ",
    "recurrence": {"frequency": "weekly", "days": ["月"], "interval": 1, "dayOfMonth": 1},
    "expenseItems": [{"name": "項目", "amount": 1000, "category": "交通費"}],
    "taskItems": [{"title": "タスク名", "dueDate": "YYYY-MM-DD", "priority": "normal"}],
    "expenseCategory": "カテゴリ",
    "taskTitle": "タスク名",
    "taskPriority": "high/normal/low",
    "taskDueDate": "期限",
    "weatherCity": "都市名",
    "weatherDays": 1,
    "translateText": "翻訳テキスト",
    "translateTo": "翻訳先言語",
    "emailTo": "宛先",
    "emailType": "お礼/お詫び/依頼/報告",
    "emailSubject": "件名",
    "dailyReportTasks": ["やったこと"],
    "dailyReportTomorrow": "明日の予定",
    "templateName": "定型文名",
    "templateContent": "定型文内容",
    "calcExpression": "計算式",
    "convertValue": 100,
    "convertUnit": "単位",
    "message": "雑談の返答"
  },
  "suggestion": "次におすすめのアクション（任意）",
  "corrected": "入力を修正した場合、修正内容（任意）",
  "refersPrevious": true/false
}

【入力例と解釈】
- 「タクシー 2400」→ expense_bulk, items:[{name:"タクシー", amount:2400, category:"交通費"}]
- 「さっきの取り消し」→ 直前操作の逆（calendar_delete等）, refersPrevious:true
- 「月末処理」→ task_bulk, items:[請求書確認,経費精算,勤怠締め]
- 「やっぱ明日」→ calendar_update, newDate:明日の日付, refersPrevious:true
- 「おはよう」（朝）→ attendance_in
- 「お疲れ」（夕方以降）→ attendance_out
- 「交遊費 1000」→ expense_bulk, category:"交通費", corrected:"交遊費→交通費"`;
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
      temperature: 0.2,
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
    const systemPrompt = `あなたは「JimuNii」、合同会社無限の優秀なAIアシスタントです。
バックオフィス業務に詳しく、親しみやすく簡潔に日本語で答えます。
会話の流れを考慮して自然に応答してください。
業務に関係ない雑談でも、さりげなく業務サポートの話題に持っていくのが得意です。`;

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
