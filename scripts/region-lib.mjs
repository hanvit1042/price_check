// 일별 도,소매 가격정보(perDay/price) 행 → 지역별 소매가(kg당) 집계
import { num } from './lib.mjs';

/** latest.json 의 item id("부류:품목:품종:등급") → 부류·품목 코드 쌍 목록(소매가가 있는 것만) */
export function itemKeys(items) {
  const set = new Map();
  for (const it of items) {
    if (!it.retail || it.base !== 'kg') continue;
    const [ctgry, item] = String(it.id).split(':');
    if (ctgry && item) set.set(`${ctgry}:${item}`, { ctgry, item });
  }
  return [...set.values()];
}

/**
 * rows → { id: { 시군구코드: 원/kg } } — (품목·시군구)마다 가장 최근 조사일의 시장별 가격 평균.
 * kg 환산가(exmn_dd_cnvs_prc)만 사용한다(포기·개 단위 품목은 지역 비교에서 제외).
 */
export function aggregateRegion(rows, validIds = null) {
  const acc = new Map();
  for (const r of rows) {
    if (String(r.se_cd) !== '01') continue;
    const id = `${r.ctgry_cd}:${r.item_cd}:${r.vrty_cd}:${r.grd_cd}`;
    if (validIds && !validIds.has(id)) continue;
    const p = num(r.exmn_dd_cnvs_prc); if (!p || !r.sgg_cd) continue;
    const k = `${id}|${r.sgg_cd}`, d = String(r.exmn_ymd);
    const cur = acc.get(k);
    if (!cur || d > cur.d) acc.set(k, { id, sgg: String(r.sgg_cd), d, ps: [p] });
    else if (d === cur.d) cur.ps.push(p);
  }
  const prices = {};
  for (const { id, sgg, ps } of acc.values()) (prices[id] ??= {})[sgg] = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
  return prices;
}
