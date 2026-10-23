/* Daylogger — 共通モジュール（Firebase 初期化・ログイン・データ操作・表示ヘルパー） */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, connectAuthEmulator, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query,
  where, orderBy, limit, getDocs, writeBatch, serverTimestamp, getCountFromServer, arrayUnion,
  runTransaction, increment,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, useEmulator } from './firebase-config.js';
import {
  BATTLES_PER_DAY, SKILLS, levelInfo, diaryReward, emptyStats, addStats, fmtStats,
} from './game.js';

// =====================================================================
//  初期化
// =====================================================================
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const emu = useEmulator && isLocal;
const configured = emu || !String(firebaseConfig.apiKey || '').startsWith('YOUR_');

const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
let db;
try {
  // オフラインでも読めるように端末にキャッシュする
  db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  db = getFirestore(fbApp);
}
if (emu) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
getRedirectResult(auth).catch(() => {}); // スマホでリダイレクトログインした場合の後処理

/** ログイン中のユーザー */
export let me = null;
/** users/{uid} のプロフィール */
export let profile = null;
/** players/{uid} のゲームデータ（読み込めなかったときは null） */
export let player = null;

// =====================================================================
//  項目（カテゴリ）
// =====================================================================
export const DEFAULT_CATEGORIES = [
  { id: 'place',    icon: '📍', name: '行った場所',       hint: '例：渋谷のカフェ' },
  { id: 'food',     icon: '🍽️', name: '食べたもの',       hint: '例：ラーメン' },
  { id: 'cook',     icon: '🍳', name: '料理',             hint: '例：カレーを作った' },
  { id: 'cafe',     icon: '☕', name: 'カフェ・お店',     hint: '例：〇〇珈琲' },
  { id: 'music',    icon: '🎵', name: '音楽',             hint: '例：曲名 / アーティスト' },
  { id: 'live',     icon: '🎤', name: 'ライブ・イベント', hint: '例：フェスに行った' },
  { id: 'book',     icon: '📚', name: '本',               hint: '例：タイトル / 何ページ' },
  { id: 'manga',    icon: '📖', name: '漫画',             hint: '例：〇〇 12巻' },
  { id: 'anime',    icon: '📺', name: 'アニメ',           hint: '例：作品名 第3話' },
  { id: 'movie',    icon: '🎬', name: '映画',             hint: '例：作品名' },
  { id: 'drama',    icon: '🎞️', name: 'ドラマ',           hint: '例：作品名 第5話' },
  { id: 'youtube',  icon: '▶️', name: 'YouTube・配信',    hint: '例：チャンネル名' },
  { id: 'game',     icon: '🎮', name: 'ゲーム',           hint: '例：タイトル / 進んだところ' },
  { id: 'oshi',     icon: '💖', name: '推し活',           hint: '例：グッズを買った' },
  { id: 'workout',  icon: '💪', name: '筋トレ',           hint: '例：腕立て 30回 × 3' },
  { id: 'run',      icon: '🏃', name: 'ランニング・運動', hint: '例：5km 30分' },
  { id: 'study',    icon: '✏️', name: '勉強',             hint: '例：英単語 50個' },
  { id: 'work',     icon: '💼', name: '仕事',             hint: '例：企画書を提出' },
  { id: 'people',   icon: '👥', name: '会った人',         hint: '例：〇〇さんとランチ' },
  { id: 'shopping', icon: '🛍️', name: '買ったもの',       hint: '例：新しいスニーカー' },
  { id: 'weather',  icon: '☀️', name: '天気',             hint: '例：晴れ 22℃' },
  { id: 'sleep',    icon: '😴', name: '睡眠',             hint: '例：7時間' },
  { id: 'good',     icon: '✨', name: 'よかったこと',     hint: '例：褒められた' },
  { id: 'thanks',   icon: '🙏', name: '感謝したこと',     hint: '例：〇〇さんに助けられた' },
  { id: 'todo',     icon: '✅', name: 'できたこと',       hint: '例：部屋の掃除' },
  { id: 'photo',    icon: '📷', name: '撮った写真',       hint: '例：夕焼け' },
];
export const MOODS = [
  { v: 5, e: '😆', label: 'さいこう' },
  { v: 4, e: '😊', label: 'いい感じ' },
  { v: 3, e: '😐', label: 'ふつう' },
  { v: 2, e: '😔', label: 'いまいち' },
  { v: 1, e: '😢', label: 'つらい' },
];
export const moodEmoji = (v) => (MOODS.find((m) => m.v === v) || {}).e || '📝';

