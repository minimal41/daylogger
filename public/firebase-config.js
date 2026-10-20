// =====================================================================
//  Firebase の設定
//  Firebase コンソール → プロジェクトの設定 → マイアプリ（ウェブ）に
//  表示される firebaseConfig をそのまま貼り付けてください。
// =====================================================================
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// localhost で Firebase Emulator Suite を使って開発するときだけ true にします。
// （本番の Hosting 上では true のままでも自動的に無視されます）
export const useEmulator = false;
