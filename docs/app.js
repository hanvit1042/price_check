import { judge, VENUES, unitsFor, pct } from './judge.js';
import { parseTag } from './ocr-parse.js';

const $ = (id) => document.getElementById(id);
const won = (n) => (n == null ? '–' : Math.round(n).toLocaleString('ko-KR') + '원');
const KEY = 'pc:v1';
const store = { get: () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
  set: (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...store.get(), ...o })); } catch {} } };

let data = { items: [] }, history = {}, cat = '전체', cur = null;

async function load() {
  const [l, h] = await Promise.all([
    fetch('data/latest.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/history.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})),
  ]);
  data = l; history = h;
}

function renderMeta() {
  const d = data.updated ? new Date(data.updated) : null;
  const t = d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} 기준` : '';
  $('meta').innerHTML = data.source === 'sample'
    ? `<span class="demo">샘플 데이터</span> 실제 시세가 아닙니다 · README 의 설정 후 실데이터로 전환`
    : `${t} · 전국 평균 시세 (${data.items.length}개 품목)`;
}

function renderCats() {
  const cats = ['전체', ...new Set(data.items.map((i) => i.category).filter(Boolean))];
  $('cats').innerHTML = cats.map((c) => `<button class="chip" role="tab" aria-selected="${c === cat}" data-c="${c}">${c}</button>`).join('');
}

function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const rows = data.items.filter((i) => (cat === '전체' || i.category === cat) && (!q || i.display.toLowerCase().includes(q)))
    .sort((a, b) => a.display.localeCompare(b.display, 'ko')).slice(0, 60);
  $('list').innerHTML = rows.length ? rows.map((i) => {
    const p = i.retail ?? i.wholesale;
    return `<li role="option" data-id="${encodeURIComponent(i.id)}"><span>${i.display}</span><span class="p">${won(p.p)}/${i.base}</span></li>`;
  }).join('') : '<li class="empty">검색 결과가 없어요</li>';
}

function select(item) {
  cur = item;
  $('selName').textContent = item.display;
  $('form').hidden = false;
  $('unit').innerHTML = unitsFor(item.base).map((u) => `<option>${u}</option>`).join('');
  $('unit').value = store.get().unit?.[item.base] ?? unitsFor(item.base)[0];
  $('list').hidden = true; $('cats').hidden = true;
  $('q').value = item.display;
  store.set({ last: item.id });
  update();
  $('price').focus({ preventScroll: true });
}

function update() {
  if (!cur) return;
  const price = Number($('price').value), qty = Number($('qty').value), unit = $('unit').value, venue = $('venue').value;
  store.set({ venue, unit: { ...store.get().unit, [cur.base]: unit } });
  renderTrend();
  const r = judge({ item: cur, price, qty, unit, venue, history: history[cur.id] ?? [] });
  const box = $('result');
  if (!r) {
    box.hidden = !$('price').value;
    if ($('price').value) { box.className = 'card result'; box.innerHTML = '<p class="msg">이 품목은 시세 정보가 부족해 판정할 수 없어요.</p>'; }
    return;
  }
  const sign = r.diffPct >= 0 ? '+' : '';
  // 게이지: 비율 0.6~1.6 을 0~100% 로
  const pos = (x) => Math.min(100, Math.max(0, ((x - 0.6) / 1.0) * 100));
  const lowR = r.fairLow / r.center, highR = r.fairHigh / r.center;
  const a = cur.auction;
  box.hidden = false; box.className = `card result ${r.band.key}`;
  box.innerHTML = `
    <div class="verdict"><div class="e">${r.band.emoji}</div><div><div class="t">${r.band.label}</div>
      <div class="d">시세 대비 ${sign}${r.diffPct.toFixed(0)}% · 내 가격 ${won(r.mine)}/${cur.base}</div></div></div>
    <p class="msg">${r.band.msg}</p>
    <div class="gauge"><div class="fair" style="left:${pos(lowR)}%;width:${pos(highR) - pos(lowR)}%"></div>
      <div class="pin" style="left:${Math.min(92, Math.max(8, pos(r.ratio)))}%">내 가격</div></div>
    <div class="gl"><span>싸다</span><span>적정 구간</span><span>비싸다</span></div>
    ${r.notes.map((n) => `<div class="note">⚠️ ${n}</div>`).join('')}
    <table>
      <tr><td>적정가(구매처 반영)</td><td><b>${won(r.fairLow)} ~ ${won(r.fairHigh)}</b><small>/${cur.base}</small></td></tr>
      <tr><td>전국 소매 평균${r.estimated ? ' (추정)' : ''}</td><td>${won(r.ref)}<small>/${cur.base}</small></td></tr>
      ${cur.wholesale ? `<tr><td>도매 평균</td><td>${won(cur.wholesale.p)}<small>/${cur.base}</small></td></tr>` : ''}
      ${a ? `<tr><td>오늘 경매 평균${a.scope === 'item' ? '(품목 전체)' : ''} <small>(${a.markets.join('·') || '공영도매시장'}, ${a.n}건)</small></td><td>${won(a.avg)}<small>/${cur.base}</small></td></tr>
      <tr><td>경매 최저~최고</td><td>${won(a.min)} ~ ${won(a.max)}</td></tr>` : ''}
      ${r.percentile != null ? `<tr><td>최근 ${r.percentileDays}일 시세 대비</td><td>비싼 순위 상위 ${Math.max(1, 100 - r.percentile)}%</td></tr>` : ''}
    </table>`;
}

function chg(now, past) {
  const c = pct(now, past);
  if (c == null) return '<b>–</b>';
  return `<b class="${c > 0 ? 'up' : 'down'}">${c > 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%</b>`;
}

function renderTrend() {
  const box = $('trend'), p = cur.retail ?? cur.wholesale, h = (history[cur.id] ?? []).slice(-120);
  box.hidden = false;
  let pts = h.map((r) => r[1] ?? r[2]).filter(Boolean), xs = null, l0 = '', l1 = '';
  if (pts.length < 7) { // 누적 이력이 적으면 1년/1개월/1주/전일/현재 시세 5개 점으로 표시 (시간 비율 반영)
    const dp = [[-365, p.y1], [-30, p.m1], [-7, p.w1], [-1, p.d1], [0, p.p]].filter(([, v]) => v);
    pts = dp.map(([, v]) => v); const d0 = dp[0]?.[0] ?? 0; xs = dp.map(([d]) => (d - d0) / (-d0 || 1)); l0 = dp.length ? `${-dp[0][0]}일 전` : ''; l1 = '현재';
  } else { l0 = h[0][0].slice(5); l1 = h.at(-1)[0].slice(5); }
  let svg = '';
  if (pts.length >= 3) {
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
    const X = (i) => (xs ? xs[i] : i / (pts.length - 1)) * 300, Y = (v) => 80 - ((v - min) / span) * 70;
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join(' ');
    const dots = xs ? pts.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="var(--brand)" vector-effect="non-scaling-stroke"/>`).join('') : '';
    svg = `<svg class="spark" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label="소매가 추이">
      <path d="${d}" fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${dots}</svg>
      <div class="gl"><span>${l0}</span><span>최저 ${won(min)} · 최고 ${won(max)}</span><span>${l1}</span></div>`;
  }
  box.innerHTML = `<h2>${cur.display} 시세 변화 <small style="font-weight:400;color:var(--sub)">(소매${cur.retail ? '' : '→도매'})</small></h2>
    <div class="chg"><div>전일${chg(p.p, p.d1)}</div><div>1주 전${chg(p.p, p.w1)}</div><div>1개월 전${chg(p.p, p.m1)}</div><div>1년 전${chg(p.p, p.y1)}</div></div>${svg}`;
}