export const categories = () => [...DEFAULT_CATEGORIES, ...((profile && profile.customCats) || [])];
/** extra: 友達の日記に含まれる友達側のカスタム項目定義 */
export function findCat(id, extra = []) {
  return categories().find((c) => c.id === id) || extra.find((c) => c.id === id) || { id, icon: '🏷️', name: id };
}

// =====================================================================
//  日付・表示ヘルパー
// =====================================================================
export const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => toKey(new Date());
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const fmtDate = (k) => { const d = parseKey(k); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`; };
export const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k || '');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Firebase のエラーを日本語に */
export function errMsg(e) {
  const code = (e && e.code) || '';
  const map = {
    'permission-denied': '見る権限がありません（非公開か、友達ではありません）',
    'unavailable': '通信できませんでした。電波の良いところでもう一度試してください',
    'auth/invalid-email': 'メールアドレスの形式が正しくありません',
    'auth/invalid-credential': 'メールアドレスかパスワードが違います',
    'auth/wrong-password': 'メールアドレスかパスワードが違います',
    'auth/user-not-found': 'このメールアドレスのアカウントはありません',
    'auth/email-already-in-use': 'このメールアドレスはすでに登録されています',
    'auth/weak-password': 'パスワードは6文字以上にしてください',
    'auth/too-many-requests': '試行回数が多すぎます。少し時間をおいてください',
    'auth/popup-closed-by-user': 'ログインがキャンセルされました',
    'auth/network-request-failed': '通信できませんでした',
    'auth/unauthorized-domain': 'このドメインはFirebaseで許可されていません（Authentication → 設定 → 承認済みドメイン）',
    'auth/operation-not-allowed': 'このログイン方法がFirebaseで有効になっていません',
  };
  return map[code] || (e && e.message) || 'エラーが発生しました';
}

export function entryItemHTML(diary, href, extraMeta = '') {
  const cats = (diary.categories || []).filter((c) => (c.items || []).some((i) => i.trim()));
  const extra = diary.customCatDefs || [];
  return `<a class="entry-item" href="${href}">
    <div class="mood">${moodEmoji(diary.mood)}</div>
    <div style="min-width:0;flex:1">
      <div class="meta">${fmtDate(diary.date)}${extraMeta}</div>
      <div class="ttl">${esc(diary.title || '無題の日')}</div>
      ${diary.text ? `<div class="snip">${esc(diary.text)}</div>` : ''}
      ${cats.length ? `<div class="tags">${cats.map((c) => { const k = findCat(c.id, extra); return `<span class="tag">${k.icon} ${esc(k.name)}</span>`; }).join('')}</div>` : ''}
    </div>
  </a>`;
}

// =====================================================================
//  ヘッダー・ログイン画面・起動処理
// =====================================================================
function renderHeader(current) {
  const links = [['index.html', 'ホーム'], ['diary.html', '日記を書く'], ['battle.html', 'バトル'], ['mypage.html', 'マイページ']];
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `<div class="inner">
    <a class="logo" href="index.html">📔 <span>Daylogger</span></a>
    <nav class="nav">${links.map(([href, label]) => `<a href="${href}" ${href === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  </div>`;
  document.body.prepend(header);
}

function renderSetupNeeded(main) {
  main.innerHTML = `<section class="card">
    <h1 style="font-size:1.3rem">Firebase の設定がまだです</h1>
    <p><code>js/firebase-config.js</code> に Firebase コンソールの設定値（firebaseConfig）を貼り付けてください。手順は README.md にあります。</p>
  </section>`;
}

function renderLogin(main) {
  let mode = 'login';
  main.innerHTML = `<section class="card login">
    <div class="login-logo">📔</div>
    <h1>Daylogger</h1>
    <p class="muted">日記を書いて、見返して、友達と共有しよう</p>
    <button class="btn google-btn" id="google" type="button">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Google でログイン
    </button>
    <div class="or"><span>または</span></div>
    <form id="email-form" class="login-form">
      <input type="email" id="email" placeholder="メールアドレス" autocomplete="email" required>
      <input type="password" id="password" placeholder="パスワード（6文字以上）" autocomplete="current-password" minlength="6" required>
      <button class="btn primary" type="submit" id="email-submit">メールでログイン</button>
    </form>
    <p class="login-links">
      <a href="#" id="toggle-mode">アカウントを新しく作る</a> ・ <a href="#" id="reset">パスワードを忘れた</a>
    </p>
    <p class="login-error" id="login-error" role="alert"></p>
  </section>`;

  const errEl = $('#login-error');
  const showErr = (e) => { errEl.textContent = typeof e === 'string' ? e : errMsg(e); };
  const done = () => location.reload();

  $('#google').onclick = async () => {
    showErr('');
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); done(); }
    catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-environment'].includes(e.code)) signInWithRedirect(auth, provider);
      else showErr(e);
    }
  };
  $('#toggle-mode').onclick = (ev) => {
    ev.preventDefault();
    mode = mode === 'login' ? 'signup' : 'login';
    $('#email-submit').textContent = mode === 'login' ? 'メールでログイン' : 'アカウントを作成';
    $('#toggle-mode').textContent = mode === 'login' ? 'アカウントを新しく作る' : 'ログインに戻る';
    $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  };
  $('#reset').onclick = async (ev) => {
    ev.preventDefault();
    const email = $('#email').value.trim();
    if (!email) { showErr('メールアドレスを入力してから押してください'); return; }
    try { await sendPasswordResetEmail(auth, email); showErr(''); toast('パスワード再設定メールを送りました'); }
    catch (e) { showErr(e); }
  };
  $('#email-form').onsubmit = async (ev) => {
    ev.preventDefault();
    showErr('');
    const email = $('#email').value.trim();
    const pw = $('#password').value;
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, pw);
      else await createUserWithEmailAndPassword(auth, email, pw);
      done();
    } catch (e) { showErr(e); }
  };
}

