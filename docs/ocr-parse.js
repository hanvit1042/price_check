// 가격표 OCR 텍스트 → 품목/가격/수량/단위 추출 (순수 함수, 브라우저/Node 공용)
const UNIT_RE = '(kg|㎏|KG|Kg|g|㎎|근|관|개|구|포기|마리|단|속|봉|팩|입|L|ℓ)';
const UNIT_MAP = { '㎏': 'kg', KG: 'kg', Kg: 'kg', 'ℓ': 'L' };

// 가격표에서 흔히 쓰는 다른 이름
const ALIASES = {
  파: ['대파', '쪽파'], 쇠고기: ['한우', '소고기', '등심', '안심', '채끝', '양지', '설도'], 감귤: ['귤', '밀감'], '깐마늘(국산)': ['마늘'], 풋고추: ['청양고추'], 쌀: ['백미'],
  돼지고기: ['삼겹살', '목살', '목심', '앞다리', '돼지갈비', '돼지'], 닭고기: ['닭가슴살', '닭다리', '생닭', '통닭', '육계'], 계란: ['달걀', '특란', '왕란', '대란', '유정란'], 우유: ['흰우유'],
};

function clean(text) {
  return String(text ?? '')
    .replace(/[，,]/g, ',')
    .replace(/\d[Oo○]+|[Oo○]+\d/g, (m) => m.replace(/[Oo○]/g, '0')) // 숫자에 붙은 O → 0
    .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')        // "3 ,980" → "3,980"
    .replace(/(?<=\d)[Il|](?=[\d,])/g, '1')
    // 단위 글자 오인식: g→8 ("1008당"→"100g당"), kg→"k9/kq"·"+8" ("1.5+8"→"1.5kg")
    .replace(/(\d)\s*[kK][gqQ9]\b/g, '$1kg')
    .replace(/(\d)\s*\+\s*8(?![\d,])/g, '$1kg')
    .replace(/(?<![\d,.])([1-9]00)8(?![\d,]|\s*원)/g, '$1g')
    .replace(/(?<![\d,.])([1-9]\d0)8(?=\s*(?:\/|당|팩|봉|개|입|구|통))/g, '$1g') // 750g/팩 → "7508/팩" (뒤에 단위 표기가 붙은 경우만)
    .replace(/[ \t]+/g, ' ');
}

// 글자 하나가 틀려도(오타·오인식, 예: 방물토마토) 찾기 위한 비교: 4글자 이상 이름만 한 글자 차이 허용
function lev1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
/** 2: 그대로 포함, 1: 한 글자 차이로 포함, 0: 없음 */
function fuzzyIn(flat, key) {
  if (flat.includes(key)) return 2;
  if (key.length < 4) return 0;
  for (let w = key.length - 1; w <= key.length + 1; w++) for (let i = 0; i + w <= flat.length; i++) if (lev1(flat.substr(i, w), key)) return 1;
  return 0;
}
const WEIGHT_KG = { kg: 1, g: 0.001 };

