// 일별 도,소매 가격정보(perDay/price) 행 → 지역별 소매가(kg당) 집계
import { rowPrice } from './lib.mjs';
import { median } from '../docs/regions.js';

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

/**
 * 소매 조사 시장 이름 → 채널. 'm' 전통시장·기타 소매시장, 'c' 마트·유통업체(대형마트·SSM·슈퍼·생협·"C-유통" 등 이름이 가려진 유통업체), null 은 비교에서 제외
 * (지역 합계 행, 직매장·온라인, 백화점·전문점은 마트와 가격대가 달라 제외)
 */
export function channelOf(r, mname = {}) {
  const n = String(r.mrkt_nm || mname[r.mrkt_cd] || '').trim();
  if (!n) return null;
  if (n === String(r.sgg_nm ?? '').trim()) return null;
  if (/직매장|온라인|직거래|백화점|전문점/.test(n)) return null;
  if (/대형마트|SSM|슈퍼|생협|유통|마트/.test(n)) return 'c';
  return 'm';
}

/**
 * rows → { id: { m:[중앙값, 건수], c:[중앙값, 건수], d:조사일 } } — 품목별 가장 최근 조사일부터 3일치에서 채널별 중앙값.
 * 두 채널 모두 표본이 5건 이상이고 가격비(마트/시장)가 0.5~2배일 때만 만든다(한쪽만 있거나 2배 넘게 벌어지면 단위 차이로 보고 제외).
 */
export function aggregateChannel(rows, validIds = null, mname = {}, { minN = 5, days = 3, minRatio = 0.5, maxRatio = 2 } = {}) {
  const by = new Map();
  for (const r of rows) {
    if (String(r.se_cd) !== '01') continue;
    const id = `${r.ctgry_cd}:${r.item_cd}:${r.vrty_cd}:${r.grd_cd}`;
    if (validIds && !validIds.has(id)) continue;
    const rp = rowPrice(r), ch = channelOf(r, mname), d = String(r.exmn_ymd ?? '');
    if (!rp || !ch || !/^\d{8}$/.test(d)) continue;
    if (rp.base !== (validIds instanceof Map ? validIds.get(id) : 'kg')) continue;
    if (!by.has(id)) by.set(id, []);
    by.get(id).push({ d, ch, p: rp.per });
  }
  const ms = (s) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
  const fix = (v, base) => (base === 'kg' ? Math.round(v) : Math.round(v * 10) / 10);
  const out = {};
  for (const [id, arr] of by) {
    const maxD = arr.reduce((m, x) => (x.d > m ? x.d : m), '');
    const win = arr.filter((x) => ms(x.d) >= ms(maxD) - (days - 1) * 864e5);
    const m = win.filter((x) => x.ch === 'm').map((x) => x.p), c = win.filter((x) => x.ch === 'c').map((x) => x.p);
    if (m.length < minN || c.length < minN) continue;
    const ratio = median(c) / median(m);
    if (!(ratio >= minRatio && ratio <= maxRatio)) continue; // 채널 간 2배 넘는 차이는 포장 단위·크기가 달라서 생긴 값으로 보고 신뢰하지 않음
    const base = validIds instanceof Map ? validIds.get(id) : 'kg';
    out[id] = { m: [fix(median(m), base), m.length], c: [fix(median(c), base), c.length], d: maxD };
  }
  return out;
}