function waitForUser() {
  return new Promise((resolve) => { const un = onAuthStateChanged(auth, (u) => { un(); resolve(u); }); });
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい I O 0 1 は使わない
function genCode() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

/** 初回ログイン時にプロフィールと友達コードを作る */
async function ensureProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    if ((await getDoc(doc(db, 'friendCodes', code))).exists()) continue;
    const data = {
      name: (user.displayName || (user.email || '').split('@')[0] || '名無し').slice(0, 20),
      friendCode: code, customCats: [], defaultShared: true, createdAt: serverTimestamp(),
    };
    const b = writeBatch(db);
    b.set(ref, data);
    b.set(doc(db, 'friendCodes', code), { uid: user.uid });
    await b.commit();
    return data;
  }
  throw new Error('友達コードの発行に失敗しました。再読み込みしてください');
}

/**
 * 各ページの最初に呼ぶ。ログインしていなければログイン画面を出して null を返す。
 */
export async function boot(current) {
  renderHeader(current);
  const main = $('main');
  if (!configured) { renderSetupNeeded(main); return null; }
  main.innerHTML = '<div class="loading" aria-live="polite"><span class="spinner"></span>読み込み中…</div>';
  const user = await waitForUser();
  if (!user) { renderLogin(main); return null; }
  me = user;
  try {
    profile = await ensureProfile(user);
  } catch (e) {
    main.innerHTML = `<div class="card empty">${esc(errMsg(e))}</div>`;
    return null;
  }
  // ゲームデータが読めなくても日記は使えるようにする
  try { player = await ensurePlayer(); }
  catch (e) { console.warn('ゲームデータを読み込めませんでした', e); player = null; }
  return { user, profile };
}

export const logout = () => signOut(auth).then(() => { location.href = 'index.html'; });

