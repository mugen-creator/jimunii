// グループ記録係
// 「@無限Bot 記録開始」と書かれたグループだけ、全発言と画像・動画・ファイルをGoogleドライブに残す。
// 記録中のグループでは、Botは記録とコマンド返事以外なにもしない（勝手に発言しない）。
const axios = require('axios');
const { google } = require('googleapis');
const { Readable } = require('stream');

const TOKEN = () => (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
const ROOT_FOLDER_NAME = 'LINE記録';
const PREFIX = 'LINE記録_';
const HEADER = ['日時', '送信者', '種類', '内容', '画像・ファイル', 'メッセージID', '送信者ID'];
const NOTIFY_DEBOUNCE_MS = 2 * 60 * 1000;
const CACHE_MS = 5 * 60 * 1000;

function auth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
  });
}
const drive = () => google.drive({ version: 'v3', auth: auth() });
const sheets = () => google.sheets({ version: 'v4', auth: auth() });

function jst(ts) {
  const d = new Date(ts + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// ---- ドライブ上の置き場所 ----
let rootId = null;
async function getRootFolder() {
  if (rootId) return rootId;
  const parent = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const q = `name='${ROOT_FOLDER_NAME}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await drive().files.list({ q, fields: 'files(id)' });
  if (found.data.files.length) return (rootId = found.data.files[0].id);
  const made = await drive().files.create({
    resource: { name: ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
    fields: 'id',
  });
  return (rootId = made.data.id);
}

// groupId -> { sheetId, folderId, owner } / null（記録しない）
const groups = new Map();

async function lookup(groupId) {
  const hit = groups.get(groupId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const root = await getRootFolder();
  const q = `'${root}' in parents and trashed=false and appProperties has { key='groupId' and value='${groupId}' }`;
  const res = await drive().files.list({ q, fields: 'files(id,mimeType,appProperties)' });
  const sheet = res.data.files.find((f) => f.mimeType === 'application/vnd.google-apps.spreadsheet');
  const folder = res.data.files.find((f) => f.mimeType === 'application/vnd.google-apps.folder');
  const value = sheet && folder && sheet.appProperties?.status !== 'stopped'
    ? { sheetId: sheet.id, folderId: folder.id, owner: sheet.appProperties?.owner }
    : null;
  groups.set(groupId, { value, at: Date.now(), sheetId: sheet?.id });
  return value;
}

async function groupName(groupId) {
  try {
    const r = await axios.get(`https://api.line.me/v2/bot/group/${groupId}/summary`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    return r.data.groupName;
  } catch {
    return groupId;
  }
}

const nameCache = new Map();
async function senderName(groupId, userId) {
  if (!userId) return '不明';
  const key = `${groupId}:${userId}`;
  if (nameCache.has(key)) return nameCache.get(key);
  let name = userId;
  try {
    const r = await axios.get(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    name = r.data.displayName;
  } catch { /* 取れなければIDのまま */ }
  nameCache.set(key, name);
  return name;
}

async function start(groupId, ownerUserId) {
  const root = await getRootFolder();
  const name = await groupName(groupId);
  const cached = groups.get(groupId);
  await lookup(groupId);
  const existingSheetId = groups.get(groupId)?.sheetId || cached?.sheetId;
  if (existingSheetId) {
    // 持ち主は変えない（再開できるのは持ち主だけ。呼び出し側で確認済み）
    await drive().files.update({ fileId: existingSheetId, resource: { appProperties: { status: 'active' } } });
  } else {
    const props = { groupId, status: 'active', owner: ownerUserId };
    const sheet = await drive().files.create({
      resource: { name: `${PREFIX}${name}`, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [root], appProperties: props },
      fields: 'id',
    });
    await drive().files.create({
      resource: { name: `${PREFIX}${name}_画像`, mimeType: 'application/vnd.google-apps.folder', parents: [root], appProperties: { groupId } },
      fields: 'id',
    });
    await sheets().spreadsheets.values.update({
      spreadsheetId: sheet.data.id, range: 'A1', valueInputOption: 'RAW', resource: { values: [HEADER] },
    });
  }
  groups.delete(groupId);
  return lookup(groupId);
}

// 記録を始めた人（停止中でも残る）
async function currentOwner(groupId) {
  await lookup(groupId);
  const sheetId = groups.get(groupId)?.sheetId;
  if (!sheetId) return null;
  const f = await drive().files.get({ fileId: sheetId, fields: 'appProperties' });
  return f.data.appProperties?.owner || null;
}

async function stop(groupId) {
  await lookup(groupId);
  const sheetId = groups.get(groupId)?.sheetId;
  if (sheetId) await drive().files.update({ fileId: sheetId, resource: { appProperties: { status: 'stopped' } } });
  groups.set(groupId, { value: null, at: Date.now(), sheetId });
}

async function saveContent(folderId, message, fileLabel) {
  const r = await axios.get(`https://api-data.line.me/v2/bot/message/${message.id}/content`, {
    headers: { Authorization: `Bearer ${TOKEN()}` }, responseType: 'arraybuffer',
  });
  const type = r.headers['content-type'] || '';
  const ext = message.fileName ? '' : ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'video/mp4': '.mp4', 'audio/m4a': '.m4a' }[type] || '');
  const stream = new Readable();
  stream.push(Buffer.from(r.data));
  stream.push(null);
  const made = await drive().files.create({
    resource: { name: `${fileLabel}${message.fileName ? '_' + message.fileName : ext}`, parents: [folderId] },
    media: { mimeType: type || undefined, body: stream },
    fields: 'id,webViewLink',
  });
  return made.data.webViewLink;
}

