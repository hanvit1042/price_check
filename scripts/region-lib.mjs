// 일별 도,소매 가격정보(perDay/price) 행 → 지역별 소매가(kg당) 집계
import { rowPrice } from './lib.mjs';

/** latest.json 의 item id("부류:품목:품종:등급") → 부류·품목 코드 쌍 목록(소매가가 있는 것만) */
export function itemKeys(items) {
  const set = new Map();
  for (const it of items) {
    if (!it.retail) continue;
    const [ctgry0] = String(it.id).split(':');
    if (it.base !== 'kg' && ctgry0 !== '500') continue; // 포기·개 단위 농산물은 kg환산가가 없어 지역 비교 제외 (축산물은 가격÷단위로 계산)
    const [ctgry, item] = String(it.id).split(':');
    if (ctgry && item) set.set(`${ctgry}:${item}`, { ctgry, item });
  }
  return [...set.values()];
}

/**
 * rows → { id: { 시군구코드: 기준단위(kg·구·L)당 가격 } } — (품목·시군구)마다 가장 최근 조사일의 시장별 가격 평균.
 * validIds: Set(kg 품목만) 또는 Map(id → 기준단위). 농산물은 kg환산가, 축산물은 가격÷단위를 쓴다.
 */
export function aggregateRegion(rows, validIds = null) {
  const acc = new Map();
  for (const r of rows) {
    if (String(r.se_cd) !== '01') continue;
    const id = `${r.ctgry_cd}:${r.item_cd}:${r.vrty_cd}:${r.grd_cd}`;
    if (validIds && !validIds.has(id)) continue;
    const rp = rowPrice(r); if (!rp || !r.sgg_cd) continue;
    if (rp.base !== (validIds instanceof Map ? validIds.get(id) : 'kg')) continue;
    const p = rp.per;
    const k = `${id}|${r.sgg_cd}`, d = String(r.exmn_ymd);
    const cur = acc.get(k);
    if (!cur || d > cur.d) acc.set(k, { id, sgg: String(r.sgg_cd), d, ps: [p] });
    else if (d === cur.d) cur.ps.push(p);
  }
  const prices = {};
  for (const { id, sgg, ps } of acc.values()) (prices[id] ??= {})[sgg] = Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 10) / 10;
  return prices;
}