// =====================================================================
//  プロフィール
// =====================================================================
export async function updateMyProfile(patch) {
  await updateDoc(doc(db, 'users', me.uid), patch);
  Object.assign(profile, patch);
  if (patch.name && player) {
    await updateDoc(playerRef(), { name: patch.name }).catch(() => {});
    player.name = patch.name;
  }
}
export async function addCustomCat(name, icon) {
  const cat = { id: 'c_' + Date.now().toString(36), icon: icon || '🏷️', name: name.slice(0, 20), hint: '' };
  await updateDoc(doc(db, 'users', me.uid), { customCats: arrayUnion(cat) });
  profile.customCats = [...(profile.customCats || []), cat];
  return cat;
}
/** 友達のプロフィール（名前）を取得。友達でなければ null */
export async function getUserName(uid) {
  try { const s = await getDoc(doc(db, 'users', uid)); return s.exists() ? s.data().name : null; }
  catch { return null; }
}

// =====================================================================
//  日記
// =====================================================================
const diariesCol = (uid) => collection(db, 'users', uid, 'diaries');
const PAGE = 35; // 今月分＋連続日数の計算に足りる件数（足りなければ自動で追加読み込み）

/** オフライン時は書き込みの完了（サーバー到達）を待たずに進める */
async function commitWrite(promise) {
  if (navigator.onLine) await promise;
  else { promise.catch(() => {}); toast('オフラインで保存しました。つながったら自動で同期されます'); }
}

export async function getDiary(date, uid = me.uid) {
  const s = await getDoc(doc(diariesCol(uid), date));
  return s.exists() ? s.data() : null;
}

/**
 * 日記を保存し、経験値・ステータスを反映する。
 * 戻り値はもらえた分（rewardHTML() に渡す）。変化がなければ null
 */
