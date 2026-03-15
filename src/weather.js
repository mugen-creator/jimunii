// 天気予報（Open-Meteo API - 無料、APIキー不要）

const axios = require('axios');

// 主要都市の座標
const CITIES = {
  '東京': { lat: 35.6762, lon: 139.6503 },
  '大阪': { lat: 34.6937, lon: 135.5023 },
  '名古屋': { lat: 35.1815, lon: 136.9066 },
  '福岡': { lat: 33.5904, lon: 130.4017 },
  '札幌': { lat: 43.0618, lon: 141.3545 },
  '仙台': { lat: 38.2682, lon: 140.8694 },
  '広島': { lat: 34.3853, lon: 132.4553 },
  '京都': { lat: 35.0116, lon: 135.7681 },
  '神戸': { lat: 34.6901, lon: 135.1956 },
  '横浜': { lat: 35.4437, lon: 139.6380 },
};

// 天気コードを日本語に変換
function getWeatherDescription(code) {
  const weatherCodes = {
    0: '☀️ 快晴',
    1: '🌤️ 晴れ',
    2: '⛅ 曇りがち',
    3: '☁️ 曇り',
    45: '🌫️ 霧',
    48: '🌫️ 霧氷',
    51: '🌧️ 小雨',
    53: '🌧️ 雨',
    55: '🌧️ 強い雨',
    61: '🌧️ 小雨',
    63: '🌧️ 雨',
    65: '🌧️ 強い雨',
    71: '🌨️ 小雪',
    73: '🌨️ 雪',
    75: '🌨️ 大雪',
    80: '🌦️ にわか雨',
    81: '🌦️ にわか雨',
    82: '⛈️ 激しいにわか雨',
    95: '⛈️ 雷雨',
    96: '⛈️ 雷雨（雹）',
    99: '⛈️ 激しい雷雨',
  };
  return weatherCodes[code] || '不明';
}

// 天気予報を取得
async function getWeather(city = '東京', days = 1) {
  const location = CITIES[city] || CITIES['東京'];

  try {
    const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: location.lat,
        longitude: location.lon,
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'Asia/Tokyo',
        forecast_days: Math.min(days, 7),
      },
    });

    const data = response.data.daily;
    const forecasts = [];

    for (let i = 0; i < data.time.length; i++) {
      forecasts.push({
        date: data.time[i],
        weather: getWeatherDescription(data.weather_code[i]),
        tempMax: Math.round(data.temperature_2m_max[i]),
        tempMin: Math.round(data.temperature_2m_min[i]),
        rainChance: data.precipitation_probability_max[i],
      });
    }

    return { city, forecasts };
  } catch (err) {
    console.error('天気取得エラー:', err.message);
    return null;
  }
}

// 天気予報をフォーマット
function formatWeather(weather) {
  if (!weather) return '❌ 天気情報を取得できませんでした。';

  let msg = `🌤️ ${weather.city}の天気\n`;

  for (const day of weather.forecasts) {
    const date = new Date(day.date);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOfWeek = dayNames[date.getDay()];

    msg += `\n${dateStr}（${dayOfWeek}）`;
    msg += `\n${day.weather}`;
    msg += `\n🌡️ ${day.tempMin}℃ 〜 ${day.tempMax}℃`;
    if (day.rainChance > 0) {
      msg += ` ☔${day.rainChance}%`;
    }
  }

  return msg;
}

module.exports = {
  getWeather,
  formatWeather,
  CITIES,
};
