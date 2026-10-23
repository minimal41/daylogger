/* Daylogger — ゲーム要素（レベル・ステータス・スキル・バトルの計算）。Firebase には依存しない */

// =====================================================================
//  レベル・経験値
// =====================================================================
export const MAX_LEVEL = 99;
export const BATTLES_PER_DAY = 3;

/** Lv → Lv+1 に必要な経験値 */
export const expToNext = (lv) => 40 + lv * 20;
/** そのレベルになるのに必要な累計経験値 */
export function expForLevel(lv) {
  let e = 0;
  for (let i = 1; i < lv; i++) e += expToNext(i);
  return e;
}
/** 累計経験値 → { level, cur（今のレベルでためた分）, need（次のレベルまでに必要な分） } */
export function levelInfo(exp) {
  let level = 1, cur = Math.max(0, Math.floor(exp || 0));
  while (level < MAX_LEVEL && cur >= expToNext(level)) { cur -= expToNext(level); level++; }
  return { level, cur, need: level < MAX_LEVEL ? expToNext(level) : 0 };
}

// =====================================================================
//  ステータス
// =====================================================================
export const STATS = [
  { key: 'hp',  icon: '❤️', name: 'たいりょく' },
  { key: 'atk', icon: '⚔️', name: 'こうげき' },
  { key: 'def', icon: '🛡️', name: 'ぼうぎょ' },
  { key: 'mag', icon: '🔮', name: 'まりょく' },
  { key: 'spd', icon: '👟', name: 'すばやさ' },
  { key: 'luk', icon: '🍀', name: 'うん' },
];
export const emptyStats = () => Object.fromEntries(STATS.map((s) => [s.key, 0]));
export const statInfo = (k) => STATS.find((s) => s.key === k) || { key: k, icon: '', name: k };
/** { atk: 2, spd: 1 } → '⚔️こうげき+2　👟すばやさ+1' */
export function fmtStats(stats) {
  return STATS.filter((s) => stats && stats[s.key])
    .map((s) => `${s.icon}${s.name}${stats[s.key] > 0 ? '+' : ''}${stats[s.key]}`).join('　');
}
export function addStats(target, src, sign = 1) {
  Object.entries(src || {}).forEach(([k, v]) => { target[k] = (target[k] || 0) + v * sign; });
  return target;
}

/** 日記の項目ごとに上がるステータス（どれも合計 2 ポイント） */
export const CAT_STATS = {
  place:    { spd: 1, luk: 1 },
  food:     { hp: 2 },
  cook:     { hp: 1, def: 1 },
  cafe:     { hp: 1, luk: 1 },
  music:    { mag: 1, spd: 1 },
  live:     { atk: 1, spd: 1 },
  book:     { mag: 2 },
  manga:    { mag: 1, luk: 1 },
  anime:    { mag: 1, luk: 1 },
  movie:    { mag: 1, def: 1 },
  drama:    { mag: 1, def: 1 },
  youtube:  { mag: 1, spd: 1 },
  game:     { atk: 1, spd: 1 },
  oshi:     { atk: 1, luk: 1 },
  workout:  { atk: 2 },
  run:      { spd: 2 },
  study:    { mag: 2 },
  work:     { def: 2 },
  people:   { def: 1, luk: 1 },
  shopping: { luk: 2 },
  weather:  { hp: 1, luk: 1 },
  sleep:    { hp: 2 },
  good:     { luk: 2 },
  thanks:   { hp: 1, def: 1 },
  todo:     { atk: 1, def: 1 },
  photo:    { spd: 1, luk: 1 },
};
export function catStats(id) {
  if (CAT_STATS[id]) return CAT_STATS[id];
  // 自作の項目は id から決まるステータスが上がる
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { [STATS[h % STATS.length].key]: 2 };
}

/** ステータスが上がるのは 1日 8項目まで */
export const MAX_STAT_CATS = 8;

