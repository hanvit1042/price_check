// 식약처 '조리식품의 레시피 DB'(COOKRCP01) CSV → 앱용 JSON 변환 (네트워크 없이 테스트 가능)

/** RFC4180 CSV 파서 (따옴표 안의 쉼표·줄바꿈·"" 처리, BOM 제거) */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** 시세 이름 → 재료 표기(끝말) 별칭. 한 글자 별칭은 마지막 단어와 '정확히' 같을 때만 인정 */
const OVERRIDE = {
  쌀: { a: ['쌀', '멥쌀', '백미'], x: /찹쌀|현미|발아|가루|파스타|국수|누룽지|떡|튀밥/ },
  찹쌀: { a: ['찹쌀'], x: /가루/ }, 현미: { a: ['현미'], x: /가루|녹차|차$/ }, 보리쌀: { a: ['보리쌀', '보리'] },
  파: { a: ['대파', '쪽파', '실파', '움파', '파'] }, 양파: { a: ['양파'] }, '깐마늘(국산)': { a: ['마늘', '깐마늘', '통마늘'], x: /종|쫑|가루|빵|소스|장아찌|엿/ },
  무: { a: ['알타리무', '총각무', '순무', '무우', '무'] }, 호박: { a: ['호박', '애호박', '단호박', '늙은호박', '쥬키니', '주키니'], x: /씨|잎|고지|죽/ },
  상추: { a: ['상추', '적상추', '청상추'] }, 풋고추: { a: ['풋고추', '청양고추', '청고추', '꽈리고추', '오이고추', '아삭이고추', '고추'], x: /붉은|홍|건고추|마른|가루|장|기름|잎/ },
  붉은고추: { a: ['붉은고추', '홍고추', '붉은풋고추'] }, 건고추: { a: ['건고추', '마른고추'] }, 고춧가루: { a: ['고춧가루', '고추가루'] },
  피망: { a: ['피망', '청피망', '붉은피망'] }, 토마토: { a: ['토마토'], x: /방울|대추/ }, 방울토마토: { a: ['방울토마토', '대추방울토마토'] },
  쇠고기: { a: ['쇠고기', '소고기', '한우'], x: /육수|국물|소스/ }, 물오징어: { a: ['오징어', '물오징어', '생오징어'], x: /마른|건/ }, 마른오징어: { a: ['마른오징어', '건오징어'] },
  명태: { a: ['명태', '생태', '동태', '코다리'] }, 북어: { a: ['북어', '황태', '북어채', '황태채'] }, 마른멸치: { a: ['멸치', '마른멸치', '잔멸치', '국물용멸치'] },
  새우: { a: ['새우', '칵테일새우', '대하', '중하', '흰다리새우'] }, 마른미역: { a: ['미역', '마른미역', '불린미역', '자른미역'] },
  건다시마: { a: ['다시마', '건다시마'] }, 김: { a: ['김', '구운김', '김밥김', '마른김', '조미김', '파래김'] }, 넙치: { a: ['광어', '넙치'] },
  감귤: { a: ['감귤', '귤'] }, 참다래: { a: ['참다래', '키위'] }, 키위: { a: ['키위', '참다래'] }, 단감: { a: ['단감'] },
  콩: { a: ['콩', '검은콩', '흰콩', '서리태', '대두', '메주콩'] }, 땅콩: { a: ['땅콩'], x: /버터|분태|가루/ }, 참깨: { a: ['참깨', '깨', '통깨', '볶음깨'] }, 들깨: { a: ['들깨'], x: /가루/ },
  느타리버섯: { a: ['느타리버섯', '느타리'] }, 팽이버섯: { a: ['팽이버섯', '팽이'] }, 새송이버섯: { a: ['새송이버섯', '새송이'] }, 우유: { a: ['우유'], x: /두유|코코넛/ },
  혼식곡: { a: ['혼식곡', '잡곡'] }, 메밀: { a: ['메밀'], x: /가루|국수|면/ },
};
const stripParen = (s) => s.replace(/\(.*$/, '').replace(/[0-9].*$/, '').trim();

/** 시세 품목 이름 목록 → 재료 한 줄을 시세 품목으로 바꾸는 함수 */
export function makeMatcher(names) {
  const rules = names.map((n) => ({ n, ...(OVERRIDE[n] ?? { a: [n.replace(/\(.*\)/, '')] }) })).map((r) => ({ ...r, a: r.a.filter(Boolean) }));
  return (rawName) => {
    const name = stripParen(rawName); if (!name) return null;
    const words = name.split(/\s+/), last = words[words.length - 1], flat = name.replace(/\s+/g, '');
    let best = null;
    for (const r of rules) {
      if (r.x && r.x.test(flat)) continue;
      for (const al of r.a) {
        const ok = al.length >= 2 ? (flat.endsWith(al) || last.endsWith(al)) : last === al;
        if (ok && (!best || al.length > best.len)) best = { n: r.n, len: al.length };
      }
    }
    return best?.n ?? null;
  };
}

/** 재료 텍스트 → [{name(시세 품목), g(합계 그램 or null)}] (그램 많은 순) */
export function extractIngredients(parts, match) {
  const acc = new Map();
  for (const tok of String(parts).replace(/●|•|·/g, '\n').split(/[\n,]/)) {
    const t = tok.trim(); if (!t) continue;
    const n = match(t); if (!n) continue;
    const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
    const g = m ? Number(m[1]) * (m[2].toLowerCase() === 'kg' ? 1000 : 1) : null;
    const cur = acc.get(n) ?? { name: n, g: null };
    if (g != null) cur.g = (cur.g ?? 0) + g;
    acc.set(n, cur);
  }
  return [...acc.values()].sort((a, b) => (b.g ?? 0) - (a.g ?? 0));
}

/** 만드는 법 문장 다듬기: 끝에 붙은 a,b,c 표시·앞의 "1." 번호 제거 */
export const cleanStep = (s) => String(s).replace(/\s*[a-z]$/, '').replace(/^\s*\d+\s*[.)]\s*/, '').trim();
export const httpsUrl = (u) => String(u || '').replace(/^http:\/\//, 'https://');
const num = (v) => { const n = Number(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

export function buildRecipes(rows, names) {
  const match = makeMatcher(names);
  const out = [];
  for (const r of rows) {
    const steps = []; for (let k = 1; k <= 20; k++) { const s = cleanStep(r['MANUAL' + String(k).padStart(2, '0')]); if (s) steps.push(s); }
    const parts = String(r.RCP_PARTS_DTLS).replace(/^재료\s*/, '').trim();
    if (!r.RCP_NM || !parts) continue;
    out.push({
      id: r.RCP_SEQ, n: r.RCP_NM.trim(), c: r.RCP_PAT2 || '기타', w: r.RCP_WAY2 || '', k: num(r.INFO_ENG), t: r.HASH_TAG?.trim() || '',
      i: httpsUrl(r.ATT_FILE_NO_MAIN), p: parts, s: steps, tip: (r.RCP_NA_TIP || '').trim(),
      m: extractIngredients(parts, match).map((x) => [x.name, x.g == null ? 0 : Math.round(x.g)]),
    });
  }
  return out;
}
