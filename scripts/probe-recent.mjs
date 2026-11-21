// 진단용: 일별(perDay) 소매가가 '유통 채널별(전통시장·대형마트·SSM…)'로 나뉘는지, 채널 간 실제 가격 차이는 얼마인지 (인증키는 출력하지 않음)
import { readFileSync } from 'node:fs';
let key = process.env.DATA_GO_KR_KEY; if (key?.includes('%')) key = decodeURIComponent(key);
if (!key) { console.error('DATA_GO_KR_KEY 없음'); process.exit(1); }
const codes = JSON.parse(readFileSync(new URL('./item-codes.json', import.meta.url), 'utf8'));
const markets = JSON.parse(readFileSync(new URL('./market-codes.json', import.meta.url), 'utf8'));
const mname = Object.fromEntries(markets.map((m) => [m.code, m.name]));
const chan = (n) => (!n ? '(시장명 없음)' : /대형마트/.test(n) ? '대형마트' : /SSM/.test(n) ? 'SSM' : /백화점/.test(n) ? '백화점' : /슈퍼/.test(n) ? '슈퍼마켓' : /생협/.test(n) ? '생협' : /전문점/.test(n) ? '전문점' : /유통/.test(n) ? '유통업체(기타)' : '전통시장·기타');
const per = 'https://apis.data.go.kr/B552845/perDay/price';
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const now = Date.now();
const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
const num = (v) => Number(String(v).replace(/,/g, ''));
const targets = ['양파', '배추', '감자', '오이', '당근', '쌀', '사과', '딸기', '고등어', '무'];
const ratios = {};
for (const name of targets) {
  const c = codes.find((x) => x.name === name); if (!c) { console.log(`## ${name}: 코드 없음`); continue; }
  const rows = [];
  for (let page = 1; page <= 6; page++) {
    const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: '1000', returnType: 'json', 'cond[exmn_ymd::GTE]': ymd(now - 7 * 864e5), 'cond[exmn_ymd::LTE]': ymd(now), 'cond[se_cd::EQ]': '01', 'cond[ctgry_cd::EQ]': c.ctgry, 'cond[item_cd::EQ]': c.item });
    const j = await (await fetch(`${per}?${q}`, { signal: AbortSignal.timeout(40000) })).json();
    const b = j?.response?.body; let it = b?.items?.item ?? b?.items ?? []; if (!Array.isArray(it)) it = it ? [it] : [];
    rows.push(...it); if (rows.length >= Number(b?.totalCount ?? 0) || it.length < 1000) break;
  }
  // 대표 품종·등급 하나만(가장 행이 많은 것)
  const cnt = {}; rows.forEach((r) => { const k = `${r.vrty_cd}|${r.grd_cd}`; cnt[k] = (cnt[k] ?? 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0]; if (!top) { console.log(`## ${name}: 자료 없음`); continue; }
  const sel = rows.filter((r) => `${r.vrty_cd}|${r.grd_cd}` === top);
  const by = {}; const names = {};
  for (const r of sel) { const ch = chan(r.mrkt_nm || mname[r.mrkt_cd]); (by[ch] ??= []).push(num(r.exmn_dd_cnvs_prc)); (names[ch] ??= new Set()).add(r.mrkt_nm || mname[r.mrkt_cd] || r.mrkt_cd); }
  const base = med(by['전통시장·기타'] ?? []);
  const line = Object.entries(by).map(([ch, v]) => `${ch} ${Math.round(med(v))}원(${v.length}건${base ? ', 시장대비 ' + (med(v) / base * 100 - 100 >= 0 ? '+' : '') + (med(v) / base * 100 - 100).toFixed(0) + '%' : ''})`).join(' | ');
  const f = sel[0];
  console.log(`## ${name} [${f.vrty_nm}/${f.grd_nm}, ${f.unit_sz}${f.unit}] 행${sel.length}: ${line}`);
  for (const [ch, v] of Object.entries(by)) if (base && ch !== '전통시장·기타') (ratios[ch] ??= []).push(med(v) / base);
  console.log('   시장명 예:', Object.entries(names).map(([ch, s]) => `${ch}: ${[...s].slice(0, 4).join(',')}`).join(' / '));
}
console.log('\n## 채널별 시장 대비 가격비 (품목 중앙값들의 중앙값):', Object.entries(ratios).map(([ch, v]) => `${ch} ${(med(v)).toFixed(2)} (품목 ${v.length}개)`).join(' | '));