export async function saveDiary(date, data, existing) {
  const used = (profile.customCats || []).filter((c) => data.categories.some((x) => x.id === c.id));
  const old = (existing && existing.reward) || null;
  // 経験値の対象は今日・昨日の日記だけ。それより前の日記を直しても、前にもらった分はそのまま
  const reward = player && isRewardable(date) ? diaryReward(data) : old;
  const body = {
    date,
    title: data.title,
    text: data.text,
    mood: data.mood,
    categories: data.categories,
    customCatDefs: used,          // 友達側でもカスタム項目名を表示できるように一緒に保存
    shared: !!data.shared,
    createdAt: (existing && existing.createdAt) || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (reward) body.reward = reward;
  const b = writeBatch(db);
  b.set(doc(diariesCol(me.uid), date), body);
  // 前回保存したときの分との差だけ足す（書き直しても二重にもらえない）
  const result = player && reward !== old ? applyReward(b, rewardDelta(reward, old)) : null;
  await commitWrite(b.commit());
  if (profile.defaultShared !== body.shared) updateMyProfile({ defaultShared: body.shared }).catch(() => {});
  return result;
}

export async function setDiaryShared(date, shared) {
  await commitWrite(updateDoc(doc(diariesCol(me.uid), date), { shared, updatedAt: serverTimestamp() }));
}

/** existing: 削除する日記（もらった経験値・ステータスを差し引く） */
export async function deleteDiary(date, existing) {
  const b = writeBatch(db);
  b.delete(doc(diariesCol(me.uid), date));
  if (player && existing && existing.reward) applyReward(b, rewardDelta(null, existing.reward));
  await commitWrite(b.commit());
}

/** 新しい順に n 件。他人の場合は公開されている日記だけ */
export async function recentDiaries(n = PAGE, uid = me.uid, before = null) {
  const cons = [];
  if (uid !== me.uid) cons.push(where('shared', '==', true));
  if (before) cons.push(where('date', '<', before));
  cons.push(orderBy('date', 'desc'), limit(n));
  const s = await getDocs(query(diariesCol(uid), ...cons));
  return s.docs.map((d) => d.data());
}

/** 指定した月（'YYYY-MM'）の日記 */
export async function monthDiaries(ym, uid = me.uid) {
  const cons = [];
  if (uid !== me.uid) cons.push(where('shared', '==', true));
  cons.push(where('date', '>=', `${ym}-01`), where('date', '<=', `${ym}-31`), orderBy('date', 'desc'));
  const s = await getDocs(query(diariesCol(uid), ...cons));
  return s.docs.map((d) => d.data());
}

export async function countMyDiaries() {
  try { return (await getCountFromServer(diariesCol(me.uid))).data().count; }
  catch { return null; }
}

/** 連続日数。first には recentDiaries() の結果を渡すと読み取り回数を節約できる */
export async function getStreak(first) {
  let page = first || (await recentDiaries(PAGE));
  const d = new Date();
  let set = new Set(page.map((x) => x.date));
  if (!set.has(toKey(d))) d.setDate(d.getDate() - 1); // 今日まだなら昨日から数える
  let n = 0;
  for (;;) {
    if (set.has(toKey(d))) { n++; d.setDate(d.getDate() - 1); continue; }
    // 読み込んだ範囲の端まで連続していたら、さらに古い分を読む
    const oldest = page.length ? page[page.length - 1].date : null;
    if (page.length === PAGE && oldest && toKey(d) < oldest) {
      page = await recentDiaries(PAGE, me.uid, oldest);
      set = new Set(page.map((x) => x.date));
      continue;
    }
    return n;
  }
}

export async function allMyDiaries() {
  const s = await getDocs(query(diariesCol(me.uid), orderBy('date', 'desc')));
  return s.docs.map((d) => d.data());
}

/** 以前の端末保存版（localStorage）から移行 */
export function localDiaries() {
  try {
    if (localStorage.getItem('tsuzuri.migrated')) return null;
    const all = JSON.parse(localStorage.getItem('tsuzuri.diaries') || '{}');
    const cats = JSON.parse(localStorage.getItem('tsuzuri.customCats') || '[]');
    return Object.keys(all).length ? { diaries: all, customCats: cats } : null;
  } catch { return null; }
}
export async function migrateLocal(data) {
  const known = new Set((profile.customCats || []).map((c) => c.id));
  const newCats = data.customCats.filter((c) => !known.has(c.id)).map((c) => ({ id: c.id, icon: c.icon || '🏷️', name: String(c.name).slice(0, 20), hint: '' }));
  if (newCats.length) {
    await updateDoc(doc(db, 'users', me.uid), { customCats: arrayUnion(...newCats) });
    profile.customCats = [...(profile.customCats || []), ...newCats];
  }
  const entries = Object.entries(data.diaries).filter(([k]) => isDateKey(k));
  for (let i = 0; i < entries.length; i += 400) {
    const b = writeBatch(db);
    entries.slice(i, i + 400).forEach(([date, d]) => {
      const cats = (d.categories || []).map((c) => ({ id: String(c.id), items: (c.items || []).map(String).filter(Boolean) }));
      b.set(doc(diariesCol(me.uid), date), {
        date, title: String(d.title || '').slice(0, 60), text: String(d.text || '').slice(0, 20000),
        mood: Number(d.mood) || 0, categories: cats,
        customCatDefs: (profile.customCats || []).filter((c) => cats.some((x) => x.id === c.id)),
        shared: false, // 移行した日記はいったん「自分だけ」にする
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    });
    await b.commit();
  }
  try { localStorage.setItem('tsuzuri.migrated', '1'); } catch { /* noop */ }
  return entries.length;
}

// =====================================================================
//  友達
// =====================================================================
const reqCol = () => collection(db, 'friendRequests');
const friendsCol = (uid) => collection(db, 'users', uid, 'friends');

export async function listFriends() {
  const s = await getDocs(friendsCol(me.uid));
  const list = await Promise.all(s.docs.map(async (d) => {
    const name = await getUserName(d.id);
    return { uid: d.id, name: name ?? '（友達ではなくなりました）', active: name !== null };
  }));
  return list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export async function incomingRequests() {
  const s = await getDocs(query(reqCol(), where('to', '==', me.uid)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function outgoingRequests() {
  const s = await getDocs(query(reqCol(), where('from', '==', me.uid)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** 友達コードで申請する。相手からも申請が来ていればそのまま友達になる */
export async function sendFriendRequest(rawCode) {
  const code = String(rawCode).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) throw new Error('友達コードは8文字です');
  if (code === profile.friendCode) throw new Error('それはあなた自身のコードです');
  const c = await getDoc(doc(db, 'friendCodes', code));
  if (!c.exists()) throw new Error('そのコードのユーザーは見つかりませんでした');
  const to = c.data().uid;
  if ((await getDoc(doc(friendsCol(me.uid), to))).exists()) throw new Error('すでに友達です');

  const incoming = await getDocs(query(reqCol(), where('to', '==', me.uid), where('from', '==', to)));
  if (!incoming.empty) {
    await acceptFriendRequest({ id: incoming.docs[0].id, ...incoming.docs[0].data() });
    return 'accepted';
  }
  try {
    await setDoc(doc(reqCol(), `${me.uid}_${to}`), {
      from: me.uid, to, fromName: profile.name, toCode: code, createdAt: serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 'permission-denied') throw new Error('すでに申請済みです');
    throw e;
  }
  return 'sent';
}

export async function acceptFriendRequest(req) {
  const b = writeBatch(db);
  b.set(doc(friendsCol(me.uid), req.from), { since: serverTimestamp() });
  b.set(doc(friendsCol(req.from), me.uid), { since: serverTimestamp() });
  b.delete(doc(reqCol(), req.id));
  // 自分からも相手に申請していたら、それも片付ける
  const mine = await getDocs(query(reqCol(), where('from', '==', me.uid), where('to', '==', req.from)));
  mine.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
}

export async function deleteFriendRequest(req) {
  await deleteDoc(doc(reqCol(), req.id));
}

export async function removeFriend(uid) {
  const b = writeBatch(db);
  b.delete(doc(friendsCol(me.uid), uid));
  b.delete(doc(friendsCol(uid), me.uid));
  await b.commit();
}

/** 友達の最近の公開日記をまとめて取得 */
export async function friendFeed(perFriend = 3, total = 8) {
  const friends = (await listFriends()).filter((f) => f.active);
  const lists = await Promise.all(friends.map(async (f) => {
    try { return (await recentDiaries(perFriend, f.uid)).map((d) => ({ ...d, _uid: f.uid, _name: f.name })); }
    catch { return []; }
  }));
  return lists.flat()
    .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)))
    .slice(0, total);
}

// =====================================================================
//  ゲーム（レベル・ステータス・バトル）
// =====================================================================
const playerRef = (uid = me.uid) => doc(db, 'players', uid);
const ONLINE_MS = 5 * 60 * 1000; // この時間内に開いていた人を「オンライン」とする

/** 経験値がもらえる日記（今日と昨日の分） */
export function isRewardable(date) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return date >= toKey(y) && date <= todayKey();
}

function rewardDelta(next, prev) {
  const stats = addStats(addStats({}, next && next.stats), prev && prev.stats, -1);
  Object.keys(stats).forEach((k) => { if (!stats[k]) delete stats[k]; });
  return { exp: ((next && next.exp) || 0) - ((prev && prev.exp) || 0), stats };
}

/** バッチに経験値・ステータスの加算を入れて、手元の player にも反映する */
function applyReward(b, delta) {
  if (!delta.exp && !Object.keys(delta.stats).length) return null;
  const patch = { exp: increment(delta.exp) };
  Object.entries(delta.stats).forEach(([k, v]) => { patch[`stats.${k}`] = increment(v); });
  b.update(playerRef(), patch);
  const before = levelInfo(player.exp).level;
  player.exp += delta.exp;
  player.stats = addStats({ ...emptyStats(), ...player.stats }, delta.stats);
  return { ...delta, before, after: levelInfo(player.exp).level };
}

/** 初回はこれまでの日記ぶんの経験値・ステータスをまとめて付与してゲームデータを作る */
async function ensurePlayer() {
  const ref = playerRef();
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const p = snap.data();
    // オンライン表示用。書き込みを減らすため数分おきにだけ更新する
    if (navigator.onLine && Date.now() - (p.lastActive?.toMillis?.() || 0) > 3 * 60 * 1000) touchActive().catch(() => {});
    return p;
  }
  const diaries = await allMyDiaries();
  const data = {
    name: profile.name, exp: 0, stats: emptyStats(), wins: 0, losses: 0,
    battleDate: '', battleCount: 0, lastActive: serverTimestamp(), createdAt: serverTimestamp(),
  };
  const b = writeBatch(db);
  diaries.forEach((d) => {
    const r = diaryReward(d);
    data.exp += r.exp;
    addStats(data.stats, r.stats);
    // 今日・昨日の日記は書き直すと差分で計算するので、もらった分を記録しておく
    if (isRewardable(d.date)) b.update(doc(diariesCol(me.uid), d.date), { reward: r });
  });
  b.set(ref, data);
  await b.commit();
  return { ...data, lastActive: null, createdAt: null };
}

/** 「オンライン」の表示を更新する */
export async function touchActive() {
  await updateDoc(playerRef(), { lastActive: serverTimestamp() });
}
export const isOnline = (p) => !!p.lastActive && Date.now() - p.lastActive.toMillis() < ONLINE_MS;

export const battlesUsed = () => (player && player.battleDate === todayKey() ? player.battleCount : 0);
export const battlesLeft = () => (player ? BATTLES_PER_DAY - battlesUsed() : 0);

/** バトルを1回分使う（1日3回まで）。足りなければエラー */
export async function useBattle() {
  const today = todayKey();
  const n = await runTransaction(db, async (tx) => {
    const p = (await tx.get(playerRef())).data();
    const used = p.battleDate === today ? p.battleCount : 0;
    if (used >= BATTLES_PER_DAY) throw new Error(`今日のバトルはもう${BATTLES_PER_DAY}回しました。また明日！`);
    tx.update(playerRef(), { battleDate: today, battleCount: used + 1, lastActive: serverTimestamp() });
    return used + 1;
  });
  player.battleDate = today;
  player.battleCount = n;
}

/** バトルの結果を記録する。勝ったら経験値をもらう */
export async function recordBattle(win, exp) {
  const b = writeBatch(db);
  b.update(playerRef(), win ? { wins: increment(1) } : { losses: increment(1) });
  const result = win ? applyReward(b, { exp, stats: {} }) : null;
  await b.commit();
  if (win) player.wins = (player.wins || 0) + 1; else player.losses = (player.losses || 0) + 1;
  return result;
}

export async function getPlayer(uid) {
  const s = await getDoc(playerRef(uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

/** 最近アプリを開いた人（自分以外） */
export async function recentPlayers(n = 40) {
  const s = await getDocs(query(collection(db, 'players'), orderBy('lastActive', 'desc'), limit(n)));
  return s.docs.filter((d) => d.id !== me.uid).map((d) => ({ uid: d.id, ...d.data() }));
}

export function expBarHTML(exp) {
  const { cur, need } = levelInfo(exp);
  const pct = need ? Math.floor((cur / need) * 100) : 100;
  return `<div class="exp-wrap">
    <div class="exp-bar" role="progressbar" aria-label="経験値" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
    <div class="exp-text">${need ? `次のレベルまで あと ${need - cur} EXP` : 'レベル最大！'}</div>
  </div>`;
}

/** saveDiary() / recordBattle() の戻り値を表示する */
export function rewardHTML(r, title = '') {
  const learned = SKILLS.filter((s) => s.lv > r.before && s.lv <= r.after);
  const stats = fmtStats(r.stats);
  return `<section class="card reward ${r.after > r.before ? 'up' : ''}" role="status">
    ${title ? `<div class="reward-title">${title}</div>` : ''}
    <div class="reward-exp">${r.exp >= 0 ? '+' : ''}${r.exp} EXP</div>
    ${stats ? `<div class="reward-stats">${stats}</div>` : ''}
    ${r.after > r.before ? `<div class="levelup">🎉 レベルアップ！ Lv${r.before} → <b>Lv${r.after}</b></div>` : ''}
    ${r.after < r.before ? `<div class="muted">レベルが下がりました（Lv${r.before} → Lv${r.after}）</div>` : ''}
    ${learned.map((s) => `<div class="learned">${s.icon} 新しいスキル「${esc(s.name)}」を覚えた！</div>`).join('')}
    ${player ? expBarHTML(player.exp) : ''}
  </section>`;
}