/** 日記1件でもらえる経験値とステータス */
export function diaryReward(d) {
  const cats = (d.categories || []).filter((c) => (c.items || []).some((i) => String(i).trim()));
  const len = String(d.text || '').trim().length;
  const exp = 30
    + Math.min(cats.length, MAX_STAT_CATS) * 5
    + Math.min(Math.floor(len / 40), 15) * 2
    + (d.mood ? 5 : 0)
    + (String(d.title || '').trim() ? 3 : 0);
  const stats = {};
  cats.slice(0, MAX_STAT_CATS).forEach((c) => addStats(stats, catStats(c.id)));
  if (len >= 300) addStats(stats, { mag: 1 }); // たくさん書くと まりょく も上がる
  return { exp, stats };
}

/** レベルと日記で上げたステータスから、バトルで使う能力値を出す */
export function battleStats(p, mult = 1) {
  const { level } = levelInfo(p.exp);
  const pt = (k) => Math.max(0, (p.stats && p.stats[k]) || 0);
  const r = (v) => Math.round(v * mult);
  return {
    level,
    hp:  r(60 + level * 12 + pt('hp') * 6),
    atk: r(8 + level * 2 + pt('atk')),
    def: r(6 + level * 2 + pt('def')),
    mag: r(8 + level * 2 + pt('mag')),
    spd: r(6 + level * 1.5 + pt('spd')),
    luk: r(5 + level + pt('luk')),
    mp:  15 + level * 2 + Math.floor(pt('mag') / 4),
  };
}

// =====================================================================
//  スキル（レベルで覚える）
// =====================================================================
export const ATTACK = { id: 'attack', lv: 1, icon: '👊', name: 'たたかう', type: 'phys', power: 100, mp: 0 };
export const SKILLS = [
  { id: 'poke',   lv: 1,  icon: '🖊️', name: 'ペンでつつく',       type: 'phys', power: 125, mp: 3 },
  { id: 'rest',   lv: 3,  icon: '🍵', name: 'ひと息つく',         type: 'heal', power: 30,  mp: 6 },
  { id: 'ink',    lv: 5,  icon: '🖋️', name: 'インクショット',     type: 'mag',  power: 140, mp: 6 },
  { id: 'focus',  lv: 7,  icon: '🔥', name: 'きあいため',         type: 'buff', stat: 'atk', mult: 1.5, turns: 3, mp: 5 },
  { id: 'guard',  lv: 10, icon: '📔', name: '日記の盾',           type: 'buff', stat: 'def', mult: 1.6, turns: 3, mp: 5 },
  { id: 'combo',  lv: 13, icon: '✍️', name: 'れんぞく記録',       type: 'phys', power: 75,  hits: 2, mp: 8 },
  { id: 'flash',  lv: 16, icon: '💡', name: 'ひらめきフラッシュ', type: 'mag',  power: 170, mp: 12 },
  { id: 'streak', lv: 20, icon: '📅', name: '三日坊主やぶり',     type: 'phys', power: 190, mp: 14 },
  { id: 'sleep',  lv: 25, icon: '😴', name: 'ぐっすり快眠',       type: 'heal', power: 55,  mp: 14 },
  { id: 'storm',  lv: 30, icon: '🌪️', name: 'エッセイストーム',   type: 'mag',  power: 220, mp: 20 },
  { id: 'memory', lv: 40, icon: '💥', name: 'メモリーブレイク',   type: 'phys', power: 230, pierce: 0.5, mp: 24 },
  { id: 'saga',   lv: 50, icon: '🌌', name: '千日の物語',         type: 'mag',  power: 280, mp: 32 },
];
export const skillsFor = (lv) => SKILLS.filter((s) => s.lv <= lv);
export function skillDesc(s) {
  if (s.type === 'heal') return `HPを最大の${s.power}%回復`;
  if (s.type === 'buff') return `${statInfo(s.stat).name}が${s.turns}ターン${s.mult}倍`;
  return `${s.type === 'mag' ? 'まほう' : 'ぶつり'}・威力${s.power}${s.hits ? `×${s.hits}回` : ''}${s.pierce ? '・ぼうぎょ半分を無視' : ''}`;
}

