// 会話履歴管理
// ユーザー/グループごとに直近の会話を保持

const conversations = new Map();
const MAX_HISTORY = 10; // 保持する最大メッセージ数
const EXPIRY_MS = 10 * 60 * 1000; // 10分で期限切れ

// 会話履歴を取得
function getHistory(groupId) {
  const conv = conversations.get(groupId);
  if (!conv) return [];

  // 期限切れチェック
  if (Date.now() - conv.lastUpdated > EXPIRY_MS) {
    conversations.delete(groupId);
    return [];
  }

  return conv.messages;
}

// 会話を追加
function addMessage(groupId, role, content) {
  let conv = conversations.get(groupId);

  if (!conv || Date.now() - conv.lastUpdated > EXPIRY_MS) {
    conv = { messages: [], lastUpdated: Date.now() };
  }

  conv.messages.push({ role, content });

  // 最大数を超えたら古いものを削除
  if (conv.messages.length > MAX_HISTORY) {
    conv.messages = conv.messages.slice(-MAX_HISTORY);
  }

  conv.lastUpdated = Date.now();
  conversations.set(groupId, conv);
}

// 最後の操作結果を保存（文脈理解用）
function setLastAction(groupId, action) {
  const conv = conversations.get(groupId);
  if (conv) {
    conv.lastAction = action;
    conv.lastUpdated = Date.now();
    conversations.set(groupId, conv);
  }
}

// 最後の操作結果を取得
function getLastAction(groupId) {
  const conv = conversations.get(groupId);
  if (!conv || Date.now() - conv.lastUpdated > EXPIRY_MS) {
    return null;
  }
  return conv.lastAction || null;
}

// 会話履歴をクリア
function clearHistory(groupId) {
  conversations.delete(groupId);
}

module.exports = {
  getHistory,
  addMessage,
  setLastAction,
  getLastAction,
  clearHistory,
};
