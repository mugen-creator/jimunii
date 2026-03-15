// クライアント管理

const { appendRow, getRows } = require('./sheets');

// クライアント情報（メモリキャッシュ）
const clients = new Map();

// クライアント登録
async function registerClient(data) {
  const client = {
    id: Date.now(),
    name: data.name,
    shortName: data.shortName || data.name.substring(0, 4),
    billingDay: data.billingDay || 1, // 請求日（毎月X日）
    paymentTerms: data.paymentTerms || '月末締め翌月末払い',
    contact: data.contact || '',
    email: data.email || '',
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
  };

  // スプレッドシートに保存
  await appendRow('クライアント', [
    client.id,
    client.name,
    client.shortName,
    client.billingDay,
    client.paymentTerms,
    client.contact,
    client.email,
    client.notes,
    client.createdAt,
  ]);

  // キャッシュに追加
  clients.set(client.shortName.toLowerCase(), client);
  clients.set(client.name.toLowerCase(), client);

  return client;
}

// クライアント検索
async function findClient(query) {
  const q = query.toLowerCase();

  // キャッシュから検索
  if (clients.has(q)) {
    return clients.get(q);
  }

  // スプレッドシートから検索
  const rows = await getRows('クライアント');

  for (const row of rows) {
    const name = row[1]?.toLowerCase();
    const shortName = row[2]?.toLowerCase();

    if (name?.includes(q) || shortName?.includes(q)) {
      const client = {
        id: row[0],
        name: row[1],
        shortName: row[2],
        billingDay: row[3],
        paymentTerms: row[4],
        contact: row[5],
        email: row[6],
        notes: row[7],
      };

      // キャッシュに追加
      clients.set(name, client);
      clients.set(shortName, client);

      return client;
    }
  }

  return null;
}

// クライアント一覧
async function listClients() {
  const rows = await getRows('クライアント');

  return rows.map(row => ({
    id: row[0],
    name: row[1],
    shortName: row[2],
    billingDay: row[3],
  }));
}

// クライアント情報をフォーマット
function formatClientInfo(client) {
  if (!client) return '❌ クライアントが見つかりません';

  let msg = `🏢 ${client.name}`;
  if (client.shortName !== client.name) {
    msg += `（${client.shortName}）`;
  }
  msg += '\n';

  if (client.billingDay) msg += `\n📅 請求日：毎月${client.billingDay}日`;
  if (client.paymentTerms) msg += `\n💰 支払条件：${client.paymentTerms}`;
  if (client.contact) msg += `\n👤 担当者：${client.contact}`;
  if (client.email) msg += `\n📧 メール：${client.email}`;
  if (client.notes) msg += `\n📝 備考：${client.notes}`;

  return msg;
}

// クライアント一覧をフォーマット
function formatClientList(clients) {
  if (clients.length === 0) {
    return '📋 クライアントが登録されていません。\n「クライアント登録：会社名」で追加できます。';
  }

  let msg = '🏢 クライアント一覧\n';

  for (const c of clients) {
    msg += `\n・${c.name}`;
    if (c.shortName && c.shortName !== c.name) {
      msg += `（${c.shortName}）`;
    }
    if (c.billingDay) {
      msg += ` - 請求${c.billingDay}日`;
    }
  }

  return msg;
}

module.exports = {
  registerClient,
  findClient,
  listClients,
  formatClientInfo,
  formatClientList,
};
