// パターン学習・予測

const { getRows } = require('./sheets');

// アクション履歴（メモリ）
const actionHistory = new Map();

// アクションを記録
function recordAction(groupId, action) {
  if (!actionHistory.has(groupId)) {
    actionHistory.set(groupId, []);
  }

  const history = actionHistory.get(groupId);
  history.push({
    ...action,
    timestamp: new Date().toISOString(),
    dayOfWeek: new Date().getDay(),
    dayOfMonth: new Date().getDate(),
    hour: new Date().getHours(),
  });

  // 最新100件のみ保持
  if (history.length > 100) {
    history.shift();
  }
}

// パターンを分析して提案を生成
async function analyzePatternsAndSuggest(groupId) {
  const suggestions = [];
  const now = new Date();
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  // タスク履歴からパターン分析
  try {
    const tasks = await getRows('タスク');

    // 月初（1-3日）のパターン
    if (dayOfMonth <= 3) {
      const monthStartTasks = tasks.filter(t => {
        const created = new Date(t[6]);
        return created.getDate() <= 3;
      });

      const commonTasks = findCommonTasks(monthStartTasks);
      if (commonTasks.length > 0) {
        suggestions.push({
          type: 'monthly_start',
          message: `月初によく作成されるタスクがあります`,
          tasks: commonTasks,
        });
      }
    }

    // 月末（25日以降）のパターン
    if (dayOfMonth >= 25) {
      const monthEndTasks = tasks.filter(t => {
        const created = new Date(t[6]);
        return created.getDate() >= 25;
      });

      const commonTasks = findCommonTasks(monthEndTasks);
      if (commonTasks.length > 0) {
        suggestions.push({
          type: 'monthly_end',
          message: `月末によく作成されるタスクがあります`,
          tasks: commonTasks,
        });
      }
    }

    // 週初（月曜）のパターン
    if (dayOfWeek === 1) {
      const mondayTasks = tasks.filter(t => {
        const created = new Date(t[6]);
        return created.getDay() === 1;
      });

      const commonTasks = findCommonTasks(mondayTasks);
      if (commonTasks.length > 0) {
        suggestions.push({
          type: 'weekly_monday',
          message: `月曜によく作成されるタスクがあります`,
          tasks: commonTasks,
        });
      }
    }
  } catch (err) {
    console.error('パターン分析エラー:', err);
  }

  return suggestions;
}

// よく使われるタスクを見つける
function findCommonTasks(tasks) {
  const titleCount = {};

  for (const task of tasks) {
    const title = normalizeTitle(task[2]);
    titleCount[title] = (titleCount[title] || 0) + 1;
  }

  // 3回以上出現するタスクを返す
  return Object.entries(titleCount)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));
}

// タイトルを正規化（類似タスクをまとめる）
function normalizeTitle(title) {
  if (!title) return '';

  return title
    .replace(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/g, '') // 日付を除去
    .replace(/\d{1,2}月/g, '') // X月を除去
    .replace(/第?\d+回/g, '') // 第X回を除去
    .replace(/\s+/g, ' ')
    .trim();
}

// 提案をフォーマット
function formatSuggestions(suggestions) {
  if (suggestions.length === 0) return null;

  let msg = '💡 パターンからの提案\n';

  for (const s of suggestions) {
    msg += `\n${s.message}：`;
    for (const task of s.tasks.slice(0, 3)) {
      msg += `\n・${task.title}`;
    }
  }

  msg += '\n\n作成しますか？';
  return msg;
}

// 時間帯に応じた挨拶・提案
function getTimeBasedSuggestion() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 10) {
    return {
      greeting: 'おはようございます',
      suggestion: '出勤打刻しますか？',
      intent: 'attendance_in',
    };
  } else if (hour >= 17 && hour < 22) {
    return {
      greeting: 'お疲れさまです',
      suggestion: '退勤打刻しますか？',
      intent: 'attendance_out',
    };
  } else if (hour >= 12 && hour < 14) {
    return {
      greeting: 'お昼ですね',
      suggestion: null,
      intent: null,
    };
  }

  return { greeting: null, suggestion: null, intent: null };
}

module.exports = {
  recordAction,
  analyzePatternsAndSuggest,
  formatSuggestions,
  getTimeBasedSuggestion,
};
