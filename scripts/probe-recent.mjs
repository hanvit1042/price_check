// 진단용: 앱에 없는 품목(공식 품목코드표 기준)이 일별(perDay) API 에 최근 자료가 있는지 확인 (인증키는 출력하지 않음)
import { readFileSync } from 'node:fs';
let key = process.env.DATA_GO_KR_KEY; if (key?.includes('%')) key = decodeURIComponent(key);
if (!key) { console.error('DATA_GO_KR_KEY 없음'); process.exit(1); }
const codes = JSON.parse(readFileSync(new URL('./item-codes.json', import.meta.url), 'utf8'));
const have = new Set(JSON.parse(readFileSync(new URL('../docs/data/latest.json', import.meta.url), 'utf8')).items.map((i) => i.name));
const FLOWERS = new Set(['안개꽃', '장미', '글라디올러스', '거베라', '백합', '국화', '카네이션', '튜울립']);
const per = 'https://apis.data.go.kr/B552845/perDay/price';
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const now = Date.now();
const miss = codes.filter((c) => !have.has(c.name) && !FLOWERS.has(c.name));
console.log(`앱에 없는 품목 ${miss.length}개 — 일별 API 최근 10일 자료`);
for (const c of miss) {
  const res = {};
  for (const se of ['01', '02']) {
    try {
      const q = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '1000', returnType: 'json', 'cond[exmn_ymd::GTE]': ymd(now - 10 * 864e5), 'cond[exmn_ymd::LTE]': ymd(now), 'cond[se_cd::EQ]': se, 'cond[ctgry_cd::EQ]': c.ctgry, 'cond[item_cd::EQ]': c.item });
      const j = await (await fetch(`${per}?${q}`, { signal: AbortSignal.timeout(40000) })).json();
      const b = j?.response?.body; let it = b?.items?.item ?? b?.items ?? []; if (!Array.isArray(it)) it = it ? [it] : [];
      const max = it.reduce((m, x) => (String(x.exmn_ymd) > m ? String(x.exmn_ymd) : m), '');
      const kinds = [...new Set(it.map((x) => `${x.vrty_nm}${x.grd_nm ? '/' + x.grd_nm : ''}`))].slice(0, 3).join(',');
      res[se] = `${b?.totalCount ?? 0}행${max ? ' ~' + max.slice(4) : ''}${kinds ? ' [' + kinds + ']' : ''}`;
    } catch (e) { res[se] = '오류'; }
  }
  console.log(`${c.ctgry}:${c.item} ${c.name.padEnd(10)} 소매 ${res['01']} | 중도매 ${res['02']}`);
}
