// 공공데이터 응답 → 앱 데이터 변환 로직 (네트워크 없이 테스트 가능하도록 분리)

const WEIGHT = { kg: 1, g: 0.001, 근: 0.6, 관: 3.75, 톤: 1000 };
const COUNT = ['개', '구', '포기', '마리', '단', '속', '판', '송이', '갑', '병', '봉', '통', '묶음', 'L', 'ml'];

export const num = (v) => {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[,\s원]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "20kg" "10개" "1포기" "100g" → {qty, type} (type: 'kg' | 개수단위) */
export function parseUnit(unit) {
  const m = String(unit ?? '').trim().match(/^(\d+(?:[.,]\d+)?)?\s*([A-Za-z가-힣]+)/);
  if (!m) return null;
  const qty = m[1] ? Number(m[1].replace(',', '.')) : 1;
  const u = m[2];
  if (u in WEIGHT) return { qty: qty * WEIGHT[u], type: 'kg' };
  if (u === 'L' || u === '리터') return { qty, type: 'L' };
  if (u === 'ml' || u === 'mL') return { qty: qty / 1000, type: 'L' };
  const c = COUNT.find((x) => u.startsWith(x));
  if (c) return { qty, type: c };
  return null;
}

/** 포장단위 가격 → 기준단위(kg 또는 개수단위) 가격 */
export function perBase(price, unit) {
  const p = num(price);
  const u = parseUnit(unit);
  if (!p || !u || !u.qty) return null;
  return { price: Math.round(p / u.qty), base: u.type };
}

const pick = (v) => num(v);

/**
 * KAMIS dailySalesList 응답(json) → items[]
 * product_cls_code 01=소매, 02=도매. dpr1=당일, dpr2=1일전, dpr3=1개월전, dpr4=1년전
 */
export function normalizeKamis(json) {
  const rows = json?.data?.item;
  if (!Array.isArray(rows)) throw new Error('KAMIS 응답에 data.item 이 없습니다: ' + JSON.stringify(json).slice(0, 200));
  const map = new Map();
  for (const r of rows) {
    const cls = String(r.product_cls_code);
    const kind = cls === '01' ? 'retail' : cls === '02' ? 'wholesale' : null;
    if (!kind) continue;
    const name = r.item_name || String(r.productName || '').split('/')[0];
    const display = r.productName || name;
    const cur = perBase(r.dpr1, r.unit);
    if (!cur) continue;
    const id = `${r.category_code}:${display}`;
    const it = map.get(id) ?? { id, name, display, category: r.category_name || '', base: cur.base };
    if (it.base !== cur.base) continue;
    const conv = (v) => perBase(v, r.unit)?.price ?? null;
    it[kind] = { p: cur.price, d1: conv(r.dpr2), m1: conv(r.dpr3), y1: conv(r.dpr4), pack: r.unit, packPrice: pick(r.dpr1) };
    map.set(id, it);
  }
  return [...map.values()].filter((i) => i.retail || i.wholesale);
}

/** 실시간 경매(경락) 행들 → 품목명별 집계 (수량 가중 평균 단가) */
export function aggregateAuction(rows) {
  const g = new Map();
  for (const r of rows) {
    const name = r.gds_mclsf_nm;
    const pb = perBase(r.sbid_pric, `${r.unit_qty ?? 1}${r.unit_nm ?? ''}`);
    const qty = num(r.qty) ?? 1;
    if (!name || !pb) continue;
    const key = `${name}|${pb.base}`;
    const a = g.get(key) ?? { name, base: pb.base, w: 0, s: 0, min: Infinity, max: 0, n: 0, markets: new Set() };
    a.w += qty; a.s += pb.price * qty; a.n += 1;
    a.min = Math.min(a.min, pb.price); a.max = Math.max(a.max, pb.price);
    if (r.whsl_mrkt_nm) a.markets.add(r.whsl_mrkt_nm);
    g.set(key, a);
  }
  return [...g.values()].map((a) => ({
    name: a.name, base: a.base, avg: Math.round(a.s / a.w), min: a.min, max: a.max, n: a.n, markets: [...a.markets].slice(0, 5),
  }));
}

export function attachAuction(items, auctions, date) {
  const by = new Map(auctions.map((a) => [`${a.name}|${a.base}`, a]));
  for (const it of items) {
    const a = by.get(`${it.name}|${it.base}`);
    if (a) it.auction = { avg: a.avg, min: a.min, max: a.max, n: a.n, markets: a.markets, date };
  }
  return items;
}

/** history: { id: [[date, retail, wholesale], ...] } */
export function updateHistory(history, items, date, keep = 400) {
  for (const it of items) {
    const arr = (history[it.id] ??= []);
    const row = [date, it.retail?.p ?? null, it.wholesale?.p ?? null];
    const i = arr.findIndex((x) => x[0] === date);
    if (i >= 0) arr[i] = row; else arr.push(row);
    arr.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (arr.length > keep) arr.splice(0, arr.length - keep);
  }
  return history;
}
