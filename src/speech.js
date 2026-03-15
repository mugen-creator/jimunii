// 音声認識（Groq Whisper API）

const axios = require('axios');
const FormData = require('form-data');

const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();

// 音声をテキストに変換
async function transcribeAudio(audioBuffer, mimeType = 'audio/m4a') {
  try {
    const formData = new FormData();

    // ファイル名を拡張子付きで設定
    const ext = mimeType.includes('m4a') ? 'm4a' : 'mp3';
    formData.append('file', audioBuffer, {
      filename: `audio.${ext}`,
      contentType: mimeType,
    });
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'ja');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
      }
    );

    return response.data.text?.trim() || null;
  } catch (err) {
    console.error('音声認識エラー:', err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  transcribeAudio,
};