// =====================================================================
//  CPU（10段階）
// =====================================================================
export const CPUS = [
  { rank: 1,  icon: '💧', name: 'ねぼすけスライム',   level: 1,  mult: 0.8,  exp: 20,  bias: {} },
  { rank: 2,  icon: '🐈', name: 'サボりネコ',         level: 3,  mult: 0.9,  exp: 35,  bias: { spd: 1.8, def: 0.5 } },
  { rank: 3,  icon: '👺', name: 'あとまわしゴブリン', level: 6,  mult: 0.95, exp: 55,  bias: { atk: 1.6, mag: 0.5 } },
  { rank: 4,  icon: '🧟', name: 'スマホゾンビ',       level: 9,  mult: 1,    exp: 80,  bias: { hp: 2, spd: 0.4 } },
  { rank: 5,  icon: '🦇', name: 'よふかしコウモリ',   level: 13, mult: 1,    exp: 110, bias: { spd: 1.6, mag: 1.4, hp: 0.6 } },
  { rank: 6,  icon: '🐲', name: 'めんどくさドラゴン', level: 18, mult: 1.05, exp: 150, bias: { atk: 1.4, hp: 1.4, spd: 0.6 } },
  { rank: 7,  icon: '🗿', name: 'しめきりゴーレム',   level: 24, mult: 1.05, exp: 200, bias: { def: 2, hp: 1.5, spd: 0.3 } },
  { rank: 8,  icon: '🧙', name: '三日坊主の魔術師',   level: 31, mult: 1.05, exp: 260, bias: { mag: 1.6, def: 0.7 } },
  { rank: 9,  icon: '👹', name: '忘却の魔王',         level: 40, mult: 1.05, exp: 330, bias: { atk: 1.2, def: 1.2, mag: 1.2 } },
  { rank: 10, icon: '🌑', name: '白紙の帝王',         level: 50, mult: 1.1,  exp: 420, bias: { hp: 1.2, atk: 1.2, def: 1.2, mag: 1.2, spd: 1.2, luk: 1.2 } },
];
export function cpuFighter(c) {
  // そのレベルまで毎日日記を書いてきた人くらいのステータスにする
  const per = expForLevel(c.level) / 80;
  const stats = Object.fromEntries(STATS.map(({ key }) => [key, Math.round(per * (c.bias[key] ?? 1))]));
  return makeFighter({ name: c.name, icon: c.icon, exp: expForLevel(c.level), stats, mult: c.mult, smart: 0.3 + c.rank * 0.07 });
}

/** 人との対戦で勝ったときの経験値（相手が格上ほど多い） */
export function pvpReward(myLv, foeLv) {
  return Math.round((20 + foeLv * 6) * Math.min(2, Math.max(0.5, 1 + (foeLv - myLv) * 0.05)));
}

// =====================================================================
//  バトル
// =====================================================================
export const MAX_ROUNDS = 30;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const eff = (f, k) => f.base[k] * (f.buffs[k] && f.buffs[k].turns > 0 ? f.buffs[k].mult : 1);

/** smart: CPU が良い手を選ぶ確率 */
export function makeFighter({ name, icon = '', exp, stats, mult = 1, smart = 0.7 }) {
  const s = battleStats({ exp, stats }, mult);
  return {
    name, icon, level: s.level, maxHp: s.hp, hp: s.hp, maxMp: s.mp, mp: s.mp,
    base: { atk: s.atk, def: s.def, mag: s.mag, spd: s.spd, luk: s.luk },
    buffs: {}, skills: skillsFor(s.level), smart,
  };
}

/** a = 自分（操作する側）、b = 相手（自動で動く） */
export function newBattle(a, b) {
  a.side = 'a'; b.side = 'b';
  return { a, b, round: 1, over: false, winner: null };
}

function rawDmg(u, t, s) {
  if (s.type === 'mag') {
    const M = eff(u, 'mag'), R = (eff(t, 'def') + eff(t, 'mag')) / 2;
    return (M * s.power / 100) * (M / (M + R)) * 1.5;
  }
  const A = eff(u, 'atk'), D = eff(t, 'def') * (1 - (s.pierce || 0));
  return (A * s.power / 100) * (A / (A + D)) * 1.5;
}
const critRate = (u) => Math.min(0.25, 0.05 + eff(u, 'luk') * 0.002);
const evadeRate = (u, t) => Math.min(0.2, 0.03 + Math.max(0, eff(t, 'spd') - eff(u, 'spd')) / Math.max(1, eff(u, 'spd')) * 0.15);

export function findSkill(f, id) {
  return (id !== ATTACK.id && f.skills.find((s) => s.id === id)) || ATTACK;
}

