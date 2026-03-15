// 自動ワークフロー

const cron = require('node-cron');
const { pushMessage } = require('./line');
const { addTask } = require('./task');
const { getRows, appendRow } = require('./sheets');

// ワークフロー定義
const workflows = new Map();

// デフォルトワークフロー
const defaultWorkflows = [
  {
    id: 'monthly_start',
    name: '月初処理',
    trigger: { type: 'cron', schedule: '0 9 1 * *' }, // 毎月1日9時
    tasks: [
      { title: '先月の請求書確認', priority: 'high' },
      { title: '今月の請求書作成準備', priority: 'normal' },
      { title: '勤怠データ確認', priority: 'normal' },
    ],
    message: '📅 月初処理のタスクを自動作成しました',
  },
  {
    id: 'monthly_end',
    name: '月末処理',
    trigger: { type: 'cron', schedule: '0 9 25-31 * *' }, // 毎月25-31日9時（月末付近）
    condition: (date) => {
      // 月末3日前から実行
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() >= lastDay - 3;
    },
    tasks: [
      { title: '経費精算締め', priority: 'high' },
      { title: '請求書送付確認', priority: 'high' },
      { title: '入金確認', priority: 'normal' },
      { title: '勤怠締め', priority: 'normal' },
    ],
    message: '📅 月末処理のタスクを自動作成しました',
  },
  {
    id: 'weekly_monday',
    name: '週次タスク',
    trigger: { type: 'cron', schedule: '0 9 * * 1' }, // 毎週月曜9時
    tasks: [
      { title: '週次報告準備', priority: 'normal' },
      { title: '今週の予定確認', priority: 'normal' },
    ],
    message: '📅 週次タスクを自動作成しました',
  },
];

// ワークフローを初期化
function initWorkflows(groupId) {
  const jobs = [];

  for (const wf of defaultWorkflows) {
    if (wf.trigger.type === 'cron') {
      const job = cron.schedule(wf.trigger.schedule, async () => {
        const now = new Date();

        // 条件チェック
        if (wf.condition && !wf.condition(now)) {
          return;
        }

        console.log(`ワークフロー実行: ${wf.name}`);

        // タスクを自動作成
        for (const task of wf.tasks) {
          await addTask(groupId, task.title, null, task.priority);
        }

        // 通知
        const targets = process.env.DAILY_NOTIFICATION_TARGETS?.split(',') || [];
        for (const target of targets) {
          if (target.trim()) {
            let msg = wf.message + '\n';
            for (const task of wf.tasks) {
              msg += `\n・${task.title}`;
            }
            await pushMessage(target.trim(), msg);
          }
        }
      }, {
        timezone: 'Asia/Tokyo',
      });

      jobs.push(job);
    }
  }

  console.log(`${defaultWorkflows.length}件のワークフローを初期化しました`);
  return jobs;
}

// カスタムワークフローを追加
function addWorkflow(groupId, workflow) {
  if (!workflows.has(groupId)) {
    workflows.set(groupId, []);
  }
  workflows.get(groupId).push(workflow);
  return workflow;
}

// ワークフロー一覧
function listWorkflows(groupId) {
  const custom = workflows.get(groupId) || [];
  return {
    default: defaultWorkflows.map(w => ({ id: w.id, name: w.name })),
    custom: custom.map(w => ({ id: w.id, name: w.name })),
  };
}

module.exports = {
  initWorkflows,
  addWorkflow,
  listWorkflows,
  defaultWorkflows,
};
