import { judge, VENUES, unitsFor, pct } from './judge.js';

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
      <div class="pin" style="left:${pos(r.ratio)}%">내 가격</div></div>
    <div class="gl"><span>싸다</span><span>적정 구간</span><span>비싸다</span></div>
    ${r.notes.map((n) => `<div class="note">⚠️ ${n}</div>`).join('')}
    <table>
      <tr><td>적정가(구매처 반영)</td><td><b>${won(r.fairLow)} ~ ${won(r.fairHigh)}</b><small>/${cur.base}</small></td></tr>
      <tr><td>전국 소매 평균${r.estimated ? ' (추정)' : ''}</td><td>${won(r.ref)}<small>/${cur.base}</small></td></tr>
      ${cur.wholesale ? `<tr><td>도매 평균</td><td>${won(cur.wholesale.p)}<small>/${cur.base}</small></td></tr>` : ''}
      ${a ? `<tr><td>오늘 경매 평균 <small>(${a.markets.join('·') || '공영도매시장'}, ${a.n}건)</small></td><td>${won(a.avg)}<small>/${cur.base}</small></td></tr>
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
  const pts = h.map((r) => r[1] ?? r[2]).filter(Boolean);
  let svg = '';
  if (pts.length >= 3) {
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * 300},${80 - ((v - min) / span) * 70}`).join(' ');
    svg = `<svg class="spark" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label="최근 소매가 추이">
      <path d="${d}" fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
      <div class="gl"><span>${h[0][0].slice(5)}</span><span>최저 ${won(min)} · 최고 ${won(max)}</span><span>${h.at(-1)[0].slice(5)}</span></div>`;
  }
  box.innerHTML = `<h2>${cur.display} 시세 변화 <small style="font-weight:400;color:var(--sub)">(소매${cur.retail ? '' : '→도매'})</small></h2>
    <div class="chg"><div>전일 대비${chg(p.p, p.d1)}</div><div>1개월 전 대비${chg(p.p, p.m1)}</div><div>1년 전 대비${chg(p.p, p.y1)}</div></div>${svg}`;
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

// PWA: 서비스워커 + 홈 화면 추가
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
let deferred;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('install').hidden = false; });
$('install').addEventListener('click', async () => { if (deferred) { deferred.prompt(); deferred = null; $('install').hidden = true; } });
