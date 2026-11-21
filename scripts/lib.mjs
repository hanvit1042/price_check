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

/**
 * 공공데이터포털 '최근일자 도,소매가격정보'(recent/price) 응답 items[] → 앱 items[]
 *  se_cd 01=소매, 02=중도매.  exmn_dd_*=조사일, dd1=1일전, ww1=1주전, mm1=1개월전, yy1=1년전
 *  *_cnvs_prc 는 kg 환산가. 없으면 (단위크기+단위) 로 기준단위 환산한다.
 */
const PERIODS = [['p', 'exmn_dd'], ['d1', 'dd1_bfr'], ['w1', 'ww1_bfr'], ['m1', 'mm1_bfr'], ['y1', 'yy1_bfr']];
export function normalizeRecent(rows) {
  if (!Array.isArray(rows)) throw new Error('recent/price 응답에 items 가 없습니다');
  const map = new Map();
  for (const r of rows) {
    const kind = String(r.se_cd) === '01' ? 'retail' : String(r.se_cd) === '02' ? 'wholesale' : null;
    if (!kind) continue;
    const unit = `${r.unit_sz ?? ''}${String(r.unit ?? '').replace(/^원\//, '')}`;
    const cnvs = num(r.exmn_dd_cnvs_prc);
    // 현재가를 kg 환산가로 쓸 수 있으면 모든 기간을 kg 환산가로, 아니면 포장단위 환산
    const useCnvs = !!cnvs;
    const get = (pre) => {
      if (useCnvs) return num(r[`${pre}_cnvs_prc`]);
      return perBase(r[`${pre}_prc`], unit);
    };
    const cur = useCnvs ? { price: Math.round(cnvs), base: 'kg' } : perBase(r.exmn_dd_prc, unit);
    if (!cur) continue;
    const conv = (pre) => { const v = get(pre); const n = v && typeof v === 'object' ? v.price : v; return n ? Math.round(n) : null; };
    const vr = r.vrty_nm && r.vrty_nm !== r.item_nm ? ` (${r.vrty_nm})` : '';
    const display = `${r.item_nm}${vr}${r.grd_nm ? ` ${r.grd_nm}` : ''}`;
    const id = `${r.ctgry_cd}:${r.item_cd}:${r.vrty_cd}:${r.grd_cd}`;
    const it = map.get(id) ?? { id, name: r.item_nm, display, category: r.ctgry_nm || '', base: cur.base, date: r.exmn_ymd };
    if (it.base !== cur.base) continue;
    const o = { pack: unit, date: r.exmn_ymd };
    for (const [k, pre] of PERIODS) o[k] = k === 'p' ? cur.price : conv(pre);
    it[kind] = o;
    map.set(id, it);
  }
  return [...map.values()].filter((i) => i.retail || i.wholesale);
}

/** 실시간 경매(경락) 행들 → 품목명별 집계 (수량 가중 평균 단가) */
export function aggregateAuction(rows) {
  const g = new Map();
  for (const r of rows) {
    const name = r.gds_mclsf_nm;
    const pb = perBase(r.scsbd_prc ?? r.sbid_pric, `${r.unit_qty ?? 1}${r.unit_nm ?? ''}`);
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

/** 공공데이터포털 성공 응답 판정: resultCode 가 00/0 이거나 메시지가 정상(NORMAL) 이면 성공 */
export function isOkHeader(h) {
  if (!h || h.resultCode === undefined || h.resultCode === null) return true;
  const c = String(h.resultCode).trim();
  return /^0+$/.test(c) || /정상|NORMAL/i.test(String(h.resultMsg ?? ''));
}
