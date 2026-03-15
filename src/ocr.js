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

module.exports = {
  extractText,
  parseReceipt,
  formatReceiptResult,
};