export function parseTag(raw, items = []) {
  let text = clean(raw);

  // "100g당 1,197원" 같은 단가는 총 가격이 아니므로 따로 빼 둔다
  const unitPrices = [];
  text = text.replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}\\s*당\\s*(\\d{1,3}(?:,\\d{3})+|\\d{3,7})\\s*원?`, 'g'), (_, q, u, p) => {
    unitPrices.push({ q: Number(q), u: UNIT_MAP[u] ?? u, p: Number(p.replace(/,/g, '')) }); return ' ';
  });
  const flat = text.replace(/\s+/g, '');

  // 총 가격 후보: "N원" 과 천 단위 콤마 숫자(원이 없는 전자 가격표). 단위 글자가 붙은 숫자는 제외
  const prices = [];
  const add = (v) => { if (v >= 100 && v <= 5_000_000 && !prices.includes(v)) prices.push(v); };
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d{3,7})\s*원/g)) add(Number(m[1].replace(/,/g, '')));
  for (const m of text.matchAll(/(?<![\d,.])(\d{1,3}(?:,\d{3})+)(?![\d,]|\s*(?:kg|g|ml|L|㎏))/g)) add(Number(m[1].replace(/,/g, '')));
  if (!prices.length) for (const m of text.matchAll(/(?<![\d,.])([1-9]\d{3,5})(?![\d,.]|\s*(?:kg|g|ml|L|㎏|원))/g)) add(Number(m[1])); // 콤마·원 없이 8980 처럼 적힌 경우(바코드 등 0으로 시작하는 번호는 제외)
  prices.sort((a, b) => a - b); // 행사가가 있는 경우가 많아 낮은 값을 먼저

  // 수량/단위: 단가 표기("100g당")를 뺀 나머지에서 포장 수량(예: 750g/팩)을 찾고, 없으면 단가의 기준 수량을 쓴다
  let qty = null, unit = null, perUnit = false;
  const um = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}`));
  const toBase = (q, u) => (u === 'g' ? [q / 1000, 'kg'] : [q, u]);
  if (um) { [qty, unit] = toBase(Number(um[1]), UNIT_MAP[um[2]] ?? um[2]); }
  else if (unitPrices[0]) { [qty, unit] = toBase(unitPrices[0].q, unitPrices[0].u); perUnit = true; }

  // 단가 × 포장 수량으로 총 가격을 검산: 가장 가까운 후보(±10%)를 먼저. 후보가 없으면 계산값을 추정 후보로 쓴다
  let priceEstimated = false;
  const up = unitPrices[0];
  if (up && qty && !perUnit) {
    const [uq, uu] = toBase(up.q, up.u);
    if (uu === unit) {
      const expected = (up.p * qty) / uq;
      const near = prices.filter((x) => Math.abs(x - expected) / expected <= 0.1).sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected))[0];
      if (near != null) { prices.splice(prices.indexOf(near), 1); prices.unshift(near); }
      else if (!prices.length) { prices.push(Math.round(expected / 10) * 10); priceEstimated = true; }
    }
  }
  if (!prices.length && up) prices.push(up.p); // 단가만 있는 가격표(예: 100g당 9,800원)

  // 품목: 품목 이름(품종 이름은 쓰지 않음: "국산" "수입" 같은 말에 잘못 걸림)이 텍스트에 있는지. 긴 이름 우선
  const byName = new Map();
  for (const it of items) { if (!byName.has(it.name)) byName.set(it.name, []); byName.get(it.name).push(it); }
  const cands = [];
  for (const [name, arr] of byName) {
    const keys = [[name, 0], [name.replace(/\(.*?\)/g, ''), 0], ...(ALIASES[name] ?? []).map((x) => [x, 0.5])];
    let best = 0;
    for (const [k, pen] of keys) { if (k.length < 2) continue; const f = fuzzyIn(flat, k); if (f) best = Math.max(best, k.length - pen - (f === 1 ? 0.3 : 0)); }
    if (!best) continue;
    // 같은 품목 안에서는 가격표에 적힌 품종·등급(예: 대추방울토마토, 한우 등심 1+등급)과 가장 많이 맞는 것을 고른다
    const score = (i) => String(i.display ?? '').replace(name, '').replace(/[()]/g, ' ').split(/\s+/).filter((w) => w.length >= 2).reduce((n, w) => n + (fuzzyIn(flat, w) === 2 ? 1 : fuzzyIn(flat, w) === 1 ? 0.9 : 0), 0);
    const rep = arr.reduce((b, i) => (score(i) > score(b) ? i : b), arr[0]);
    cands.push({ item: rep, score: best });
  }
  cands.sort((x, y) => y.score - x.score);
  return { prices, qty, unit, perUnit, priceEstimated, unitPrice: up ?? null, matches: cands.slice(0, 5).map((c) => c.item) };
}

/** 읽은 결과의 쓸모: 품목(3) + 가격(3) + 수량(1), 추정 가격이면 -1. 최대 7 */
export const tagScore = (r) => (r.matches.length ? 3 : 0) + (r.prices.length ? 3 : 0) + (r.qty ? 1 : 0) - (r.priceEstimated ? 1 : 0);
/** 품목·가격·수량을 모두 찾았고 가격이 추정이 아님 */
export const tagComplete = (r) => !!(r.matches.length && r.prices.length && r.qty && !r.priceEstimated);
