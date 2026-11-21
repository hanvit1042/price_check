// 사진 인식률 비교 시험(실제 Tesseract). 가격표 6종 × 사진 상태 6종 = 36장을 만들어
//   [이전 방식 / 새 방식] × [전체 사진 / 촬영 틀에 맞춰 찍은 사진] 으로 읽고 품목·가격·수량 정확도를 센다.
// 주의: 컴퓨터로 만든 '사진 같은' 이미지라 실제 사진보다 쉽거나 어려울 수 있다. 방식 간 '비교'용이다.
// 사용: (playwright 설치 후) node scripts/ocr-bench.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');

const root = path.resolve('docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, s) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream'); s.end(readFileSync(f));
}).listen(8192);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:8192/help.html');           // 앱 화면은 필요 없고 같은 출처에서 모듈만 쓴다

const out = await page.evaluate(async ({ only }) => {
  const { recognize, getWorker, PASSES } = await import('/ocr-engine.js');
  const { parseTag, tagScore, tagComplete } = await import('/ocr-parse.js');
  const items = (await (await fetch('/data/latest.json')).json()).items;
  const parse = (t) => { const r = parseTag(t, items); return { score: tagScore(r), complete: tagComplete(r) }; };

  // ── 재현 가능한 난수 ──
  let seed = 20261121; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const FONT = '"Noto Sans CJK KR","Noto Sans KR","Malgun Gothic",sans-serif';
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ── 가격표 6종 (정답: 품목·가격·수량) ──
  const TAGS = [
    { id: '전자(오타·단가)', exp: { name: '방울토마토', price: 8980, qty: 0.75 }, draw(g, w, h) {
      g.fillStyle = '#dedede'; g.fillRect(0, 0, w, h); g.strokeStyle = '#555'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#111'; g.textBaseline = 'top'; g.font = `bold 40px ${FONT}`; g.fillText('대추방물토마토750g/팩', 28, 26);
      g.font = `24px ${FONT}`; g.fillText('국내산', 28, 84); g.fillText('100g당 1197원', 28, 120);
      g.font = `bold 120px ${FONT}`; g.textAlign = 'right'; g.fillText('8,980', w - 30, 170); g.textAlign = 'left';
      for (let i = 0; i < 40; i++) g.fillRect(30 + i * 7 + (i % 3), h - 70, 2 + (i % 3), 44);
      g.font = `18px ${FONT}`; g.fillText('070181   119/0/정정', 28, h - 22);
    } },
    { id: '종이(정상가·행사가)', exp: { name: '양파', price: 3980, qty: 1.5 }, draw(g, w, h) {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d33'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#111'; g.textBaseline = 'top'; g.font = `bold 58px ${FONT}`; g.fillText('국산 양파 1.5kg', 36, 34);
      g.fillStyle = '#777'; g.font = `34px ${FONT}`; g.fillText('정상가 4,500원', 36, 130);
      g.fillStyle = '#c00'; g.font = `bold 76px ${FONT}`; g.fillText('행사가 3,980원', 36, 200);
    } },
    { id: '한우(100g당)', exp: { name: '쇠고기', price: 13900, qty: 0.1 }, draw(g, w, h) {
      g.fillStyle = '#fffbe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.textBaseline = 'top';
      g.font = `bold 54px ${FONT}`; g.fillText('한우 등심 1+등급', 34, 40); g.font = `bold 70px ${FONT}`; g.fillText('100g당 13,900원', 34, 150);
    } },
    { id: '삼겹살', exp: { name: '돼지고기', price: 16800, qty: 0.6 }, draw(g, w, h) {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.textBaseline = 'top';
      g.font = `bold 64px ${FONT}`; g.fillText('삼겹살 600g', 40, 40); g.font = `bold 110px ${FONT}`; g.fillText('16,800원', 40, 140);
    } },
    { id: '계란', exp: { name: '계란', price: 7980, qty: 30 }, draw(g, w, h) {
      g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.textBaseline = 'top';
      g.font = `bold 56px ${FONT}`; g.fillText('신선 계란 특란 30구', 36, 38); g.font = `bold 108px ${FONT}`; g.fillText('7,980원', 36, 140);
    } },
    { id: '마늘', exp: { name: '깐마늘(국산)', price: 5620, qty: 0.5 }, draw(g, w, h) {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.textBaseline = 'top';
      g.font = `bold 52px ${FONT}`; g.fillText('깐마늘(국산) 500g', 34, 40); g.font = `bold 104px ${FONT}`; g.fillText('5,620원', 34, 140);
    } },
  ];
  // ── 사진 상태 6종 ──
  const CONDS = [
    { id: '깨끗함', rot: 0 },
    { id: '기울어짐', rot: -6, shx: 0.06 },
    { id: '흐림', rot: 3, blur: 1.7 },
    { id: '반사', rot: -3, glare: 0.85 },
    { id: '어둡고잡음', rot: 5, noise: 30, dim: 0.5 },
    { id: '최악', rot: 7, shx: 0.12, shy: 0.04, blur: 1.2, glare: 0.7, noise: 18, dim: 0.78, q: 0.4, down: 0.62 },
  ];

  function photo(tag, cond) {
    const TW = 760, TH = 420, tc = cv(TW, TH); tag.draw(tc.getContext('2d'), TW, TH);
    const W = 1600, H = 1200, p = cv(W, H), g = p.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#9a8f7f'); grd.addColorStop(1, '#6b7d6a'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { g.fillStyle = `hsla(${Math.floor(rnd() * 360)},${30 + rnd() * 50}%,${25 + rnd() * 50}%,${0.25 + rnd() * 0.45})`; g.fillRect(rnd() * W, rnd() * H, 60 + rnd() * 260, 40 + rnd() * 200); }
    const sc = 700 / TW, tw = TW * sc, th = TH * sc, cx = W / 2 + (rnd() - 0.5) * 80, cy = H / 2 + (rnd() - 0.5) * 60;
    const rot = (cond.rot * Math.PI) / 180, shx = cond.shx ?? 0, shy = cond.shy ?? 0;
    g.save(); g.translate(cx, cy); g.rotate(rot); g.transform(1, shy, shx, 1, 0, 0);
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24; g.drawImage(tc, -tw / 2, -th / 2, tw, th); g.restore();
    const xs = [], ys = [];
    for (const [x, y] of [[-tw / 2, -th / 2], [tw / 2, -th / 2], [tw / 2, th / 2], [-tw / 2, th / 2]]) { const a = x + shx * y, b = shy * x + y; xs.push(cx + a * Math.cos(rot) - b * Math.sin(rot)); ys.push(cy + a * Math.sin(rot) + b * Math.cos(rot)); }
    let bb = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    if (cond.glare) { const r = g.createRadialGradient(cx + tw * 0.2, cy - th * 0.25, 10, cx + tw * 0.2, cy - th * 0.25, tw * 0.5); r.addColorStop(0, `rgba(255,255,255,${cond.glare})`); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H); }
    if (cond.dim) { g.fillStyle = `rgba(0,0,0,${cond.dim})`; g.fillRect(0, 0, W, H); }
    let out = p;
    if (cond.blur) { out = cv(W, H); const o = out.getContext('2d'); o.filter = `blur(${cond.blur}px)`; o.drawImage(p, 0, 0); }
    if (cond.noise) { const o = out.getContext('2d'), im = o.getImageData(0, 0, W, H), d = im.data; for (let i = 0; i < d.length; i += 4) { const n = gauss() * cond.noise; d[i] += n; d[i + 1] += n; d[i + 2] += n; } o.putImageData(im, 0, 0); }
    return { cv: out, bb, down: cond.down ?? 1, q: cond.q ?? 0.85, W, H };
  }
  async function jpeg(c, q, down) {
    const s = cv(Math.round(c.width * down), Math.round(c.height * down)); s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
    const blob = await new Promise((ok) => s.toBlob(ok, 'image/jpeg', q)); const bmp = await createImageBitmap(blob);
    const r = cv(bmp.width, bmp.height); r.getContext('2d').drawImage(bmp, 0, 0); return r;
  }
  async function make(tag, cond) {
    const ph = photo(tag, cond), full = await jpeg(ph.cv, ph.q, ph.down);
    const pad = 0.07, bw = ph.bb.x1 - ph.bb.x0, bh = ph.bb.y1 - ph.bb.y0;
    const sx = Math.max(0, ph.bb.x0 - bw * pad), sy = Math.max(0, ph.bb.y0 - bh * pad), sw = Math.min(ph.W - sx, bw * (1 + 2 * pad)), sh = Math.min(ph.H - sy, bh * (1 + 2 * pad));
    const crop = cv(Math.round(sw), Math.round(sh)); crop.getContext('2d').drawImage(ph.cv, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    return { full, framed: await jpeg(crop, ph.q, ph.down) };
  }

  // ── 이전 방식(그대로 재현): 긴 변 1800 이하로만 줄이고 흑백+대비, 자동 분할(3) 한 번 ──
  async function baseline(c) {
    const w = await getWorker(); const k = Math.min(1, 1800 / Math.max(c.width, c.height));
    const o = cv(Math.round(c.width * k), Math.round(c.height * k)), x = o.getContext('2d'); x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(c, 0, 0, o.width, o.height);
    await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '0', user_defined_dpi: '' });
    return (await w.recognize(o)).data.text;
  }
  const judge = (text, exp) => { const r = parseTag(text, items); const n = r.matches[0]?.name === exp.name, p = r.prices[0] === exp.price, q = r.qty != null && Math.abs(r.qty - exp.qty) < 1e-6; return { n, p, q, all: n && p && q }; };

  const rows = [];
  await getWorker();
  for (const tag of TAGS) for (const cond of CONDS) {
    if (only && !`${tag.id}${cond.id}`.includes(only)) continue;
    const { full, framed } = await make(tag, cond);
    const row = { tag: tag.id, cond: cond.id, res: {} };
    for (const [mode, img] of [['full', full], ['framed', framed]]) {
      let t0 = performance.now(), txt = await baseline(img); row.res['이전/' + mode] = { ...judge(txt, tag.exp), ms: Math.round(performance.now() - t0), txt: txt.replace(/\s+/g, ' ').slice(0, 90) };
      t0 = performance.now(); const r = await recognize(img, { parse }); row.res['새/' + mode] = { ...judge(r.text, tag.exp), ms: Math.round(performance.now() - t0), txt: r.text.replace(/\s+/g, ' ').slice(0, 90), pass: r.pass, angle: r.angle };
    }
    rows.push(row);
  }
  return rows;
}, { only: process.env.ONLY || '' });

