// タスク管理（ToDoリスト）

const tasks = new Map(); // groupId -> tasks[]

// タスクを追加
function addTask(groupId, title, dueDate = null, priority = 'normal') {
  if (!tasks.has(groupId)) {
    tasks.set(groupId, []);
  }

  const task = {
    id: Date.now(),
    title,
    dueDate,
    priority, // high, normal, low
    completed: false,
    createdAt: new Date().toISOString(),
  };

  tasks.get(groupId).push(task);
  return task;
}

// タスクを完了
function completeTask(groupId, taskIdOrTitle) {
  const groupTasks = tasks.get(groupId);
  if (!groupTasks) return null;

  // IDまたはタイトル部分一致で検索
  const task = groupTasks.find(t =>
    t.id === taskIdOrTitle ||
    t.title.includes(taskIdOrTitle)
  );

  if (task) {
    task.completed = true;
    task.completedAt = new Date().toISOString();
    return task;
  }
  return null;
}

// タスクを削除
function deleteTask(groupId, taskIdOrTitle) {
  const groupTasks = tasks.get(groupId);
  if (!groupTasks) return false;

  const index = groupTasks.findIndex(t =>
    t.id === taskIdOrTitle ||
    t.title.includes(taskIdOrTitle)
  );

  if (index !== -1) {
    groupTasks.splice(index, 1);
    return true;
  }
  return false;
}

// 未完了タスク一覧を取得
function getPendingTasks(groupId) {
  const groupTasks = tasks.get(groupId);
  if (!groupTasks) return [];

  return groupTasks
    .filter(t => !t.completed)
    .sort((a, b) => {
      // 優先度でソート（high > normal > low）
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // 期限でソート
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
}

// 全タスク一覧を取得
function getAllTasks(groupId) {
  return tasks.get(groupId) || [];
}

// タスク一覧をフォーマット
function formatTaskList(taskList, showCompleted = false) {
  const pending = taskList.filter(t => !t.completed);
  const completed = taskList.filter(t => t.completed);

  if (pending.length === 0 && completed.length === 0) {
    return '📋 タスクはありません。';
  }

  let msg = '📋 タスク一覧\n';

  if (pending.length > 0) {
    msg += '\n【未完了】';
    for (const task of pending) {
      const priorityIcon = task.priority === 'high' ? '🔴' : task.priority === 'low' ? '🔵' : '⚪';
      msg += `\n${priorityIcon} ${task.title}`;
      if (task.dueDate) {
        msg += ` (期限: ${task.dueDate})`;
      }
    }
  }

  if (showCompleted && completed.length > 0) {
    msg += '\n\n【完了】';
    for (const task of completed.slice(-5)) { // 最新5件
      msg += `\n✅ ${task.title}`;
    }
  }

  msg += `\n\n未完了: ${pending.length}件`;
  if (completed.length > 0) {
    msg += ` / 完了: ${completed.length}件`;
  }

  return msg;
}

module.exports = {
  addTask,
  completeTask,
  deleteTask,
  getPendingTasks,
  getAllTasks,
  formatTaskList,
};
