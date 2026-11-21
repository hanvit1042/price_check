// 식약처 레시피 DB 기반 "오늘의 메뉴" 추천: 값이 내린 재료를 많이 쓰는 요리를 고른다
import { inSeason } from './season.js';
export const CATS = [['all', '전체'], ['반찬', '반찬'], ['국&찌개', '국·찌개'], ['밥', '밥'], ['일품', '일품'], ['후식', '후식']];
const MAIN = 50; // 이 양(g) 이상 들어간 재료만 "주재료"로 보고 가격 변화를 반영
const sig = (d) => (d ? Math.max(-20, Math.min(20, -d.chg)) : 0); // 싸질수록 +

/**
 * recipes: recipes.json 의 목록, dealMap: Map(품목 → {chg,since}), have: 시세 있는 품목 Set
 * filter: 'all'(반찬·국·밥. 일품·후식은 따로 선택) | 분류명, seed: 날짜 등 (같은 날은 같은 순서), limit/perReason: 목록 길이와 같은 재료 중복 상한
 */
export function suggestMenus(recipes, dealMap, have, month, { filter = 'all', seed = 0, limit = 12, perReason = 2 } = {}) {
  const scored = [];
  for (const r of recipes) {
    if (filter === 'all' ? !['반찬', '국&찌개', '밥'].includes(r.c) : r.c !== filter) continue;
    if (r.s.length < 2) continue;
    const tr = r.m.filter(([n]) => have.has(n)).map(([name, g]) => ({ name, g, w: g > 0 ? g : 10, d: dealMap.get(name) }));
    if (!tr.length) continue;
    const top = tr.reduce((a, b) => (b.g > a.g ? b : a));
    if (top.d && top.d.chg >= 5) continue; // 가장 많이 쓰는 재료가 오르는 중이면 제외
    const totalW = tr.reduce((s, x) => s + x.w, 0);
    const weighted = tr.reduce((s, x) => s + x.w * sig(x.d), 0) / totalW;
    const drops = tr.filter((x) => x.g >= MAIN && x.d && x.d.chg <= -3);
    const seasonal = tr.filter((x) => x.g >= MAIN && inSeason(x.name, month));
    if (!drops.length && !seasonal.length) continue; // 눈에 띄는 게 없으면 추천하지 않음
    const best = drops.sort((a, b) => b.w * -b.d.chg - a.w * -a.d.chg)[0];
    const score = (best ? Math.min(40, -best.d.chg) * 1.2 : 0) + weighted + seasonal.length * 3 + ((seed * 31 + (parseInt(r.id, 10) || 0)) % 7) * 0.3;
    const reason = best ? { type: 'down', name: best.name, pct: -best.d.chg, since: best.d.since } : { type: 'season', name: seasonal[0].name };
    scored.push({ r, score, reason, tr: tr.sort((a, b) => b.g - a.g) });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [], used = {};
  for (const s of scored) {
    const k = s.reason.name;
    if ((used[k] ?? 0) >= perReason) continue;
    used[k] = (used[k] ?? 0) + 1; out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
