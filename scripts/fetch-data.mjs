// 공공데이터를 받아 docs/data/*.json 으로 저장한다. (GitHub Actions 에서 주기 실행)
//   KAMIS_CERT_KEY / KAMIS_CERT_ID : KAMIS(농산물유통정보) 오픈API 인증키/ID  (필수)
//   DATA_GO_KR_KEY                 : 공공데이터포털 인증키 — 전국 공영도매시장 실시간 경매정보 (선택)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { normalizeKamis, aggregateAuction, attachAuction, updateHistory } from './lib.mjs';

const OUT = new URL('../docs/data/', import.meta.url);
const kst = new Date(Date.now() + 9 * 3600e3).toISOString();
const today = kst.slice(0, 10);

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(/(key|cert_key|serviceKey)=[^&]+/gi, '$1=***')}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('JSON 이 아닌 응답: ' + text.slice(0, 200)); }
}

async function fetchKamis() {
  const { KAMIS_CERT_KEY: key, KAMIS_CERT_ID: id } = process.env;
  if (!key || !id) throw new Error('KAMIS_CERT_KEY / KAMIS_CERT_ID 가 설정되지 않았습니다.');
  const base = process.env.KAMIS_BASE_URL || 'https://www.kamis.or.kr/service/price/xml.do';
  const url = `${base}?action=dailySalesList&p_cert_key=${encodeURIComponent(key)}&p_cert_id=${encodeURIComponent(id)}&p_returntype=json`;
  return normalizeKamis(await getJson(url));
}

// 전국 공영도매시장 실시간 경매정보 (공공데이터포털, 한국농수산식품유통공사)
async function fetchAuction() {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return [];
  const base = process.env.AUCTION_URL || 'https://apis.data.go.kr/B552845/katRealTime2/trades2';
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: '1000', returnType: 'json', 'cond[trd_clcln_ymd::EQ]': today });
    const j = await getJson(`${base}?${q}`);
    const body = j?.response?.body;
    let items = body?.items?.item ?? body?.items ?? [];
    if (!Array.isArray(items)) items = [items];
    rows.push(...items);
    if (rows.length >= Number(body?.totalCount ?? 0) || items.length < 1000) break;
  }
  return aggregateAuction(rows);
}

const items = await fetchKamis();
let auctionNote = '미사용';
try {
  const auctions = await fetchAuction();
  attachAuction(items, auctions, today);
  auctionNote = process.env.DATA_GO_KR_KEY ? `${auctions.length}개 품목` : '미사용';
} catch (e) {
  console.warn('실시간 경매 데이터 수집 실패(무시하고 계속):', e.message);
  auctionNote = '수집 실패';
}

await mkdir(OUT, { recursive: true });
let history = {};
try { history = JSON.parse(await readFile(new URL('history.json', OUT), 'utf8')); } catch {}
updateHistory(history, items, today);

await writeFile(new URL('latest.json', OUT), JSON.stringify({ updated: kst, source: 'kamis', items }));
await writeFile(new URL('history.json', OUT), JSON.stringify(history));
console.log(`저장 완료: ${items.length}개 품목, 경매=${auctionNote}`);
