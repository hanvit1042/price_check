// 앱 전체 동작 점검(실제 브라우저): 앱이 열리는지, 품목 선택→판정→구매처·지역 전환→추천 탭→설명서까지.
// 사용: node scripts/smoke.mjs   (playwright 필요. 로컬: PW_PATH=<전역 playwright 경로>)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');

const root = path.resolve('docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf' };
const srv = http.createServer((q, s) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream'); s.end(readFileSync(f));
}).listen(8191);

const fails = [], oks = [];
const check = (name, cond, extra = '') => { (cond ? oks : fails).push(`${name}${cond ? '' : ' ✗ ' + extra}`); };
const b = await chromium.launch();
async function open(url, { legacyVenue } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', (e) => p.errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push('console: ' + m.text().slice(0, 120)));
  if (legacyVenue) await p.addInitScript((v) => localStorage.setItem('pc:v2', JSON.stringify({ venue: v })), legacyVenue);
  await p.route('**/foodsafetykorea.go.kr/**', (r) => r.abort()); // 외부 사진은 시험에서 제외
  await p.goto(`http://localhost:8191/${url}`);
  return p;
}
const pick = async (p, name, price, preset) => {
  await p.locator('#change').click({ timeout: 1000 }).catch(() => {}); await p.waitForSelector('#grid .pick');
  await p.fill('#q', name); await p.click(`#grid .pick[data-n="${name}"]`);
  if (preset) await p.click(`#presets .chip >> text=${preset}`);
  await p.fill('#price', String(price)); await p.waitForSelector('#s3 .res', { timeout: 8000 });
};

for (const mode of ['normal', 'easy']) {
  const p = await open(`?v=${mode}`);
  try {
    await p.waitForSelector('#grid .pick', { timeout: 10000 });
    check(`[${mode}] 앱이 열리고 품목 카드가 보임`, (await p.$$('#grid .pick')).length >= 5);
    check(`[${mode}] 버전 표시`, /앱 버전/.test(await p.innerText('#ver')));
    await pick(p, '양파', 1800, '1kg');
    check(`[${mode}] 판정 결과 표시`, !!(await p.innerText('#s3 .res .t')));
    for (const v of ['market', 'mart', 'other']) { await p.click(`#venues [data-v="${v}"]`); check(`[${mode}] 구매처 ${v} 전환 → 비교 기준 표시`, /비교 기준/.test(await p.innerText('#s3 .basis'))); }
    await pick(p, '돼지고기', 3000);
    check(`[${mode}] 돼지고기(100g 기본) 판정`, /100g/.test(await p.innerText('#s3 .cmp')));
    await pick(p, '쌀', 64000);
    check(`[${mode}] 쌀: 포대 가격만 입력(수량 입력칸 숨김)`, await p.$eval('#qtyBox', (e) => e.hidden));
    await p.click('#change');
  } catch (e) { check(`[${mode}] 기본 흐름`, false, e.message.split('\n')[0]); }
  check(`[${mode}] 콘솔/페이지 오류 없음`, p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

{ // 지역·추천 탭
  const p = await open('?v=normal');
  try {
    await p.waitForSelector('#grid .pick');
    const hasRegion = existsSync(path.join(root, 'data/region.json'));
    if (hasRegion) {
      await p.selectOption('#regionSel', '1101');
      check('지역 선택 → 라벨 반영', /서울/.test(await p.innerText('#regionLbl')));
    }
    await p.click('.tabs [data-t="reco"]'); await p.waitForSelector('.recipe', { timeout: 10000 });
    check('오늘의 추천: 메뉴 카드', (await p.$$('.recipe')).length >= 1);
    check('오늘의 추천: 싸진 품목 목록', (await p.$$('#dealsDown .deal')).length >= 1);
    if (hasRegion) { await p.waitForSelector('#regionSec:not([hidden])', { timeout: 5000 }).catch(() => {}); check('오늘의 추천: 우리 지역 섹션', await p.$eval('#regionSec', (e) => !e.hidden)); }
    await p.click('.ingc >> nth=0'); check('재료 버튼 → 가격 확인 화면으로 이동', await p.$eval('#check', (e) => !e.hidden));
  } catch (e) { check('지역·추천 탭 흐름', false, e.message.split('\n')[0]); }
  check('지역·추천 콘솔/페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

{ // 옛 구매처 값(편의점)이 저장된 사용자도 열려야 함
  const p = await open('?v=normal', { legacyVenue: 'small' });
  try { await p.waitForSelector('#grid .pick', { timeout: 10000 }); check('옛 구매처 값 저장된 사용자도 앱이 열림', (await p.$$eval('#venues .chip[aria-pressed=true]', (e) => e.length)) === 1); }
  catch (e) { check('옛 구매처 값 저장된 사용자도 앱이 열림', false, e.message.split('\n')[0] + ' ' + p.errs.join(' | ')); }
  await p.context().close();
}

{ // 설명서
  const p = await open('help.html');
  check('설명서 열림', /사용 설명서/.test(await p.innerText('h1')));
  await p.waitForTimeout(500);
  check('설명서 그림이 모두 있음', (await p.$$eval('img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length)) === 0);
  await p.context().close();
}

await b.close(); srv.close();
console.log(oks.map((x) => '✅ ' + x).join('\n')); if (fails.length) console.log('\n' + fails.map((x) => '❌ ' + x).join('\n'));
console.log(`\n점검 ${oks.length + fails.length}개 중 실패 ${fails.length}개`);
process.exit(fails.length ? 1 : 0);