/** CPU・相手プレイヤーの行動を選ぶ */
export function aiChoose(self, foe) {
  const usable = self.skills.filter((s) => s.mp <= self.mp);
  const smart = Math.random() < self.smart;
  const heals = usable.filter((s) => s.type === 'heal');
  if (heals.length && self.hp < self.maxHp * 0.35 && smart) return heals[heals.length - 1].id;
  const buffs = usable.filter((s) => s.type === 'buff' && !(self.buffs[s.stat] && self.buffs[s.stat].turns > 0));
  if (buffs.length && Math.random() < 0.15) return pick(buffs).id;
  const atks = [ATTACK, ...usable.filter((s) => s.type === 'phys' || s.type === 'mag')];
  if (!smart) return pick(atks).id;
  const score = (s) => rawDmg(self, foe, s) * (s.hits || 1);
  return atks.reduce((best, s) => (score(s) > score(best) ? s : best)).id;
}

function perform(user, target, skill, push) {
  if (skill.mp > user.mp) skill = ATTACK;
  user.mp -= skill.mp;
  push(`${user.name}の ${skill.icon}${skill.name}！`, 'use', user);
  if (skill.type === 'heal') {
    const heal = Math.min(Math.round(user.maxHp * skill.power / 100), user.maxHp - user.hp);
    user.hp += heal;
    push(`${user.name}の HPが ${heal} 回復した`, 'heal', user);
    return;
  }
  if (skill.type === 'buff') {
    user.buffs[skill.stat] = { mult: skill.mult, turns: skill.turns };
    push(`${user.name}の ${statInfo(skill.stat).name}が 上がった！`, 'buff', user);
    return;
  }
  for (let i = 0; i < (skill.hits || 1) && target.hp > 0; i++) {
    if (skill.type === 'phys' && Math.random() < evadeRate(user, target)) {
      push(`${target.name}は ひらりと かわした！`, 'miss', target);
      continue;
    }
    const crit = Math.random() < critRate(user);
    const dmg = Math.max(1, Math.round(rawDmg(user, target, skill) * rand(0.9, 1.1) * (crit ? 1.5 : 1)));
    target.hp = Math.max(0, target.hp - dmg);
    push(`${crit ? 'かいしんの いちげき！ ' : ''}${target.name}に ${dmg} のダメージ！`, crit ? 'crit' : 'hit', target);
  }
  if (target.hp <= 0) push(`${target.name}は たおれた…`, 'ko', target);
}

/**
 * 1ターン進める。actionId は自分の行動（スキルの id か 'attack'）。
 * 戻り値は画面に順番に出すイベント（その時点の HP・MP つき）。
 */
export function playRound(b, actionId) {
  const events = [];
  const push = (text, kind, f) => events.push({
    text, kind, side: f ? f.side : null, hp: { a: b.a.hp, b: b.b.hp }, mp: { a: b.a.mp, b: b.b.mp },
  });
  const acts = new Map([[b.a, findSkill(b.a, actionId)], [b.b, findSkill(b.b, aiChoose(b.b, b.a))]]);
  const first = eff(b.a, 'spd') * rand(0.85, 1.15) >= eff(b.b, 'spd') * rand(0.85, 1.15) ? b.a : b.b;
  for (const user of [first, first === b.a ? b.b : b.a]) {
    const target = user === b.a ? b.b : b.a;
    if (user.hp <= 0 || target.hp <= 0) continue;
    perform(user, target, acts.get(user), push);
    if (target.hp <= 0) { b.over = true; b.winner = user.side; }
  }
  if (b.over) return events;

  for (const f of [b.a, b.b]) {
    f.mp = Math.min(f.maxMp, f.mp + 2);
    Object.entries(f.buffs).forEach(([k, bf]) => {
      if (bf.turns > 0 && --bf.turns === 0) push(`${f.name}の ${statInfo(k).name}が もとにもどった`, 'info', f);
    });
  }
  b.round++;
  if (b.round > MAX_ROUNDS) {
    b.over = true;
    b.winner = b.a.hp / b.a.maxHp >= b.b.hp / b.b.maxHp ? 'a' : 'b';
    push(`時間切れ！ 残りHPの多い ${b[b.winner].name} の判定勝ち`, 'info', null);
  }
  return events;
}
