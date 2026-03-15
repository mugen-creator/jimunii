// PDF読み取り

const pdfParse = require('pdf-parse');

// PDFからテキストを抽出
async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text?.trim() || '',
      pages: data.numpages || 0,
      info: data.info || {},
    };
  } catch (err) {
    console.error('PDF解析エラー:', err);
    return null;
  }
}

// PDF内容を要約用にフォーマット
function formatPdfContent(result) {
  if (!result) {
    return '❌ PDFを読み取れませんでした。';
  }

  let msg = `📄 PDF読み取り結果\n`;
  msg += `📑 ページ数：${result.pages}\n\n`;

  // テキストが長い場合は省略
  const text = result.text;
  if (text.length > 1000) {
    msg += text.substring(0, 1000) + '\n\n... (省略)';
  } else if (text.length > 0) {
    msg += text;
  } else {
    msg += '（テキストを抽出できませんでした。画像PDFの可能性があります）';
  }

  return msg;
}

module.exports = {
  extractPdfText,
  formatPdfContent,
};
