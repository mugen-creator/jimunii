const { google } = require('googleapis');
const { Readable } = require('stream');

// ファイルバッファ（グループ/ユーザーごとに保持）
// 5分で期限切れ
const fileBuffer = new Map();
const FILE_EXPIRE_MS = 5 * 60 * 1000;

// 認証クライアント作成
function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

// Driveクライアント取得
function getDriveClient() {
  const auth = getAuthClient();
  return google.drive({ version: 'v3', auth });
}

// 当月フォルダ名を取得
function getCurrentMonthFolderName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return `${year}年${month}月`;
}

// 指定した親フォルダ内でフォルダを検索または作成
async function getOrCreateFolder(parentFolderId, folderName) {
  const drive = getDriveClient();

  // フォルダを検索
  const searchResponse = await drive.files.list({
    q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });

  if (searchResponse.data.files.length > 0) {
    return {
      id: searchResponse.data.files[0].id,
      name: folderName,
    };
  }

  // フォルダを作成
  const createResponse = await drive.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, name',
  });

  return {
    id: createResponse.data.id,
    name: folderName,
  };
}

// パスを辿ってフォルダを取得または作成（例: "経費/3月" → 経費フォルダの中に3月フォルダ）
async function getOrCreateFolderByPath(folderPath) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderPath) {
    // パス指定なしの場合は当月フォルダ
    const monthFolderName = getCurrentMonthFolderName();
    return getOrCreateFolder(rootFolderId, monthFolderName);
  }

  // パスを分割（"経費/3月" → ["経費", "3月"]）
  const parts = folderPath.split('/').filter(p => p.trim());

  let currentFolderId = rootFolderId;
  let currentFolderName = '';

  for (const part of parts) {
    const folder = await getOrCreateFolder(currentFolderId, part.trim());
    currentFolderId = folder.id;
    currentFolderName = folder.name;
  }

  return {
    id: currentFolderId,
    name: folderPath,
  };
}

// 当月フォルダを取得または作成（後方互換性のため維持）
async function getOrCreateMonthFolder() {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const folderName = getCurrentMonthFolderName();
  return getOrCreateFolder(rootFolderId, folderName);
}

// ファイルをアップロード
async function uploadFile(folderId, fileName, content) {
  const drive = getDriveClient();

  // BufferをReadable Streamに変換
  const stream = new Readable();
  stream.push(content);
  stream.push(null);

  const response = await drive.files.create({
    resource: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      body: stream,
    },
    fields: 'id, webViewLink',
  });

  return {
    id: response.data.id,
    url: response.data.webViewLink,
  };
}

// ファイルメッセージを受信したときに呼ばれる
function handleFileMessage(groupId, content, originalFileName) {
  // 古いバッファをクリア
  cleanExpiredBuffers();

  fileBuffer.set(groupId, {
    content,
    originalFileName,
    timestamp: Date.now(),
  });
}

// 期限切れバッファをクリア
function cleanExpiredBuffers() {
  const now = Date.now();
  for (const [key, value] of fileBuffer.entries()) {
    if (now - value.timestamp > FILE_EXPIRE_MS) {
      fileBuffer.delete(key);
    }
  }
}

// ファイル保存意図が来たときの処理
async function handleFileSaveIntent(groupId, requestedFileName, folderPath) {
  cleanExpiredBuffers();

  const buffered = fileBuffer.get(groupId);
  if (!buffered) {
    return {
      success: false,
      error: '保存するファイルがありません。先にファイルを送信してください。',
    };
  }

  try {
    // フォルダを取得または作成（パス指定があればそれを使用）
    const folder = await getOrCreateFolderByPath(folderPath);

    // ファイル名を決定（指定があればそれを使用、なければ元のファイル名）
    const fileName = requestedFileName || buffered.originalFileName;

    // アップロード
    const result = await uploadFile(folder.id, fileName, buffered.content);

    // バッファをクリア
    fileBuffer.delete(groupId);

    return {
      success: true,
      folderName: folder.name,
      fileUrl: result.url,
    };
  } catch (err) {
    console.error('Drive保存エラー:', err);
    return {
      success: false,
      error: `ファイル保存に失敗しました：${err.message}`,
    };
  }
}

module.exports = {
  handleFileMessage,
  handleFileSaveIntent,
  getOrCreateMonthFolder,
  getOrCreateFolderByPath,
  uploadFile,
};
