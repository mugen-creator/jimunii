// 計算機・単位変換

// 安全な計算（evalを使わない）
function calculate(expression) {
  try {
    // 全角を半角に
    let expr = expression
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/[＋－＊／×÷]/g, s => {
        const map = { '＋': '+', '－': '-', '＊': '*', '／': '/', '×': '*', '÷': '/' };
        return map[s] || s;
      })
      .replace(/,/g, '')
      .replace(/円/g, '')
      .replace(/税込み?/g, '*1.1')
      .replace(/税抜き?/g, '/1.1');

    // 数字と演算子のみ許可
    if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(expr)) {
      return null;
    }

    // Function constructorで計算（evalより安全）
    const result = new Function(`return ${expr}`)();

    if (typeof result !== 'number' || !isFinite(result)) {
      return null;
    }

    // 小数点以下2桁に丸める
    return Math.round(result * 100) / 100;
  } catch (err) {
    return null;
  }
}

// 単位変換
const conversions = {
  // 長さ
  'マイル': { to: 'キロ', factor: 1.60934, unit: 'km' },
  'キロ': { to: 'マイル', factor: 0.621371, unit: 'マイル' },
  'フィート': { to: 'メートル', factor: 0.3048, unit: 'm' },
  'インチ': { to: 'センチ', factor: 2.54, unit: 'cm' },
  'ヤード': { to: 'メートル', factor: 0.9144, unit: 'm' },

  // 重さ
  'ポンド': { to: 'キログラム', factor: 0.453592, unit: 'kg' },
  'オンス': { to: 'グラム', factor: 28.3495, unit: 'g' },

  // 温度（特殊処理）
  '華氏': { to: '摂氏', convert: f => (f - 32) * 5 / 9, unit: '℃' },
  '摂氏': { to: '華氏', convert: c => c * 9 / 5 + 32, unit: '℉' },

  // 面積
  '平方フィート': { to: '平方メートル', factor: 0.092903, unit: '㎡' },
  '坪': { to: '平方メートル', factor: 3.30579, unit: '㎡' },
  'エーカー': { to: 'ヘクタール', factor: 0.404686, unit: 'ha' },

  // 容量
  'ガロン': { to: 'リットル', factor: 3.78541, unit: 'L' },
  'オンス液量': { to: 'ミリリットル', factor: 29.5735, unit: 'ml' },
};

function convertUnit(value, fromUnit) {
  const conv = conversions[fromUnit];
  if (!conv) return null;

  let result;
  if (conv.convert) {
    result = conv.convert(value);
  } else {
    result = value * conv.factor;
  }

  return {
    from: value,
    fromUnit,
    to: Math.round(result * 1000) / 1000,
    toUnit: conv.unit,
    toName: conv.to,
  };
}

// 計算式を検出
function detectCalculation(text) {
  // 計算パターン
  const calcPattern = /(\d[\d,]*)\s*[\+\-\*\/×÷]\s*(\d[\d,]*)/;
  const taxPattern = /(\d[\d,]*)\s*円?\s*の?\s*税込み?/;
  const taxExPattern = /(\d[\d,]*)\s*円?\s*の?\s*税抜き?/;

  if (calcPattern.test(text) || taxPattern.test(text) || taxExPattern.test(text)) {
    return true;
  }
  return false;
}

// 単位変換を検出
function detectConversion(text) {
  const pattern = /([\d,\.]+)\s*(マイル|キロ|フィート|インチ|ヤード|ポンド|オンス|華氏|摂氏|坪|ガロン)/;
  const match = text.match(pattern);

  if (match) {
    const value = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2];
    return { value, unit };
  }
  return null;
}

// 結果をフォーマット
function formatCalcResult(result) {
  if (result >= 10000) {
    return `🔢 ${result.toLocaleString()}`;
  }
  return `🔢 ${result}`;
}

function formatConversionResult(conv) {
  return `📐 ${conv.from} ${conv.fromUnit} = ${conv.to} ${conv.toUnit}`;
}

module.exports = {
  calculate,
  convertUnit,
  detectCalculation,
  detectConversion,
  formatCalcResult,
  formatConversionResult,
};