// ---- 通知（画像が届いたら、記録開始した人に1回だけ知らせる） ----
const pending = new Map();
function notify(groupId, owner, who, kind) {
  if (!owner) return;
  const p = pending.get(groupId) || { count: 0, who: new Set(), timer: null };
  p.count += 1;
  p.who.add(who);
  if (!p.timer) {
    p.timer = setTimeout(async () => {
      pending.delete(groupId);
      const name = await groupName(groupId);
      const text = `「${name}」に${[...p.who].join('・')}さんから${kind}が${p.count}件届きました`;
      try {
        await axios.post('https://api.line.me/v2/bot/message/push', { to: owner, messages: [{ type: 'text', text }] }, {
          headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.error('記録係 通知エラー:', e.response?.data || e.message);
      }
    }, NOTIFY_DEBOUNCE_MS);
  }
  pending.set(groupId, p);
}

async function reply(replyToken, text) {
  try {
    await axios.post('https://api.line.me/v2/bot/message/reply', { replyToken, messages: [{ type: 'text', text }] }, {
      headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('記録係 返信エラー:', e.response?.data || e.message);
  }
}

function botMentioned(message) {
  return message.mention?.mentionees?.some((m) => m.isSelf === true);
}

// グループのイベントを受け取り、記録係が処理したら true（line.js 側はそれ以上なにもしない）
async function handle(event) {
  const source = event.source;
  if (event.type !== 'message' || (source.type !== 'group' && source.type !== 'room')) return false;
  const groupId = source.groupId || source.roomId;
  const msg = event.message;

  if (msg.type === 'text' && botMentioned(msg)) {
    const cmd = msg.text.replace(/@\S+/g, '').trim();
    const owner = await currentOwner(groupId);
    if ((cmd === '記録開始' || cmd === '記録停止') && owner && owner !== source.userId) {
      await reply(event.replyToken, '記録の開始・停止は、最初に記録を始めた人だけができます');
      return true;
    }
    if (cmd === '記録開始') {
      try {
        await start(groupId, source.userId);
        await reply(event.replyToken, 'このグループの記録を始めます。発言と画像をGoogleドライブに保存します');
      } catch (e) {
        console.error('記録開始エラー:', e.response?.data || e.message);
        await reply(event.replyToken, `記録を始められませんでした：${e.message}`);
      }
      return true;
    }
    if (cmd === '記録停止') {
      await stop(groupId);
      await reply(event.replyToken, 'このグループの記録を止めました');
      return true;
    }
  }

  let target;
  try {
    target = await lookup(groupId);
  } catch (e) {
    console.error('記録係 確認エラー:', e.message);
    return false;
  }
  if (!target) return false;

  try {
    const who = await senderName(groupId, source.userId);
    const label = `${jst(event.timestamp).replace(/[/: ]/g, '')}_${who}`;
    let content = '';
    let link = '';
    if (msg.type === 'text') content = msg.text;
    else if (msg.type === 'sticker') content = '（スタンプ）';
    else if (['image', 'video', 'audio', 'file'].includes(msg.type)) {
      content = msg.fileName || '';
      link = await saveContent(target.folderId, msg, label);
      if (msg.type === 'image' || msg.type === 'video') notify(groupId, target.owner, who, msg.type === 'image' ? '画像' : '動画');
    } else content = `（${msg.type}）`;
    await sheets().spreadsheets.values.append({
      spreadsheetId: target.sheetId, range: 'A:G', valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      resource: { values: [[jst(event.timestamp), who, msg.type, content, link, msg.id, source.userId || '']] },
    });
  } catch (e) {
    console.error('記録係 保存エラー:', e.response?.data || e.message);
  }
  return true;
}

module.exports = { handle };
