// 공공데이터를 받아 docs/data/*.json 으로 저장한다. (GitHub Actions 에서 주기 실행)
//   DATA_GO_KR_KEY : 공공데이터포털 일반 인증키(Decoding) — 아래 3개 API 모두 활용신청 후 같은 키를 사용
//     · 최근일자 도,소매가격정보 (B552845/recent/price)            — 필수
//     · 전국 공영도매시장 실시간 경매정보 (B552845/katRealTime2/trades2) — 선택(없으면 경매 항목만 빠짐)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { normalizeRecent, aggregateAuction, attachAuction, updateHistory } from './lib.mjs';

const OUT = new URL('../docs/data/', import.meta.url);
const kst = new Date(Date.now() + 9 * 3600e3).toISOString();
const today = kst.slice(0, 10);

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(/(key|cert_key|serviceKey)=[^&]+/gi, '$1=***')}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('JSON 이 아닌 응답: ' + text.slice(0, 200)); }
}

async function fetchPages(base, extra) {
  let key = process.env.DATA_GO_KR_KEY;
  if (key?.includes('%')) key = decodeURIComponent(key); // Encoding 키를 넣어도 동작
  if (!key) throw new Error('DATA_GO_KR_KEY 가 설정되지 않았습니다.');
  const rows = [];
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: '1000', returnType: 'json', ...extra });
    const j = await getJson(`${base}?${q}`);
    const code = j?.response?.header?.resultCode;
    if (code && code !== '00') throw new Error(`API 오류 ${code}: ${j.response.header.resultMsg}`);
    const body = j?.response?.body;
    let items = body?.items?.item ?? body?.items ?? [];
    if (!Array.isArray(items)) items = [items];
    rows.push(...items);
    if (rows.length >= Number(body?.totalCount ?? 0) || items.length < 1000) break;
  }
  return rows;
}

async function fetchRecent() {
  const base = process.env.RECENT_URL || 'https://apis.data.go.kr/B552845/recent/price';
  const rows = [];
  for (const se of ['01', '02']) rows.push(...(await fetchPages(base, { 'cond[se_cd::EQ]': se })));
  return normalizeRecent(rows);
}

// 전국 공영도매시장 실시간 경매정보 (공공데이터포털, 한국농수산식품유통공사)
async function fetchAuction() {
  const base = process.env.AUCTION_URL || 'https://apis.data.go.kr/B552845/katRealTime2/trades2';
  return aggregateAuction(await fetchPages(base, { 'cond[trd_clcln_ymd::EQ]': today }));
}

const items = await fetchRecent();
let auctionNote = '미사용';
try {
  const auctions = await fetchAuction();
  attachAuction(items, auctions, today);
  auctionNote = `${auctions.length}개 품목`;
} catch (e) {
  console.warn('실시간 경매 데이터 수집 실패(무시하고 계속):', e.message);
  auctionNote = '수집 실패';
}

await mkdir(OUT, { recursive: true });
let history = {};
try { history = JSON.parse(await readFile(new URL('history.json', OUT), 'utf8')); } catch {}
updateHistory(history, items, today);

await writeFile(new URL('latest.json', OUT), JSON.stringify({ updated: kst, source: 'data.go.kr', items }));
await writeFile(new URL('history.json', OUT), JSON.stringify(history));
console.log(`저장 완료: ${items.length}개 품목, 경매=${auctionNote}`);
