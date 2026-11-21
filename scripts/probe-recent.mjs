// 진단용: 최근일자 도,소매가격정보 API 의 원본 응답에서 부류별 개수와 축산물(500) 행을 출력한다 (인증키는 출력하지 않음)
let key = process.env.DATA_GO_KR_KEY; if (key?.includes('%')) key = decodeURIComponent(key);
if (!key) { console.error('DATA_GO_KR_KEY 없음'); process.exit(1); }
const base = 'https://apis.data.go.kr/B552845/recent/price';
async function page(extra, n = 1) {
  const q = new URLSearchParams({ serviceKey: key, pageNo: String(n), numOfRows: '1000', returnType: 'json', ...extra });
  const j = await (await fetch(`${base}?${q}`, { signal: AbortSignal.timeout(40000) })).json();
  const b = j?.response?.body; let it = b?.items?.item ?? b?.items ?? []; if (!Array.isArray(it)) it = it ? [it] : [];
  return { total: Number(b?.totalCount ?? 0), items: it, header: j?.response?.header };
}
for (const se of ['01', '02']) {
  const all = []; let total = 0;
  for (let n = 1; n <= 20; n++) { const r = await page({ 'cond[se_cd::EQ]': se }, n); total = r.total; all.push(...r.items); if (all.length >= total || r.items.length < 1000) break; }
  const by = {}; all.forEach((x) => (by[x.ctgry_cd] = (by[x.ctgry_cd] ?? 0) + 1));
  console.log(`## se_cd=${se} 전체 totalCount=${total} 받은행=${all.length} 부류별=`, JSON.stringify(by));
}
// 축산물만 따로 조회
for (const se of ['01', '02']) {
  const r = await page({ 'cond[se_cd::EQ]': se, 'cond[ctgry_cd::EQ]': '500' });
  console.log(`## 축산물(500) se_cd=${se} totalCount=${r.total} 받은행=${r.items.length} header=${JSON.stringify(r.header)}`);
  for (const x of r.items) console.log([x.item_cd, x.item_nm, x.vrty_cd, x.vrty_nm, x.grd_cd, x.grd_nm, `unit=${x.unit_sz}${x.unit}`, `prc=${x.exmn_dd_prc}`, `kg=${x.exmn_dd_cnvs_prc}`, `d1=${x.dd1_bfr_prc}`, `m1=${x.mm1_bfr_prc}`, x.exmn_ymd].join(' | '));
}
