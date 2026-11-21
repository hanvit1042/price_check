// 지역별 소매가(공공데이터포털 일별 도,소매 가격정보) → docs/data/region.json  (하루 한 번 실행)
//   DATA_GO_KR_KEY : 공공데이터포털 인증키 ('일별 도,소매 가격정보' 활용신청 필요)
import { readFileSync, writeFileSync } from 'node:fs';
import { itemKeys, aggregateRegion, aggregateChannel } from './region-lib.mjs';
import { isOkHeader } from './lib.mjs';

const root = new URL('../', import.meta.url);
const latest = JSON.parse(readFileSync(new URL('docs/data/latest.json', root), 'utf8'));
let key = process.env.DATA_GO_KR_KEY;
if (key?.includes('%')) key = decodeURIComponent(key);
if (!key) { console.error('DATA_GO_KR_KEY 가 설정되지 않았습니다.'); process.exit(1); }
const base = process.env.PERDAY_URL || 'https://apis.data.go.kr/B552845/perDay/price';
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const now = Date.now(), GTE = ymd(now - 7 * 864e5), LTE = ymd(now);

async function getJson(url, tries = 2) {
  for (let t = 1; ; t++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(40000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(await res.text());
    } catch (e) { if (t >= tries) throw e; await new Promise((r) => setTimeout(r, 1500)); }
  }
}
async function fetchItem({ ctgry, item }) {
  const rows = [];
  for (let page = 1; page <= 8; page++) {
    const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: '1000', returnType: 'json',
      'cond[exmn_ymd::GTE]': GTE, 'cond[exmn_ymd::LTE]': LTE, 'cond[se_cd::EQ]': '01', 'cond[ctgry_cd::EQ]': ctgry, 'cond[item_cd::EQ]': item });
    const j = await getJson(`${base}?${q}`);
    const h = j?.response?.header;
    if (!isOkHeader(h)) throw new Error(`API 오류 ${h?.resultCode}: ${h?.resultMsg}`);
    const body = j?.response?.body; let items = body?.items?.item ?? body?.items ?? [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    rows.push(...items);
    if (rows.length >= Number(body?.totalCount ?? 0) || items.length < 1000) break;
  }
  return rows;
}

const keys = itemKeys(latest.items), validIds = new Map(latest.items.filter((i) => i.retail && (i.base === 'kg' || String(i.id).startsWith('500:'))).map((i) => [i.id, i.base]));
let rows = [], failed = 0, firstErr = '';
for (const k of keys) {
  try { rows.push(...(await fetchItem(k))); }
  catch (e) { failed++; firstErr ||= `${k.ctgry}:${k.item} ${e.message}`; if (failed >= 5 && failed === keys.length) break; }
}
if (!rows.length) { console.error(`지역 데이터를 하나도 받지 못했습니다. 첫 오류: ${firstErr}`); process.exit(1); }
const prices = aggregateRegion(rows, validIds);
const mname = Object.fromEntries(JSON.parse(readFileSync(new URL('scripts/market-codes.json', root), 'utf8')).map((m) => [m.code, m.name]));
const channel = aggregateChannel(rows, validIds, mname);
writeFileSync(new URL('docs/data/region.json', root), JSON.stringify({ updated: new Date(now + 9 * 3600e3).toISOString(), range: [GTE, LTE], prices }));
writeFileSync(new URL('docs/data/channel.json', root), JSON.stringify({ updated: new Date(now + 9 * 3600e3).toISOString(), range: [GTE, LTE], ch: channel }));
console.log(`채널(시장 vs 마트·유통업체) 시세 저장: 품목 ${Object.keys(channel).length}개`);
console.log(`지역 시세 저장: 품목 ${Object.keys(prices).length}개 (조회 ${keys.length}건 중 실패 ${failed}건, 행 ${rows.length}개)`);
