# つづり（Firebase版）

日記を書いて、カレンダーで見返して、友達と共有できるウェブアプリです。
ログインは Firebase Authentication、データは Cloud Firestore に保存します。

```
tsuzuri-firebase/
├─ public/                  ← Hosting で公開されるフォルダ
│  ├─ index.html            ホーム（今日の日記を書くボタン／書いたら消える）
│  ├─ diary.html            日記を書く・読む・編集
│  ├─ mypage.html           カレンダー・友達・アカウント
│  ├─ style.css
│  └─ js/
│     ├─ firebase-config.js ★ ここに自分の Firebase 設定を貼る
│     └─ app.js             ログイン・データ操作の共通処理
├─ firestore.rules          セキュリティルール
├─ firestore.indexes.json   友達の日記を読むための複合インデックス
├─ firebase.json
└─ .firebaserc              ★ プロジェクトIDを書く
```

---

## セットアップ手順

### 1. Firebase プロジェクトを作る
1. <https://console.firebase.google.com/> で「プロジェクトを追加」（無料の Spark プランで動きます）
2. プロジェクトの設定 → 「マイアプリ」→ ウェブアプリ（`</>`）を追加
3. 表示された `firebaseConfig` を **`public/js/firebase-config.js`** に貼り付け

### 2. ログイン方法を有効にする
Authentication → Sign-in method で次の2つを有効にします。
- **Google**（サポートメールを選ぶだけ）
- **メール / パスワード**

### 3. Firestore を作る
Firestore Database → 「データベースを作成」
- ロケーション：`asia-northeast1`（東京）がおすすめ
- モード：本番環境モード（ルールはこのあと手順4で上書きします）

### 4. ルール・インデックス・サイトを公開する
```bash
npm install -g firebase-tools
firebase login
firebase use --add            # 作ったプロジェクトを選ぶ（.firebaserc が更新されます）
firebase deploy               # ルール・インデックス・Hosting をまとめて公開
```
公開後、`https://<プロジェクトID>.web.app` で使えます。

> **インデックスについて**：友達の日記の読み込みには `firestore.indexes.json` の複合インデックスが必要です。
> デプロイ直後は作成に数分かかり、その間は友達の日記が読めないことがあります。

---

## ローカルで開発する

**本物の Firebase につなぐ場合**（`localhost` は最初から承認済みドメインに入っています）
```bash
firebase emulators:start --only hosting   # http://localhost:5000
```
※ ES モジュールを使っているので、`index.html` をダブルクリックで開く（file://）と動きません。

**エミュレーターで試す場合**（本番データを汚さない）
1. `public/js/firebase-config.js` の `useEmulator` を `true` にする
2. 次を実行してから http://localhost:5000 を開く
```bash
firebase emulators:start   # Auth / Firestore / Hosting / Emulator UI が起動
```
Emulator UI（http://localhost:4000）でデータやルールの判定ログを見られます。

---

## データの構成

| パス | 中身 | 読める人 |
|---|---|---|
| `users/{uid}` | 名前・友達コード・自作の項目 | 本人と友達 |
| `users/{uid}/diaries/{YYYY-MM-DD}` | 日記（本文・気分・項目・`shared`） | 本人／友達は `shared == true` のものだけ |
| `users/{uid}/friends/{友達uid}` | 友達リスト（お互いに1件ずつ） | 本人 |
| `friendCodes/{コード}` | 友達コード → uid | ログイン中の人（1件ずつ取得のみ、一覧は不可） |
| `friendRequests/{送った人_受けた人}` | 友達申請 | 送った人と受けた人 |

### 友達になる流れ
1. マイページの「友達」タブで、相手の **友達コード（8文字）** を入力して申請
2. 相手のマイページに「届いた友達申請」が出るので「承認」
3. 承認すると、お互いの「友達に公開」した日記が読めるようになります
   - お互いに申請していた場合は、コードを入れた時点で友達になります
   - どちらかが「友達をやめる」と、両方から消えて読めなくなります

### 公開範囲
日記ごとに **👥 友達に公開 / 🔒 自分だけ** を選べます（前回選んだほうが初期値になります）。
保存後も日記の画面からワンタップで切り替えられます。

---

## 以前の版（端末に保存する版）からの移行
- **同じブラウザ・同じアドレスで使っていた場合**：マイページに「この端末に以前の日記があります」が出るので「アカウントに移す」を押す
- **それ以外の場合**：以前の版のマイページで「書き出す（JSON）」→ 新しい版のマイページで「以前の版のバックアップを読み込む」

移した日記は、いったんすべて「自分だけ」になります。

---

## 無料枠の目安（Spark プラン）
Firestore の読み取りは 1日 5万回まで無料です。目安として、ホームを1回開くと「自分の最近の日記 最大35件＋友達1人あたり最大3件」程度を読みます。
個人や友達同士で使うぶんには、まず無料枠に収まります。
