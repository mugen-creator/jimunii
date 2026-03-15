// 経費管理（メモリ内保存 - 後でスプレッドシート連携予定）

const expenses = [];

// 経費を登録
function registerExpense(data) {
  const expense = {
    id: Date.now(),
    date: data.date || new Date().toISOString().split('T')[0],
    store: data.store || '不明',
    amount: data.amount || 0,
    category: data.category || 'その他',
    memo: data.memo || '',
    registeredAt: new Date().toISOString(),
  };

  expenses.push(expense);
  return expense;
}

// 期間の経費を取得
function getExpenses(startDate, endDate) {
  return expenses.filter(exp => {
    return exp.date >= startDate && exp.date <= endDate;
  });
}

// 月の経費集計
function getMonthlyTotal(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  const monthExpenses = getExpenses(startDate, endDate);
  const total = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  // カテゴリ別集計
  const byCategory = {};
  for (const exp of monthExpenses) {
    byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
  }

  return {
    total,
    count: monthExpenses.length,
    byCategory,
    expenses: monthExpenses,
  };
}

// 経費一覧をフォーマット
function formatExpenseList(expenses) {
  if (expenses.length === 0) {
    return '📊 該当する経費はありません。';
  }

  let msg = '📊 経費一覧\n';
  let total = 0;

  for (const exp of expenses.slice(-10)) { // 最新10件
    msg += `\n${exp.date} ${exp.store}`;
    msg += `\n  💰 ¥${exp.amount.toLocaleString()} [${exp.category}]`;
    if (exp.memo) msg += ` - ${exp.memo}`;
    total += exp.amount;
  }

  msg += `\n\n合計：¥${total.toLocaleString()}`;

  if (expenses.length > 10) {
    msg += `\n（他${expenses.length - 10}件）`;
  }

  return msg;
}

module.exports = {
  registerExpense,
  getExpenses,
  getMonthlyTotal,
  formatExpenseList,
};
