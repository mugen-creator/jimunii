// crowd-scout: LINE個人トークで「N 揉んで」「N 応募文」に応答
// Gist から案件JSON取得→ 案件URL fetch→ Groq (Llama 3.3) 議会モード or 応募文

const axios = require('axios');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = (process.env.GROQ_API_KEY || '').trim();
const MODEL = process.env.CROWD_SCOUT_MODEL || 'openai/gpt-oss-120b';
const GIST_ID = (process.env.CROWD_SCOUT_GIST_ID || '').trim();
const GH_TOKEN = (process.env.GITHUB_TOKEN || '').trim();

const HANDA_PROFILE = `
半田司哉（MugenCreator / 合同会社無限代表 / 27歳）
専門: Claude Code, GAS, LINE Bot, Playwright, MCP, AI駆動開発, Cursor, Next.js
実績（直近1年）:
- 中古品買取販売の総務Bot（LINE×Groq×Google API・作業15分→3分/件）
- メルカリ相場スクレイパー3ブランド10,274件（Fly.io稼働・日次cron）
- 代理店管理システム（顧客696件・Google Sheets↔Supabase双方向）
- Honest LINE公式（3タブリッチメニュー・Flex Carousel・Cloudflare Workers）
- 請求書GAS5社分（LINE精算グループ自動化）
- Chatwork→LINE移行案件（無限グループ）
`;

const PARLIAMENT_PROMPT = `あなたは「司哉の議会」の議員たちです。以下の案件を評価してください。

【必ず登場する3議員】
- ジョブズ: 削ぎ落とし・シンプル化・"No"がデフォルト
- 鈴木敏夫: 顧客/受け手視点・「で、誰が？」「何が刺さる？」
- 沈黙: 質問形のみ「？」「なぜ？」

【状況ゲスト2議員（案件性質に応じて選ぶ）】
- 松本: 関西弁・乾いた笑い・ツッコミ
- 利休: 引き算・侘び寂び「引け」
- デカルト: 前提検証「その前提、明白か？」
- 宮本茂: 楽しさ第一「操作してて楽しい？」
- 司哉(未来): 5年後の自分・俯瞰「あの頃の俺な」

【出力形式】
各議員1-2行、短く、キャラの個性を維持。矛盾しても並列で。
最後に「総合: 応募 / スキップ / 保留」を1行。

【禁止】
長文で語らない。マークダウン装飾なし。日本語で。
`;

const SUMMARY_PROMPT = `以下の案件詳細を、非エンジニアでも一目で分かるように要約してください。

【出力形式（このまま出力・マークダウン装飾禁止）】
◆結論: <この案件は何を求めてるか1行で>

◆やること:
・<3-5個>

◆求められるスキル:
・<3-5個>

◆予算・期間: <1行>

◆応募時に必要なもの:
・<箇条書き>

日本語で、専門用語は最小限、簡潔に。前置き・後書き禁止。上記フォーマットのみ。`;

const APPLICATION_PROMPT = `以下の案件への応募文を作成してください。

【出力ルール】
- 300-350字
- 冒頭は案件タイトルに軽く触れる（「〇〇の件、拝見しました。」等）
- 次に相手のニーズや懸念を1文で代弁（「〜でお困りかと」等）
- 実績は【1個だけ】具体例を数字入りで（司哉プロフィールから最も案件に近いもの1個選ぶ）
- 想定質問を1個先回りで書く（「〜については△△で対応可能です」等）
- 末尾は「詳細伺えれば見積もりお出しします」の姿勢
- 敬語だが柔らかく、営業感を出さない
- ハンドル: MugenCreator

【禁止ワード】
- 「即戦力」「柔軟に対応」「進捗共有」「常に」「随時」「必ず」等のテンプレ営業ワード
- マークダウン装飾
- 前置き（「以下、応募文です」等）
- 実績の羅列（1個だけ深く書く）

【出力】
本文のみ、そのままコピペで送信できる形式。改行は適切に入れる。
`;

async function fetchGist() {
  if (!GIST_ID) throw new Error('CROWD_SCOUT_GIST_ID 未設定');
  if (!GH_TOKEN) throw new Error('GITHUB_TOKEN 未設定');
  const res = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
    timeout: 10000,
  });
  return res.data;
}

async function fetchStore() {
  const gist = await fetchGist();
  const content = gist.files['crowd-scout-jobs.json'].content;
  return JSON.parse(content);
}

async function fetchFavorites() {
  const gist = await fetchGist();
  const file = gist.files['crowd-scout-favorites.json'];
  if (!file) return [];
  try {
    const parsed = JSON.parse(file.content);
    return parsed.favorites || [];
  } catch {
    return [];
  }
}

async function saveFavorites(favorites) {
  await axios.patch(
    `https://api.github.com/gists/${GIST_ID}`,
    {
      files: {
        'crowd-scout-favorites.json': {
          content: JSON.stringify({ updatedAt: new Date().toISOString(), favorites }, null, 2),
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    },
  );
}

async function fetchJobDetail(url, jobDetail) {
  // scout時にMac側で取得済のdetailがあれば優先（Render IP は405で弾かれるため）
  if (jobDetail && !jobDetail.startsWith('[取得失敗:') && jobDetail.length > 100) {
    return jobDetail;
  }
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.9',
      },
      timeout: 15000,
      maxRedirects: 5,
    });
    const text = String(res.data)
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 3500);
  } catch (e) {
    return `[案件詳細取得失敗: ${e.message}]`;
  }
}

async function callGroq(system, user) {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY 未設定');
  const res = await axios.post(
    GROQ_URL,
    {
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    },
  );
  return res.data.choices[0].message.content;
}

