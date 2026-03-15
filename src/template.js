// 定型文テンプレート管理

// デフォルトテンプレート
const defaultTemplates = {
  '挨拶': 'いつもお世話になっております。合同会社無限の○○です。',
  '確認': 'ご確認のほど、よろしくお願いいたします。',
  '返信お礼': 'ご返信いただき、ありがとうございます。',
  '検討依頼': 'ご検討のほど、何卒よろしくお願い申し上げます。',
  '了解': '承知いたしました。ご連絡ありがとうございます。',
  'お詫び': 'ご不便をおかけして申し訳ございません。',
  '締め': '引き続き、よろしくお願いいたします。',
  '急ぎ': 'お忙しいところ恐れ入りますが、至急ご確認いただけますと幸いです。',
  '添付': '添付ファイルをご確認ください。',
  '日程調整': 'ご都合の良い日時をお知らせいただけますでしょうか。',
};

// カスタムテンプレート（グループごと）
const customTemplates = new Map();

// テンプレート取得
function getTemplate(groupId, name) {
  const custom = customTemplates.get(groupId) || {};
  return custom[name] || defaultTemplates[name] || null;
}

// テンプレート追加
function addTemplate(groupId, name, content) {
  if (!customTemplates.has(groupId)) {
    customTemplates.set(groupId, {});
  }
  customTemplates.get(groupId)[name] = content;
  return { name, content };
}

// テンプレート削除
function deleteTemplate(groupId, name) {
  const custom = customTemplates.get(groupId);
  if (custom && custom[name]) {
    delete custom[name];
    return true;
  }
  return false;
}

// テンプレート一覧取得
function listTemplates(groupId) {
  const custom = customTemplates.get(groupId) || {};
  return {
    default: Object.keys(defaultTemplates),
    custom: Object.keys(custom),
  };
}

// テンプレート一覧フォーマット
function formatTemplateList(templates) {
  let msg = '📋 定型文一覧\n';

  msg += '\n【標準】';
  for (const name of templates.default) {
    msg += `\n・${name}`;
  }

  if (templates.custom.length > 0) {
    msg += '\n\n【カスタム】';
    for (const name of templates.custom) {
      msg += `\n・${name}`;
    }
  }

  msg += '\n\n使い方：「○○の定型文」で呼び出し';
  return msg;
}

module.exports = {
  getTemplate,
  addTemplate,
  deleteTemplate,
  listTemplates,
  formatTemplateList,
};