function reset() {
  cur = null; $('form').hidden = true; $('result').hidden = true; $('trend').hidden = true;
  $('list').hidden = false; $('cats').hidden = false; $('q').value = ''; $('q').focus(); renderList();
}

async function init() {
  $('venue').innerHTML = Object.entries(VENUES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('venue').value = store.get().venue ?? 'market';
  try { await load(); } catch { $('meta').textContent = '데이터를 불러오지 못했어요. 네트워크를 확인해 주세요.'; return; }
  renderMeta(); renderCats(); renderList();
  $('q').addEventListener('input', () => { if (cur) reset(); renderList(); });
  $('cats').addEventListener('click', (e) => { const c = e.target.dataset.c; if (c) { cat = c; renderCats(); renderList(); } });
  $('list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    select(data.items.find((i) => i.id === decodeURIComponent(li.dataset.id)));
  });
  ['price', 'qty', 'unit', 'venue'].forEach((id) => $(id).addEventListener('input', update));
  $('change').addEventListener('click', reset);
  const last = store.get().last; const it = data.items.find((i) => i.id === last); if (it) select(it);
}
init();

// ---- 가격표 촬영(OCR) ----
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/kor/4.0.0_best_int';
let worker;
function loadScript(src) {
  return new Promise((ok, no) => { if (window.Tesseract) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('엔진 로드 실패')); document.head.append(s); });
}
// 큰 사진은 줄이고 흑백·대비를 높여 인식률을 올린다
async function prep(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.4)'; g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
async function recognize(file, onProgress) {
  await loadScript(TESS);
  worker ??= await window.Tesseract.createWorker(['kor', 'eng'], 1, { langPath: LANG, logger: (m) => m.status === 'recognizing text' && onProgress(m.progress) });
  const { data } = await worker.recognize(await prep(file));
  return data.text;
}
function applyScan(text) {
  const r = parseTag(text, data.items);
  const box = $('ocr'); box.hidden = false;
  const item = r.matches[0];
  const raw = `<details><summary>인식된 글자 보기</summary><pre>${text.replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' }[c])) || '(없음)'}</pre></details>`;
  if (item) select(item);
  const bits = [];
  let warn = '';
  if (item) {
    bits.push(`품목 <b>${item.display}</b>`);
    if (r.matches.length > 1) bits.push(`<small>(비슷한 품목: ${r.matches.slice(1, 4).map((m) => m.display).join(', ')})</small>`);
  } else warn += '품목을 찾지 못했어요. 위 검색창에서 직접 골라주세요. ';
  if (r.prices.length) { $('price').value = r.prices[0]; bits.push(`가격 <b>${won(r.prices[0])}</b>`); } else warn += '가격을 읽지 못했어요. 직접 입력해 주세요. ';
  if (r.qty && r.unit) {
    if (item && unitsFor(item.base).includes(r.unit)) { $('qty').value = r.qty; $('unit').value = r.unit; bits.push(`수량 <b>${r.qty}${r.unit}</b>`); }
    else if (item) warn += `가격표의 단위(${r.qty}${r.unit})가 이 품목의 기준(${item.base})과 달라요. 수량·단위를 직접 확인하세요. `;
    if (r.perUnit) warn += '"~당" 단가로 보입니다. 수량이 맞는지 확인하세요. ';
  } else warn += '수량·단위를 읽지 못했어요. 확인해 주세요. ';
  const chips = r.prices.length > 1 ? `<div class="chips">${r.prices.map((p) => `<button class="chip" type="button" data-p="${p}">${won(p)}</button>`).join('')}</div><small>다른 가격이면 눌러서 바꾸세요</small>` : '';
  box.innerHTML = `<div>${bits.join(' · ') || '인식 결과가 없어요.'}</div>${warn ? `<div class="note">⚠️ ${warn}</div>` : '<small>⚠️ 인식 결과가 맞는지 확인하세요.</small>'}${chips}${raw}`;
  if (item) update();
}
$('ocr').addEventListener('click', (e) => { const p = e.target.dataset.p; if (p) { $('price').value = p; update(); } });
$('shot').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const box = $('ocr'); box.hidden = false;
  box.innerHTML = '글자를 읽는 중… <small>(처음에는 인식 데이터를 내려받느라 10~30초 걸려요)</small><div class="bar"><i id="pg"></i></div>';
  try { applyScan(await recognize(f, (p) => { const el = $('pg'); if (el) el.style.width = `${Math.round(p * 100)}%`; })); }
  catch (err) { box.innerHTML = `<div class="note">⚠️ 사진을 읽지 못했어요 (${err.message}). 인터넷 연결을 확인하거나 직접 입력해 주세요.</div>`; }
});

// PWA: 서비스워커 + 홈 화면 추가
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
let deferred;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('install').hidden = false; });
$('install').addEventListener('click', async () => { if (deferred) { deferred.prompt(); deferred = null; $('install').hidden = true; } });
