// 진단용: 일별(perDay) API 의 축산물 품종별 가격 분포 (인증키는 출력하지 않음)
let key = process.env.DATA_GO_KR_KEY; if (key?.includes('%')) key = decodeURIComponent(key);
if (!key) { console.error('DATA_GO_KR_KEY 없음'); process.exit(1); }
const per = 'https://apis.data.go.kr/B552845/perDay/price';
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const now = Date.now();
const med = (a) => { a = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
const names = { 4301: '소(한우)', 4304: '돼지', 4401: '수입소고기', 4402: '수입돼지', 9901: '닭', 9903: '계란', 9908: '우유' };
for (const item of Object.keys(names)) {
  const rows = [];
  for (let page = 1; page <= 8; page++) {
    const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: '1000', returnType: 'json', 'cond[exmn_ymd::GTE]': ymd(now - 35 * 864e5), 'cond[exmn_ymd::LTE]': ymd(now), 'cond[se_cd::EQ]': '01', 'cond[ctgry_cd::EQ]': '500', 'cond[item_cd::EQ]': item });
    const j = await (await fetch(`${per}?${q}`, { signal: AbortSignal.timeout(40000) })).json();
    const b = j?.response?.body; let it = b?.items?.item ?? b?.items ?? []; if (!Array.isArray(it)) it = it ? [it] : [];
    rows.push(...it); if (rows.length >= Number(b?.totalCount ?? 0) || it.length < 1000) break;
  }
  console.log(`## ${item} ${names[item]}: ${rows.length}행 / 35일`);
  const g = {};
  for (const r of rows) (g[`${r.vrty_cd}:${r.vrty_nm}|${r.grd_cd}:${r.grd_nm}|${r.unit_sz}${r.unit}`] ??= []).push(r);
  for (const [k, rs] of Object.entries(g)) {
    const dates = [...new Set(rs.map((r) => r.exmn_ymd))].sort();
    const prc = rs.map((r) => Number(String(r.exmn_dd_prc).replace(/,/g, ''))), cn = rs.map((r) => Number(String(r.exmn_dd_cnvs_prc).replace(/,/g, '')));
    const mk = new Set(rs.map((r) => r.mrkt_nm || r.mrkt_cd)).size, sg = new Set(rs.map((r) => r.sgg_nm)).size;
    console.log(`  ${k} | 행${rs.length} 날짜${dates.length}일(${dates[0]}~${dates.at(-1)}) 지역${sg} 시장${mk} | prc 중앙${med(prc)} 최소${Math.min(...prc)} 최대${Math.max(...prc)} | cnvs 중앙${med(cn)} 종류${new Set(cn).size}`);
  }
}
