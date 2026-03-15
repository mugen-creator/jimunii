require('dotenv').config();

const express = require('express');
const { handleWebhook } = require('./line');
const { startDailyReminder } = require('./reminder');
const { initWorkflows } = require('./workflow');
const { startDeadlineWatcher } = require('./deadline');

const app = express();
const PORT = process.env.PORT || 3000;

// LINE署名検証のためにrawBodyを保持
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ヘルスチェック
app.get('/', (req, res) => {
  res.send('JimuNii Bot is running!');
});

// LINE Webhook
app.post('/webhook', async (req, res) => {
  // Renderの無料プランはスリープするため即座に200を返す
  res.status(200).send('OK');

  try {
    await handleWebhook(req);
  } catch (err) {
    console.error('Webhook処理エラー:', err);
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // 毎朝通知のスケジューラー開始
  startDailyReminder();

  // 自動ワークフロー開始
  initWorkflows();

  // 期限監視開始
  startDeadlineWatcher();
});
