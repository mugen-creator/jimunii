const Tesseract = require('tesseract.js');

// 画像からテキストを抽出
async function extractText(imageBuffer) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      imageBuffer,
      'jpn+eng', // 日本語と英語
      {
        logger: () => {}, // ログを抑制
      }
    );
    return text.trim();
  } catch (err) {
    console.error('OCRエラー:', err);
    return null;
  }
}

// レシートから情報を抽出
function parseReceipt(text) {
  const result = {
    store: null,
    date: null,
    total: null,
    items: [],
  };

  if (!text) return result;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // 店舗名（最初の数行から推測）
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const line = lines[i];
    // 店舗名っぽい行（カタカナや漢字が多い、短すぎない）
    if (line.length >= 2 && line.length <= 30 && !/^\d/.test(line)) {
      result.store = line;
      break;
    }
  }

  // 日付を抽出（様々なフォーマットに対応）
  const datePatterns = [
    /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/,  // 2024/03/15, 2024年3月15日
    /(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/,       // 24/03/15
    /(令和\d+)年(\d{1,2})月(\d{1,2})日/,           // 令和6年3月15日
  ];

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        if (match[1].startsWith('令和')) {
          const reiwaYear = parseInt(match[1].replace('令和', ''));
          const year = 2018 + reiwaYear;
          result.date = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else if (match[1].length === 4) {
          result.date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else {
          const year = 2000 + parseInt(match[1]);
          result.date = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
        break;
      }
    }
    if (result.date) break;
  }

  // 合計金額を抽出
  const totalPatterns = [
    /合計[:\s]*[¥￥]?[\s]*([0-9,]+)/i,
    /total[:\s]*[¥￥]?[\s]*([0-9,]+)/i,
    /計[:\s]*[¥￥]?[\s]*([0-9,]+)/,
    /[¥￥]\s*([0-9,]+)(?:\s|$)/,
    /([0-9,]+)\s*円/,
  ];

  let maxAmount = 0;
  for (const line of lines) {
    for (const pattern of totalPatterns) {
      const match = line.match(pattern);
      if (match) {
        const amount = parseInt(match[1].replace(/,/g, ''));
        if (amount > maxAmount && amount < 10000000) { // 1000万未満
          maxAmount = amount;
          result.total = amount;
        }
      }
    }
  }

  // 商品項目を抽出（金額が含まれる行）
  const itemPattern = /(.+?)\s+[¥￥]?([0-9,]+)(?:\s|$)/;
  for (const line of lines) {
    const match = line.match(itemPattern);
    if (match && match[1].length > 1 && match[1].length < 30) {
      const amount = parseInt(match[2].replace(/,/g, ''));
      if (amount > 0 && amount < result.total) {
        result.items.push({
          name: match[1].trim(),
          price: amount,
        });
      }
    }
  }

  return result;
}

// 抽出結果をフォーマット
function formatReceiptResult(receipt) {
  let msg = '📸 レシート読み取り結果\n';

  if (receipt.store) {
    msg += `\n🏪 店舗：${receipt.store}`;
  }
  if (receipt.date) {
    msg += `\n📅 日付：${receipt.date}`;
  }
  if (receipt.total) {
    msg += `\n💰 合計：¥${receipt.total.toLocaleString()}`;
  }

  if (receipt.items.length > 0) {
    msg += '\n\n📝 内訳：';
    for (const item of receipt.items.slice(0, 5)) { // 最大5件
      msg += `\n  - ${item.name}：¥${item.price.toLocaleString()}`;
    }
    if (receipt.items.length > 5) {
      msg += `\n  ...他${receipt.items.length - 5}件`;
    }
  }

  if (!receipt.store && !receipt.date && !receipt.total) {
    msg += '\n\n文字が読み取れませんでした。\n鮮明な画像で再度お試しください。';
  } else {
    msg += '\n\n「経費に登録」と送ると記録します。';
  }

  return msg;
}