function buildContext(job, detail) {
  const src = job.source === 'crowdworks' ? 'クラワ' : 'ランサ';
  return `【案件】
媒体: ${src}
タイトル: ${job.title}
予算: ${job.budget || '未記載'}
URL: ${job.url}

【案件詳細抜粋（HTMLからテキスト抽出）】
${detail}

【司哉プロフィール】
${HANDA_PROFILE}`;
}

async function handleMome(number) {
  const store = await fetchStore();
  const job = store.jobs[number - 1];
  if (!job) return `案件[${number}]なし。1〜${store.jobs.length}で指定してください`;
  const detail = await fetchJobDetail(job.url, job.detail);
  const ctx = buildContext(job, detail);
  const result = await callGroq(PARLIAMENT_PROMPT, `${ctx}\n\n議会モードで評価してください。`);
  return `【${job.title.slice(0, 50)}】\n\n${result}`;
}

async function handleApplication(number) {
  const store = await fetchStore();
  const job = store.jobs[number - 1];
  if (!job) return `案件[${number}]なし`;
  const detail = await fetchJobDetail(job.url, job.detail);
  const ctx = buildContext(job, detail);
  const result = await callGroq(APPLICATION_PROMPT, `${ctx}\n\n応募文ドラフトを作成してください。`);
  // コピペしやすいよう前置き・後書きなしで応募文だけ返す
  return result;
}

async function handleSkip(number) {
  const store = await fetchStore();
  const job = store.jobs[number - 1];
  if (!job) return `案件[${number}]なし`;
  return `[${number}] 不要登録: ${job.title.slice(0, 40)}\n(次回以降のフィルタ改善に活用します)`;
}

async function handleFavorite(number) {
  const store = await fetchStore();
  const job = store.jobs[number - 1];
  if (!job) return `案件[${number}]なし`;
  const favorites = await fetchFavorites();
  const dupKey = `${job.source}:${job.id}`;
  if (favorites.find((f) => `${f.source}:${f.id}` === dupKey)) {
    return `★[${number}] 既にお気に入り登録済\n${job.title.slice(0, 50)}`;
  }
  favorites.push({ ...job, favoritedAt: new Date().toISOString() });
  await saveFavorites(favorites);
  return `★[${number}] お気に入り追加 (計${favorites.length}件)\n${job.title.slice(0, 50)}\n\nMac で 'npm run favorites' → Claude Code に応募文書かせる素材取得`;
}

async function fetchApplied() {
  const gist = await fetchGist();
  const file = gist.files['crowd-scout-applied.json'];
  if (!file) return [];
  try {
    return JSON.parse(file.content).applied || [];
  } catch {
    return [];
  }
}

async function saveApplied(applied) {
  await axios.patch(
    `https://api.github.com/gists/${GIST_ID}`,
    {
      files: {
        'crowd-scout-applied.json': {
          content: JSON.stringify({ updatedAt: new Date().toISOString(), applied }, null, 2),
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    },
  );
}

async function handleApplied(number) {
  const store = await fetchStore();
  const favorites = await fetchFavorites();
  // 番号は最新Push（store.jobs）優先、なければお気に入りから探す
  let job = store.jobs[number - 1] || favorites[number - 1];
  if (!job) return `案件[${number}]なし`;
  const applied = await fetchApplied();
  const dupKey = `${job.source}:${job.id}`;
  if (applied.find((a) => `${a.source}:${a.id}` === dupKey)) {
    return `[${number}] 既に応募済登録\n${job.title.slice(0, 50)}`;
  }
  applied.push({ ...job, appliedAt: new Date().toISOString() });
  await saveApplied(applied);
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthCount = applied.filter((a) => a.appliedAt?.startsWith(monthKey)).length;
  return `✓[${number}] 応募済登録 (計${applied.length}件・今月${monthCount}件)\n${job.title.slice(0, 50)}`;
}

async function handleDetail(number) {
  const store = await fetchStore();
  const job = store.jobs[number - 1];
  if (!job) return `案件[${number}]なし`;
  const detail = await fetchJobDetail(job.url, job.detail);
  const src = job.source === 'crowdworks' ? 'クラワ' : 'ランサ';
  const summary = await callGroq(SUMMARY_PROMPT, `【案件タイトル】${job.title}\n【予算】${job.budget || '未記載'}\n\n【案件詳細】\n${detail}`);
  return `【[${number}] ${src} ${job.budget || ''}】
${job.title}

━━━━━━━━━━
${summary}
━━━━━━━━━━

URL: ${job.url}

「${number} 揉んで」→ 議会モード
「${number} 応募文」→ 応募文ドラフト`;
}

// テキスト → コマンド解析
function parseCommand(text) {
  const t = text.trim();
  const m = t.match(/^(\d+)\s*(詳細|揉んで|もんで|議会|レビュー|応募文|応募|お気に入り|★|ふぁぼ|送った|応募済|済|不要|スキップ)/);
  if (!m) return null;
  const number = parseInt(m[1], 10);
  const action = m[2];
  if (['詳細'].includes(action)) return { number, kind: 'detail' };
  if (['揉んで', 'もんで', '議会', 'レビュー'].includes(action)) return { number, kind: 'mome' };
  if (['応募文', '応募'].includes(action)) return { number, kind: 'application' };
  if (['お気に入り', '★', 'ふぁぼ'].includes(action)) return { number, kind: 'favorite' };
  if (['送った', '応募済', '済'].includes(action)) return { number, kind: 'applied' };
  if (['不要', 'スキップ'].includes(action)) return { number, kind: 'skip' };
  return null;
}

module.exports = { parseCommand, handleDetail, handleMome, handleApplication, handleSkip, handleFavorite, handleApplied };