const modes = ['이전/full', '이전/framed', '새/full', '새/framed'];
const pct = (a, b) => `${Math.round((100 * a) / b)}%`.padStart(4);
console.log(`\n사진 ${out.length}장 (가격표 6종 × 상태 6종). 각 칸: 품목/가격/수량/전부 맞음 (%)`);
console.log('방식'.padEnd(14) + ['품목', '가격', '수량', '전부'].map((x) => x.padStart(6)).join('') + '   평균 시간');
const sum = {};
for (const m of modes) {
  const rs = out.map((r) => r.res[m]), n = rs.length; sum[m] = { all: rs.filter((x) => x.all).length / n };
  console.log(m.padEnd(14) + ['n', 'p', 'q', 'all'].map((k) => pct(rs.filter((x) => x[k]).length, n).padStart(6)).join('') + `   ${(rs.reduce((a, x) => a + x.ms, 0) / n / 1000).toFixed(1)}초`);
}
console.log('\n[사진 상태별: 전부 맞은 비율]');
console.log('상태'.padEnd(10) + modes.map((m) => m.padStart(12)).join(''));
for (const cond of [...new Set(out.map((r) => r.cond))]) { const rs = out.filter((r) => r.cond === cond); console.log(cond.padEnd(10) + modes.map((m) => pct(rs.filter((r) => r.res[m].all).length, rs.length).padStart(12)).join('')); }
console.log('\n[가격표별: 전부 맞은 비율]');
for (const tag of [...new Set(out.map((r) => r.tag))]) { const rs = out.filter((r) => r.tag === tag); console.log(tag.padEnd(14) + modes.map((m) => pct(rs.filter((r) => r.res[m].all).length, rs.length).padStart(12)).join('')); }
const wins = {}; out.forEach((r) => { const p = r.res['새/framed'].pass; wins[p] = (wins[p] ?? 0) + 1; });
console.log('\n[새 방식(틀) 최종 채택된 읽기]', JSON.stringify(wins));
console.log('\n[새 방식(틀)에서 틀린 경우 — 읽은 글자]');
for (const r of out) { const x = r.res['새/framed']; if (!x.all) console.log(`- ${r.tag}/${r.cond} (n${x.n ? 'O' : 'X'} p${x.p ? 'O' : 'X'} q${x.q ? 'O' : 'X'}, 각도 ${x.angle}): ${x.txt}`); }
await browser.close(); srv.close();
