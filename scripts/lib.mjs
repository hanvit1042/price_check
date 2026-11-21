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
const ymdAge = (ymd, now) => {
  const s = String(ymd ?? ''); if (!/^\d{8}$/.test(s)) return null;
  return Math.floor((now + 9 * 3600e3 - Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`)) / 864e5);
};
/** opts.maxAgeDays: 조사일이 이보다 오래된 값은 '현재 시세'가 아니므로 버린다(기본 21일). opts.stats.dropped 에 버린 행 수를 센다 */
export function normalizeRecent(rows, { maxAgeDays = 21, now = Date.now(), stats = null } = {}) {
  if (!Array.isArray(rows)) throw new Error('recent/price 응답에 items 가 없습니다');
  const map = new Map();
  for (const r of rows) {
    if (String(r.ctgry_cd) === '500') continue; // 축산물은 일별(perDay) API 로 따로 받는다 (normalizeLivestock)
    const age = ymdAge(r.exmn_ymd, now);
    if (age == null || age > maxAgeDays) { if (stats) stats.dropped = (stats.dropped ?? 0) + 1; continue; }
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
    const it = map.get(id) ?? { id, name: r.item_nm, vrty: r.vrty_nm || '', display, category: r.ctgry_nm || '', base: cur.base, date: r.exmn_ymd };
    if (it.base !== cur.base) continue;
    const o = { pack: unit, date: r.exmn_ymd };
    for (const [k, pre] of PERIODS) o[k] = k === 'p' ? cur.price : conv(pre);
    it[kind] = o;
    map.set(id, it);
  }
  return [...map.values()].filter((i) => i.retail || i.wholesale);
}

/** 실시간 경매(경락) 행들 → 품목 전체 집계 + 품종(소분류)별 집계 (수량 가중 평균 단가) */
export function aggregateAuction(rows) {
  const groups = new Map();
  for (const r of rows) {
    const name = r.gds_mclsf_nm;
    const pb = perBase(r.scsbd_prc ?? r.sbid_pric, `${r.unit_qty ?? 1}${r.unit_nm ?? ''}`);
    const qty = num(r.qty) ?? 1;
    if (!name || !pb) continue;
    for (const sclsf of [null, r.gds_sclsf_nm || null]) {
      if (sclsf === null && groups.has(`${name}||${pb.base}`) === false) groups.set(`${name}||${pb.base}`, { name, sclsf: null, base: pb.base, w: 0, s: 0, min: Infinity, max: 0, n: 0, markets: new Set() });
      if (sclsf !== null && !groups.has(`${name}|${sclsf}|${pb.base}`)) groups.set(`${name}|${sclsf}|${pb.base}`, { name, sclsf, base: pb.base, w: 0, s: 0, min: Infinity, max: 0, n: 0, markets: new Set() });
      const a = groups.get(`${name}|${sclsf ?? ''}|${pb.base}`);
      a.w += qty; a.s += pb.price * qty; a.n += 1;
      a.min = Math.min(a.min, pb.price); a.max = Math.max(a.max, pb.price);
      if (r.whsl_mrkt_nm) a.markets.add(r.whsl_mrkt_nm);
    }
  }
  return [...groups.values()].sort((x, y) => (x.sclsf === null ? -1 : 0) - (y.sclsf === null ? -1 : 0)).map((a) => ({
    name: a.name, sclsf: a.sclsf, base: a.base, avg: Math.round(a.s / a.w), min: a.min, max: a.max, n: a.n, markets: [...a.markets].slice(0, 5),
  }));
}

const same = (a, b) => a.length >= 2 && b.length >= 2 && (a === b || a.includes(b) || b.includes(a));
/** 품종이 일치하는 경매 집계를 우선, 없으면 품목 전체 집계(scope:'item')를 붙인다 */
export function attachAuction(items, auctions, date) {
  for (const it of items) {
    const cands = auctions.filter((a) => a.name === it.name && a.base === it.base);
    const v = String(it.vrty ?? '').replace(/\s+/g, '');
    const hit = (v && v !== it.name && cands.find((a) => a.sclsf && same(a.sclsf.replace(/\s+/g, ''), v))) || null;
    const a = hit ?? cands.find((c) => c.sclsf === null);
    if (a) it.auction = { avg: a.avg, min: a.min, max: a.max, n: a.n, markets: a.markets, date, scope: hit ? 'variety' : 'item' };
  }
  return items;
}

/** 도매가가 소매가의 1.5배를 넘는 건 단위·집계 오류로 보고 도매가를 버린다 */
export function sanitize(items) {
  for (const it of items) if (it.retail && it.wholesale && it.wholesale.p > it.retail.p * 1.5) delete it.wholesale;
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

/** 일별 API 한 행의 기준단위 가격. 축산물은 kg환산가 항목이 쓸 수 없는 값(모든 행 동일)이라 가격÷단위로 직접 계산한다 */
export function rowPrice(r) {
  const unit = `${r.unit_sz ?? ''}${String(r.unit ?? '').replace(/^원\//, '')}`;
  if (String(r.ctgry_cd) === '500') {
    const p = num(r.exmn_dd_prc), u = parseUnit(unit);
    return p && u?.qty ? { per: p / u.qty, base: u.type, unit } : null;
  }
  const c = num(r.exmn_dd_cnvs_prc);
  return c ? { per: c, base: 'kg', unit } : null;
}

// 일별 API 축산물(부류 500) → 앱 품목. 품목코드별 이름·표시 규칙 (ord: 같은 이름 안에서 먼저 보일 순서)
const LIVE_RULES = {
  4301: (r) => ({ name: '쇠고기', vrty: `한우 ${r.vrty_nm}`, ord: r.vrty_cd === '22' && r.grd_cd === '2' ? 0 : 5 }), // 한우 등심 1+ 먼저
  4401: (r) => ({ name: '쇠고기', vrty: `수입 ${r.vrty_nm}`, ord: 8 }),
  4304: (r) => ({ name: '돼지고기', vrty: r.vrty_nm, ord: r.vrty_cd === '27' ? 0 : 3 }),                              // 삼겹살 먼저
  4402: () => ({ name: '돼지고기', vrty: '수입 삼겹살', ord: 6 }),
  9901: (r) => (r.vrty_cd === '99' ? { name: '닭고기', vrty: '육계', ord: 0 } : null),                                 // 육계 9~12호는 단위 표기가 일관되지 않아 제외
  9903: (r) => ({ name: '계란', vrty: r.vrty_nm, ord: r.vrty_cd === '23' && r.grd_cd === '1' ? 0 : 4 }),             // XL30구 일반란 먼저
  9908: () => ({ name: '우유', vrty: '흰우유', ord: 0 }),
};
export const LIVESTOCK_ITEMS = Object.keys(LIVE_RULES);
const DAY = 864e5, ymdMs = (s) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
const ms2ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/**
 * rows(일별 API, se_cd 01, 부류 500) → 앱 items[].
 * 날짜별 전국(조사 지역) 평균을 만들고, 지역 수가 충분한 가장 최근 날짜를 현재가로,
 * 1일/1주/1달 전은 그 날짜 기준으로 가장 가까운 이전 날짜 값을 쓴다.
 */
export function normalizeLivestock(rows, { now = Date.now(), maxAgeDays = 21, minCoverage = 0.6, stats = null } = {}) {
  const groups = new Map();
  for (const r of rows) {
    if (String(r.se_cd) !== '01' || String(r.ctgry_cd) !== '500') continue;
    const rule = LIVE_RULES[r.item_cd]?.(r); if (!rule) continue;
    const rp = rowPrice(r); const d = String(r.exmn_ymd ?? ''); if (!rp || !/^\d{8}$/.test(d)) continue;
    const id = `500:${r.item_cd}:${r.vrty_cd}:${r.grd_cd}`;
    const g = groups.get(id) ?? { id, rule, r, base: rp.base, unit: rp.unit, days: new Map() };
    const cell = g.days.get(d) ?? { s: 0, n: 0 }; cell.s += rp.per; cell.n += 1; g.days.set(d, cell);
    groups.set(id, g);
  }
  const out = [];
  for (const g of groups.values()) {
    const maxN = Math.max(...[...g.days.values()].map((c) => c.n));
    const ok = [...g.days.entries()].filter(([, c]) => c.n >= minCoverage * maxN).map(([d, c]) => [d, c.s / c.n]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (!ok.length) continue;
    const [last, cur] = ok.at(-1);
    const age = Math.floor((now + 9 * 3600e3 - ymdMs(last)) / DAY);
    if (age > maxAgeDays) { if (stats) stats.stale = (stats.stale ?? 0) + 1; continue; }
    const at = (back, tol) => { const t = ymdMs(last) - back * DAY; const hit = ok.filter(([d]) => ymdMs(d) <= t && ymdMs(d) >= t - tol * DAY).at(-1); return hit ? hit[1] : null; };
    const fix = (v) => (v == null ? null : g.base === 'kg' ? Math.round(v) : Math.round(v * 10) / 10);
    const { name, vrty, ord } = g.rule, grd = g.r.grd_nm && g.r.grd_nm !== g.r.vrty_nm ? ` ${g.r.grd_nm}` : '';
    out.push({
      id: g.id, name, vrty, display: `${name} (${vrty})${grd}`, category: '축산물', base: g.base, date: last, ord,
      retail: { p: fix(cur), d1: fix(at(1, 3)), w1: fix(at(7, 3)), m1: fix(at(30, 4)), y1: null, pack: g.unit, date: last },
    });
  }
  return out;
}
