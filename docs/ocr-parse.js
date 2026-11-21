// 가격표 OCR 텍스트 → 품목/가격/수량/단위 추출 (순수 함수, 브라우저/Node 공용)
const UNIT_RE = '(kg|㎏|KG|Kg|g|㎎|근|관|개|구|포기|마리|단|속|봉|팩|입|L|ℓ)';
const UNIT_MAP = { '㎏': 'kg', KG: 'kg', Kg: 'kg', 'ℓ': 'L' };

// 가격표에서 흔히 쓰는 다른 이름
const ALIASES = { 파: ['대파', '쪽파'], 쇠고기: ['한우', '소고기'], 감귤: ['귤', '밀감'], '깐마늘(국산)': ['마늘'], 풋고추: ['청양고추'], 쌀: ['백미'] };

function clean(text) {
  return String(text ?? '')
    .replace(/[，,]/g, ',')
    .replace(/\d[Oo○]+|[Oo○]+\d/g, (m) => m.replace(/[Oo○]/g, '0')) // 숫자에 붙은 O → 0
    .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')        // "3 ,980" → "3,980"
    .replace(/(?<=\d)[Il|](?=[\d,])/g, '1')
    .replace(/[ \t]+/g, ' ');
}

export function parseTag(raw, items = []) {
  const text = clean(raw);
  const flat = text.replace(/\s+/g, '');

  // 가격: "N원" 우선, 없으면 천 단위 콤마 숫자
  const prices = [];
  const add = (v) => { if (v >= 100 && v <= 5_000_000 && !prices.includes(v)) prices.push(v); };
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d{3,7})\s*원/g)) add(Number(m[1].replace(/,/g, '')));
  if (!prices.length) for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{3})+)\b/g)) add(Number(m[1].replace(/,/g, '')));
  // 행사가가 있는 경우가 많아 낮은 값을 첫 후보로
  prices.sort((a, b) => a - b);

  // 수량/단위
  let qty = null, unit = null, perUnit = false;
  const um = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}\\s*(당)?`));
  if (um) {
    qty = Number(um[1]); unit = UNIT_MAP[um[2]] ?? um[2];
    if (unit === 'g') { qty /= 1000; unit = 'kg'; }
    perUnit = !!um[3];
  }

  // 품목: 품목 이름(품종 이름은 쓰지 않음: "국산" "수입" 같은 말에 잘못 걸림)이 텍스트에 있는지. 긴 이름 우선
  const byName = new Map();
  for (const it of items) { if (!byName.has(it.name)) byName.set(it.name, []); byName.get(it.name).push(it); }
  const cands = [];
  for (const [name, arr] of byName) {
    const keys = [[name, 0], [name.replace(/\(.*?\)/g, ''), 0], ...(ALIASES[name] ?? []).map((x) => [x, 0.5])];
    let best = 0;
    for (const [k, pen] of keys) if (k.length >= 2 && flat.includes(k)) best = Math.max(best, k.length - pen);
    if (!best) continue;
    // 같은 품목 안에서는 가격표에 적힌 품종(예: 햇양파)과 맞는 것을 우선
    const rep = arr.find((i) => i.vrty && i.vrty !== name && flat.includes(i.vrty.replace(/\s+/g, ''))) ?? arr[0];
    cands.push({ item: rep, score: best });
  }
  cands.sort((x, y) => y.score - x.score);
  return { prices, qty, unit, perUnit, matches: cands.slice(0, 5).map((c) => c.item) };
}
