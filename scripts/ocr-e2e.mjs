// 실제 브라우저(Chromium)로 사진 인식을 끝까지 시험한다. 한글 가격표 그림을 만들어 올리고 결과를 출력.
// 사용: (playwright 설치 후) node scripts/ocr-e2e.mjs   — 인터넷 필요(인식 프로그램·한국어 데이터를 CDN 에서 받음)
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream'); s.end(readFileSync(f));
}).listen(8190);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ko-KR' });
const page = await ctx.newPage();
const logs = []; page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => logs.push('requestfailed: ' + r.url().slice(0, 120)));
const status = [];
await page.goto('http://localhost:8190/?v=normal'); await page.waitForSelector('#grid .pick');

const tags = [
  { lines: ['국산 양파 1.5kg', '정상가 4,500원', '행사가 3,980원'], expect: '양파' },
  { lines: ['한우 등심 1+등급', '100g당 13,900원'], expect: '쇠고기' },
  { lines: ['삼겹살 600g', '16,800원'], expect: '돼지고기' },
];
let ok = 0;
for (const [n, t] of tags.entries()) {
  const dataUrl = await page.evaluate((lines) => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 140 + lines.length * 120; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'; g.font = 'bold 72px "Noto Sans CJK KR","Noto Sans KR",sans-serif'; g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, 40, 50 + i * 120)); return c.toDataURL('image/png');
  }, t.lines);
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.click('#change').catch(() => {}); // 이전 품목 선택 해제
  await page.evaluate(() => { document.getElementById('ocr2')?.remove(); document.getElementById('ocr').innerHTML = ''; });
  const t0 = Date.now();
  const poll = setInterval(async () => { try { const m = await page.$eval('#ocrMsg', (e) => e.textContent); if (status.at(-1) !== m) status.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`); } catch {} }, 700);
  await page.setInputFiles('#shot', { name: 'tag.png', mimeType: 'image/png', buffer });
  let done = true;
  try {
    await page.waitForSelector('#ocrMsg', { state: 'attached', timeout: 10000 });   // 인식이 시작됨
    await page.waitForFunction(() => { const o = document.getElementById('ocr'); return o.hidden || !o.querySelector('#ocrMsg'); }, null, { timeout: 150000 }); // 끝남(품목을 찾으면 상자를 숨기고, 못 찾으면 결과로 바꿈)
  } catch { done = false; }
  clearInterval(poll);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const box = await page.evaluate(() => { const v = (id) => document.getElementById(id); const t = (e) => (e && !e.hidden ? e.innerText.replace(/\n+/g, ' / ') : ''); return { ocr: t(v('ocr')), ocr2: t(v('ocr2')), raw: [...document.querySelectorAll('#ocr pre, #ocr2 pre')].map((e) => e.textContent.replace(/\n+/g, ' / ')).join(' || '), name: v('pName')?.textContent, price: v('price').value, qty: v('qty').value + v('unit').value }; });
  const hit = box.name === t.expect; if (hit) ok++;
  console.log(`\n[그림 ${n + 1}] ${t.lines.join(' | ')}\n  끝남=${done} 걸린 시간=${sec}s  기대 품목=${t.expect} → ${hit ? '✅' : '❌'} 선택된 품목=${box.name} 가격=${box.price} 수량=${box.qty}\n  읽은 글자: ${box.raw || '(없음)'}\n  화면 메시지: ${(box.ocr2 || box.ocr).slice(0, 160)}`);
}
console.log('\n진행 표시 기록:', status.join(' → ') || '(없음)');
console.log('콘솔/네트워크 문제:', logs.length ? '\n  ' + logs.join('\n  ') : '없음');
console.log(`\n결과: ${ok}/${tags.length} 품목 인식 성공`);
await browser.close(); srv.close();
process.exit(ok >= 1 ? 0 : 1);