// 名刺から情報を抽出
function parseBusinessCard(text) {
  const result = {
    name: null,
    company: null,
    title: null,
    email: null,
    phone: null,
    address: null,
  };

  if (!text) return result;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // メールアドレス
  const emailMatch = text.match(/[\w\.\-]+@[\w\.\-]+\.\w+/);
  if (emailMatch) result.email = emailMatch[0];

  // 電話番号
  const phonePatterns = [
    /(?:TEL|Tel|tel|電話)?[:\s]*(0\d{1,4}[\-\s]?\d{1,4}[\-\s]?\d{3,4})/,
    /(?:携帯|Mobile)?[:\s]*(0[789]0[\-\s]?\d{4}[\-\s]?\d{4})/,
  ];
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.phone = match[1].replace(/[\s\-]/g, '-');
      break;
    }
  }

  // 住所（〒で始まる行）
  const addressMatch = text.match(/〒?\d{3}[-\s]?\d{4}[^\n]+/);
  if (addressMatch) result.address = addressMatch[0];

  // 会社名と名前の推測
  for (const line of lines) {
    // 株式会社、合同会社などを含む行は会社名
    if (/株式会社|合同会社|有限会社|LLC|Inc|Corp/i.test(line) && !result.company) {
      result.company = line;
      continue;
    }

    // 役職っぽい行
    if (/部長|課長|係長|主任|代表|取締役|社長|マネージャー|Director|Manager/i.test(line) && !result.title) {
      result.title = line;
      continue;
    }

    // 日本人名っぽい行（漢字2-4文字 + スペース + 漢字）
    if (/^[\u4e00-\u9faf]{1,4}\s+[\u4e00-\u9faf]{1,4}$/.test(line) && !result.name) {
      result.name = line;
      continue;
    }

    // ローマ字名
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/i.test(line) && !result.name) {
      result.name = line;
      continue;
    }
  }

  return result;
}

// 名刺結果をフォーマット
function formatBusinessCardResult(card) {
  let msg = '📇 名刺読み取り結果\n';

  if (card.name) msg += `\n👤 氏名：${card.name}`;
  if (card.company) msg += `\n🏢 会社：${card.company}`;
  if (card.title) msg += `\n💼 役職：${card.title}`;
  if (card.phone) msg += `\n📞 電話：${card.phone}`;
  if (card.email) msg += `\n📧 メール：${card.email}`;
  if (card.address) msg += `\n📍 住所：${card.address}`;

  if (!card.name && !card.company && !card.email && !card.phone) {
    msg += '\n\n情報を抽出できませんでした。\n鮮明な画像で再度お試しください。';
  }

  return msg;
}

// 画像が名刺かレシートか判定
function detectImageType(text) {
  if (!text) return 'unknown';

  // 名刺の特徴
  const cardFeatures = ['株式会社', '合同会社', '@', 'TEL', 'FAX', '〒'];
  const cardScore = cardFeatures.filter(f => text.includes(f)).length;

  // レシートの特徴
  const receiptFeatures = ['合計', '小計', '円', '税', '¥', 'お買上'];
  const receiptScore = receiptFeatures.filter(f => text.includes(f)).length;

  if (cardScore > receiptScore && cardScore >= 2) return 'card';
  if (receiptScore > cardScore && receiptScore >= 2) return 'receipt';
  return 'unknown';
}

// 経費カテゴリを自動判定
function detectExpenseCategory(text, storeName) {
  const lower = (text + ' ' + (storeName || '')).toLowerCase();

  if (/タクシー|taxi|電車|jr|metro|バス|bus|駐車|parking|ガソリン|給油|高速|etc/i.test(lower)) {
    return '交通費';
  }
  if (/弁当|ランチ|lunch|レストラン|カフェ|コーヒー|スタバ|ドトール|マック|吉野家|すき家|松屋|コンビニ/i.test(lower)) {
    return '飲食費';
  }
  if (/文房具|コピー|用紙|ペン|封筒|クリップ|ホッチキス|百均|ダイソー|セリア|オフィス/i.test(lower)) {
    return '消耗品';
  }
  if (/切手|郵便|宅配|ヤマト|佐川|郵送|レターパック/i.test(lower)) {
    return '通信費';
  }
  if (/接待|会食|贈答|お中元|お歳暮|ギフト/i.test(lower)) {
    return '接待交際費';
  }
  if (/宿泊|ホテル|旅館|出張/i.test(lower)) {
    return '旅費交通費';
  }

  return 'その他';
}

module.exports = {
  extractText,
  parseReceipt,
  formatReceiptResult,
  parseBusinessCard,
  formatBusinessCardResult,
  detectImageType,
  detectExpenseCategory,
};
