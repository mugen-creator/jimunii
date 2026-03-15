# JimuNii - 事務アシスタントBot

合同会社無限のためのLINE公式アカウント連携事務アシスタントBot

## 機能

- **カレンダー操作**: 予定の追加・削除・確認（Google Calendar連携）
- **ファイル保存**: LINEで受け取ったファイルをGoogle Driveに保存
- **リマインダー**: 任意のタイミングで通知、毎朝10時に当日の予定を通知
- **雑談対応**: Gemini AIによる自然な会話

## セットアップ

### 1. 必要なサービスの準備

#### LINE Developers
1. [LINE Developers Console](https://developers.line.biz/)でプロバイダーを作成
2. Messaging APIチャネルを作成
3. チャネルアクセストークンを発行
4. チャネルシークレットを取得

#### Google Cloud Console
1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. 以下のAPIを有効化:
   - Google Calendar API
   - Google Drive API
3. サービスアカウントを作成
4. サービスアカウントのJSONキーをダウンロード

#### Google Calendar
1. 使用するカレンダーの設定を開く
2. 「特定のユーザーとの共有」でサービスアカウントのメールアドレスを追加
3. 権限は「予定の変更」を選択
4. カレンダーIDを取得（設定画面の「カレンダーの統合」セクション）

#### Google Drive
1. 保存先フォルダを作成
2. フォルダをサービスアカウントのメールアドレスと共有（編集者権限）
3. フォルダIDを取得（URLの`/folders/`以降の部分）

#### Gemini API
1. [Google AI Studio](https://makersuite.google.com/app/apikey)でAPIキーを取得

### 2. 環境変数の設定

`.env.example`をコピーして`.env`を作成:

```bash
cp .env.example .env
```

`.env`を編集:

```
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder_id
PORT=3000
```

**注意**: `GOOGLE_PRIVATE_KEY`は改行を`\n`でエスケープして1行にするか、ダブルクォートで囲んでください。

### 3. ローカルで起動

```bash
# 依存関係をインストール
npm install

# 開発モードで起動
npm run dev
```

### 4. Renderへのデプロイ

1. [Render](https://render.com/)でアカウントを作成
2. 「New」→「Web Service」を選択
3. GitHubリポジトリを接続
4. 以下を設定:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
5. 「Environment」タブで環境変数を設定
6. デプロイ

### 5. LINE Webhook設定

1. LINE Developers Consoleでチャネルの設定を開く
2. Messaging APIタブで「Webhook URL」を設定:
   ```
   https://your-app.onrender.com/webhook
   ```
3. 「Webhook利用」をオンにする
4. 「検証」ボタンで接続確認

## 使い方

### 予定の登録
```
明日の15時に打ち合わせ
来週月曜10時からミーティング
3/20に棚卸し
```

### 予定の確認
```
今週の予定
明日の予定は？
3月の予定を教えて
```

### 予定の削除
```
明日の打ち合わせをキャンセル
3/20の棚卸しを削除
```

### ファイル保存
1. ファイルを送信
2. 「保存して」または「〇〇という名前で保存」と送信

### リマインダー
```
明日の14時にリマインダー
3/20 9時に会議準備をリマインド
```

## 注意事項

- Renderの無料プランはスリープ機能があります。初回アクセス時に起動に時間がかかることがあります。
- ファイルは受信後5分以内に保存指示がない場合は破棄されます。
- 毎朝通知を有効にするには、環境変数`DAILY_NOTIFICATION_TARGETS`に通知先のLINEユーザーID/グループIDをカンマ区切りで設定してください。

## ライセンス

PRIVATE - 合同会社無限
