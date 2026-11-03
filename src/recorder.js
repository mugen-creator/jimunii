// グループ記録係（受付役）
// 保存は司哉のアカウントで動くGAS「LINE記録係」が行う。ここはLINEから受けた内容を渡すだけ。
// 記録中のグループでは、Botは記録とコマンドへの返事以外なにもしない（勝手に発言しない）。
const axios = require('axios');

const TOKEN = () => (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
const URL_ = () => (process.env.RECORDER_URL || '').trim();
const SECRET = () => (process.env.RECORDER_SECRET || '').trim();
const CACHE_MS = 5 * 60 * 1000;
const NOTIFY_DEBOUNCE_MS = 2 * 60 * 1000;
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

function jst(ts) {
  const d = new Date(ts + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

async function gas(payload) {
  const r = await axios.post(URL_(), { ...payload, secret: SECRET() }, {
    // 画像をbase64で送るので上限の約1.4倍まで許す。返事は小さいJSONだけ
    maxRedirects: 5, timeout: 60000, maxBodyLength: Math.ceil(MAX_MEDIA_BYTES * 1.4) + 1024 * 1024, maxContentLength: 1024 * 1024,
  });
  if (r.data?.error) throw new Error(`GAS: ${r.data.error}`);
  return r.data;
}

const lineGet = (path) => axios.get(`https://api.line.me/v2/bot/${path}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });

async function groupName(groupId) {
  try {
    return (await lineGet(`group/${groupId}/summary`)).data.groupName;
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
    name = (await lineGet(`group/${groupId}/member/${userId}`)).data.displayName;
  } catch { /* 取れなければIDのまま */ }
  nameCache.set(key, name);
  return name;
}

// groupId -> { record, owner, at }
const cache = new Map();
async function check(groupId) {
  const hit = cache.get(groupId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const r = await gas({ action: 'check', groupId });
  const v = { record: !!r.record, owner: r.owner, at: Date.now() };
  cache.set(groupId, v);
  return v;
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

// 画像・動画が続けて届いたら、2分まとめて記録を始めた人に1回だけ知らせる
const pending = new Map();
function notify(groupId, owner, who, kind) {
  if (!owner) return;
  const p = pending.get(groupId) || { count: 0, who: new Set(), kinds: new Set(), timer: null };
  p.count += 1;
  p.who.add(who);
  p.kinds.add(kind);
  if (!p.timer) {
    p.timer = setTimeout(async () => {
      pending.delete(groupId);
      const name = await groupName(groupId);
      const text = `「${name}」に${[...p.who].join('・')}さんから${[...p.kinds].join('・')}が${p.count}件届きました`;
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

const botMentioned = (m) => m.mention?.mentionees?.some((x) => x.isSelf === true);

// 記録係が扱ったら true（line.js 側はそれ以上なにもしない）
async function handle(event) {
  const source = event.source;
  if (event.type !== 'message' || (source.type !== 'group' && source.type !== 'room')) return false;
  if (!URL_() || !SECRET()) return false;
  const groupId = source.groupId || source.roomId;
  const msg = event.message;

  if (msg.type === 'text' && botMentioned(msg)) {
    const cmd = msg.text.replace(/@\S+/g, '').trim();
    if (cmd === '記録開始' || cmd === '記録停止') {
      try {
        const r = await gas({ action: 'command', cmd, groupId, userId: source.userId, groupName: await groupName(groupId) });
        cache.delete(groupId);
        await reply(event.replyToken, r.reply || '処理しました');
      } catch (e) {
        console.error('記録係 コマンドエラー:', e.message);
        await reply(event.replyToken, `記録の操作に失敗しました：${e.message}`);
      }
      return true;
    }
  }

  const st = await check(groupId);
  if (!st.record) return false;

  try {
    const who = await senderName(groupId, source.userId);
    const row = { time: jst(event.timestamp), who, type: msg.type, content: '', messageId: msg.id, userId: source.userId || '' };
    let media = null;
    if (msg.type === 'text') row.content = msg.text;
    else if (msg.type === 'sticker') row.content = '（スタンプ）';
    else if (['image', 'video', 'audio', 'file'].includes(msg.type)) {
      row.content = msg.fileName || '';
      if (msg.fileSize && msg.fileSize > MAX_MEDIA_BYTES) {
        row.note = `大きすぎて保存せず（${Math.round(msg.fileSize / 1048576)}MB）`;
      } else {
        let r = null;
        try {
          // 画像・動画はサイズが事前に分からないので、上限を超えたら途中で打ち切る
          r = await axios.get(`https://api-data.line.me/v2/bot/message/${msg.id}/content`, {
            headers: { Authorization: `Bearer ${TOKEN()}` }, responseType: 'arraybuffer', maxContentLength: MAX_MEDIA_BYTES,
          });
        } catch (e) {
          row.note = /maxContentLength/.test(e.message) ? '大きすぎて保存せず' : `取得できず（${e.message}）`;
        }
        if (r) {
          const mime = r.headers['content-type'] || 'application/octet-stream';
          const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'video/mp4': '.mp4', 'audio/m4a': '.m4a' }[mime] || '';
          const label = `${row.time.replace(/[/: ]/g, '')}_${who}`;
          media = { base64: Buffer.from(r.data).toString('base64'), mime, name: msg.fileName ? `${label}_${msg.fileName}` : `${label}${ext}` };
        }
      }
      if (msg.type === 'image' || msg.type === 'video') notify(groupId, st.owner, who, msg.type === 'image' ? '画像' : '動画');
    } else row.content = `（${msg.type}）`;
    await gas({ action: 'log', groupId, row, media });
  } catch (e) {
    console.error('記録係 保存エラー:', e.message);
  }
  return true;
}

module.exports = { handle };
