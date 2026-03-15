const { google } = require('googleapis');

// 認証クライアント作成
function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// Sheetsクライアント取得
function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// シートにデータを追加
async function appendRow(sheetName, values) {
  if (!SPREADSHEET_ID) {
    console.log('SPREADSHEET_ID未設定。ローカル保存のみ。');
    return null;
  }

  const sheets = getSheetsClient();

  try {
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [values],
      },
    });
    return result.data;
  } catch (err) {
    console.error('Sheets追加エラー:', err.message);
    return null;
  }
}

// シートからデータを取得
async function getRows(sheetName, range = 'A:Z') {
  if (!SPREADSHEET_ID) return [];

  const sheets = getSheetsClient();

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!${range}`,
    });
    return result.data.values || [];
  } catch (err) {
    console.error('Sheets取得エラー:', err.message);
    return [];
  }
}

// 経費をシートに追加
async function saveExpenseToSheet(expense) {
  const values = [
    expense.date,
    expense.store,
    expense.amount,
    expense.category,
    expense.memo,
    expense.registeredAt,
  ];
  return appendRow('経費', values);
}

// タスクをシートに追加
async function saveTaskToSheet(task, groupId) {
  const values = [
    task.id,
    groupId,
    task.title,
    task.dueDate || '',
    task.priority,
    task.completed ? '完了' : '未完了',
    task.createdAt,
    task.completedAt || '',
  ];
  return appendRow('タスク', values);
}

// タスクの状態を更新（完了/削除）
async function updateTaskInSheet(taskId, status) {
  if (!SPREADSHEET_ID) return null;

  const sheets = getSheetsClient();

  try {
    // タスクシートからデータを取得
    const rows = await getRows('タスク');
    const rowIndex = rows.findIndex(row => row[0] === String(taskId));

    if (rowIndex === -1) return null;

    // ステータスを更新（F列 = 6番目）
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `タスク!F${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[status]],
      },
    });

    // 完了日時を更新（H列 = 8番目）
    if (status === '完了') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `タスク!H${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[new Date().toISOString()]],
        },
      });
    }

    return true;
  } catch (err) {
    console.error('タスク更新エラー:', err.message);
    return null;
  }
}

// 月次経費集計を取得
async function getMonthlyExpenseSummary(year, month) {
  const rows = await getRows('経費');
  if (rows.length === 0) return null;

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthExpenses = rows.filter(row => row[0]?.startsWith(monthStr));

  let total = 0;
  const byCategory = {};

  for (const row of monthExpenses) {
    const amount = parseInt(row[2]) || 0;
    const category = row[3] || 'その他';
    total += amount;
    byCategory[category] = (byCategory[category] || 0) + amount;
  }

  return {
    total,
    count: monthExpenses.length,
    byCategory,
  };
}

module.exports = {
  appendRow,
  getRows,
  saveExpenseToSheet,
  saveTaskToSheet,
  updateTaskInSheet,
  getMonthlyExpenseSummary,
};
