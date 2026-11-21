import { judge, VENUES, unitsFor, factorFor, pct } from './judge.js';
import { parseTag } from './ocr-parse.js';
import { parsePack } from './pack.js';
import { computeDeals } from './deals.js';
import { inSeason, seasonalNow } from './season.js';
import { suggestRecipes } from './recipes.js';
import { emojiFor, catEmoji, catLabel, HIDDEN, POPULAR } from './emoji.js';

const $ = (id) => document.getElementById(id);
const won = (n) => (n == null ? '–' : Math.round(n).toLocaleString('ko-KR') + '원');
const won10 = (n) => won(Math.round(n / 10) * 10);
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const KEY = 'pc:v2';
const store = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
  set: (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...store.get(), ...o })); } catch {} },
};
const VENUE_EMOJI = { market: '🏪', mart: '🛒', online: '📦', small: '🏬', farm: '🌾' };
const VENUE_LABEL = { market: '시장·동네가게', mart: '대형마트', online: '온라인', small: '편의점', farm: '직거래' };

let data = { items: [] }, history = {}, groups = new Map(), cat = '전체', cur = null, curPack = null, venue = store.get().venue ?? 'market';
let mode = ({ easy: 'easy', normal: 'normal' })[new URLSearchParams(location.search).get('v')] ?? store.get().mode ?? 'normal';

async function load() {
  const [l, h] = await Promise.all([
    fetch('data/latest.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/history.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})),
  ]);
  data = l; history = h;
  groups = new Map();
  for (const it of data.items) {
    if (HIDDEN.has(it.name)) continue;
    if (!groups.has(it.name)) groups.set(it.name, []);
    groups.get(it.name).push(it);
  }
  // 소매가 있는 것, 상품 등급 우선
  for (const arr of groups.values()) arr.sort((a, b) => (!!b.retail - !!a.retail) || ((/상품/.test(b.display)) - (/상품/.test(a.display))));
}

/* ---------- 오늘의 추천 (싸진 품목·메뉴·제철) ---------- */
const kst = new Date(Date.now() + 9 * 3600e3), MONTH = kst.getUTCMonth() + 1, DAYSEED = Math.floor(kst / 864e5);
let deals = null, recos = [], recoPage = 0;
const pctTxt = (n) => `${Math.abs(n).toFixed(0)}%`;
function renderReco() {
  deals = computeDeals(groups, MONTH);
  const row = (r, dir) => `<button class="deal" data-n="${esc(r.name)}"><span class="e">${emojiFor(r.name, r.item.category)}</span>
    <b>${esc(r.name)}${r.seasonal ? '<span class="badge">제철</span>' : ''}</b><small>${r.kind === 'wholesale' ? '도매 ' : ''}${won(r.price)}/${r.item.base} · ${r.since} 대비</small>
    <span class="c ${dir}">${dir === 'd' ? '▼' : '▲'} ${pctTxt(r.chg)}</span></button>`;
  $('dealsDown').innerHTML = deals.down.slice(0, 10).map((r) => row(r, 'd')).join('') || '<p class="empty">오늘은 눈에 띄게 내린 품목이 없어요.</p>';
  $('dealsUp').innerHTML = deals.up.slice(0, 8).map((r) => row(r, 'u')).join('') || '<p class="empty">없어요.</p>';
  $('monthLbl').textContent = `(${MONTH}월)`;
  $('seasonal').innerHTML = seasonalNow(MONTH).filter((n) => groups.has(n)).map((n) => {
    const d = deals.all.get(n);
    return `<button class="chip" type="button" data-n="${esc(n)}">${emojiFor(n, groups.get(n)[0].category)} ${esc(n)}${d && d.chg <= -3 ? ` <small>▼${pctTxt(d.chg)}</small>` : ''}</button>`;
  }).join('') || '<p class="empty">정보가 없어요.</p>';
  recos = suggestRecipes(deals.all, new Set(groups.keys()), MONTH, DAYSEED).slice(0, 12); recoPage = 0; renderRecipes();
}
function renderRecipes() {
  const list = recos.slice(recoPage * 3, recoPage * 3 + 3);
  $('moreRecipe').hidden = recos.length <= 3;
  $('recipes').innerHTML = list.map((r) => {
    const w = r.reason.type === 'down' ? `${emojiFor(r.reason.name, '')} <b class="g">${esc(r.reason.name)}</b>가 ${r.reason.since}보다 <b class="g">${pctTxt(r.reason.pct)} 싸졌어요</b>`
      : r.reason.type === 'season' ? `🌿 지금 제철인 <b class="g">${esc(r.reason.name)}</b>로 만들어요` : '시세가 안정적인 재료로 만들어요';
    const chips = r.mains.map((n) => { const d = deals.all.get(n); const k = d && d.chg <= -3 ? 'd' : d && d.chg >= 3 ? 'u' : ''; return `<button class="ingc ${k}" type="button" data-n="${esc(n)}">${esc(n)}${k ? `<i>${k === 'd' ? '▼' : '▲'}${pctTxt(d.chg)}</i>` : ''}</button>`; }).join('');
    const q = encodeURIComponent(`${r.n} 레시피`);
    return `<article class="recipe"><div class="rh"><span class="e">${r.e}</span><div><b>${esc(r.n)}</b><small>${esc(r.t)} · ${esc(r.lv)}</small></div></div>
      <p class="why">${w}</p><div class="ing">${chips}</div>
      <p class="etc">그 밖에: ${esc(r.etc.join(', '))}</p><p class="tip">💡 ${esc(r.tip)}</p>
      <a class="rlink" href="https://search.naver.com/search.naver?query=${q}" target="_blank" rel="noopener">📖 만드는 법 검색하기</a></article>`;
  }).join('') || '<p class="empty">오늘 추천할 메뉴를 찾지 못했어요.</p>';
}
function setTab(t) {
  $('check').hidden = t !== 'check'; $('reco').hidden = t !== 'reco';
  document.querySelectorAll('.tabs [data-t]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
  scrollTo({ top: 0 });
}
function goCheck(name) { setTab('check'); pickGroup(name); $('price').focus({ preventScroll: true }); $('s2').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

/* ---------- 상단 ---------- */
function renderMeta() {
  if (data.source === 'sample') { $('meta').innerHTML = '<span class="demo">샘플 데이터</span> 실제 시세가 아니에요'; return; }
  const d = data.updated ? new Date(data.updated) : null;
  const t = d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${d.getUTCHours()}시 기준` : '';
  $('meta').textContent = `${t} · 전국 평균 시세`;
}

/* ---------- 1단계: 품목 고르기 ---------- */
function renderCats() {
  const ORDER = ['채소류', '과일류', '식량작물', '축산물', '수산물', '특용작물'];
  const cats = ['전체', ...[...new Set([...groups.values()].map((a) => a[0].category).filter(Boolean))].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y))];
  $('cats').innerHTML = cats.map((c) => `<button class="tile" role="tab" aria-selected="${c === cat}" data-c="${esc(c)}"><span class="e">${c === '전체' ? '🛒' : catEmoji(c)}</span>${c === '전체' ? '전체' : esc(catLabel(c))}</button>`).join('');
}
function bestOf(arr) { const it = arr[0]; return it.retail ?? it.wholesale; }
function renderGrid() {
  const q = $('q').value.trim().replace(/\s+/g, '');
  let names = [...groups.keys()].filter((n) => (cat === '전체' || groups.get(n)[0].category === cat) && (!q || n.replace(/\s+/g, '').includes(q)));
  const popular = !q && cat === '전체';
  if (popular) {
    const pick = POPULAR.map((p) => names.find((n) => n === p)).filter(Boolean);
    names = pick.length >= 6 ? pick : names;
  }
  names.sort((a, b) => (popular ? 0 : a.localeCompare(b, 'ko')));
  const rec = (store.get().recent ?? []).filter((n) => groups.has(n));
  $('recent').hidden = !(popular && rec.length);
  $('recentChips').innerHTML = rec.map((n) => `<button class="chip" type="button" data-n="${esc(n)}">${emojiFor(n, groups.get(n)[0].category)} ${esc(n)}</button>`).join('');
  $('gridTitle').textContent = q ? `"${$('q').value.trim()}" 검색 결과` : popular ? '자주 찾는 품목 (더 보려면 위에서 분류를 누르세요)' : `${catLabel(cat)} 전체`;
  $('grid').innerHTML = names.length ? names.map((n) => {
    const arr = groups.get(n), p = bestOf(arr);
    return `<button class="pick" data-n="${esc(n)}"><span class="e">${emojiFor(n, arr[0].category)}</span><b>${esc(n)}</b><small>${won(p.p)}/${arr[0].base}</small></button>`;
  }).join('') : '<p class="empty">찾는 품목이 없어요.<br>다른 이름으로 찾아보세요.</p>';
}

function pickGroup(name, preferItem) {
  const arr = groups.get(name); if (!arr) return;
  chooseItem(preferItem && arr.includes(preferItem) ? preferItem : arr[0], arr);
  store.set({ last: name, recent: [name, ...(store.get().recent ?? []).filter((n) => n !== name)].slice(0, 6) });
}
function chooseItem(item, arr = groups.get(item.name)) {
  cur = item;
  $('chooser').hidden = true; $('pickedBox').hidden = false;
  $('pEmoji').textContent = emojiFor(item.name, item.category);
  $('pName').textContent = item.name;
  $('variants').innerHTML = arr.length > 1 ? arr.map((it, i) => {
    const lab = it.display.replace(item.name, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim() || '기본';
    return `<button class="chip" type="button" aria-pressed="${it === item}" data-i="${i}">${esc(lab)}${it.retail ? '' : ' ·추정'}</button>`;
  }).join('') : '';
  $('variants').hidden = arr.length < 2;
  // 단위/수량 프리셋
  const base = item.base;
  const presets = base === 'kg'
    ? [['500g', 500, 'g'], ['1근(600g)', 1, '근'], ['1kg', 1, 'kg'], ['2kg', 2, 'kg'], ['3kg', 3, 'kg'], ['5kg', 5, 'kg'], ['10kg', 10, 'kg']]
    : [1, 2, 3, 5, 10].map((n) => [`${n}${base}`, n, base]);
  $('presets').innerHTML = presets.map(([l, q, u]) => `<button class="chip" type="button" aria-pressed="false" data-q="${q}" data-u="${u}">${l}</button>`).join('');
  $('unit').innerHTML = unitsFor(base).map((u) => `<option>${u}</option>`).join('');
  curPack = base === 'kg' ? parsePack(item.vrty ?? item.display.match(/\((.*)\)/)?.[1]) : null;
  $('qtyBox').hidden = !!curPack; $('packNote').hidden = !curPack;
  if (curPack) {
    const per = (item.retail ?? item.wholesale)?.p;
    $('packNote').innerHTML = `📦 <b>${curPack.label}</b> 한 포(포대) 가격을 위 칸에 넣어 주세요.${per ? ` <small>(1kg로 따지면 약 ${won(per)})</small>` : ''}`;
    setQty([curPack.qty, 'kg']);
  } else setQty(store.get().qty?.[base] ?? (base === 'kg' ? [1, 'kg'] : [1, base]));
  $('priceLbl').textContent = curPack ? `${curPack.label} 한 포 가격` : '파는 가격';
  $('s2').hidden = false;
  update();
}
function setQty([q, u]) {
  $('qty').value = q; $('unit').value = u;
  document.querySelectorAll('#presets .chip').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.q) === Number(q) && b.dataset.u === u)));
}
function reset() {
  cur = null; $('chooser').hidden = false; $('pickedBox').hidden = true; $('s2').hidden = true; $('s3').hidden = true;
  $('price').value = ''; $('q').value = ''; $('ocr').hidden = true; renderGrid(); scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 2·3단계: 판정 ---------- */
const SAY = { great: '아주 싸요!', good: '싼 편이에요', fair: '적당한 가격이에요', high: '조금 비싸요', bad: '너무 비싸요!' };
function unitView(unit, base) { // 사용자가 고른 단위(또는 포장 단위)에 맞춰 보여주기
  if (curPack) return { k: curPack.qty, label: curPack.label };
  if (base !== 'kg') return { k: 1, label: `1${base}` };
  if (unit === '근') return { k: 0.6, label: '1근' };
  if (unit === 'g') return { k: 0.1, label: '100g' };
  return { k: 1, label: '1kg' };
}
function update() {
  if (!cur) return;
  const price = Number($('price').value), qty = Number($('qty').value), unit = $('unit').value;
  store.set(curPack ? { venue } : { venue, qty: { ...store.get().qty, [cur.base]: [qty, unit] } });
  const s3 = $('s3');
  const r = judge({ item: cur, price, qty, unit, venue, history: history[cur.id] ?? [] });
  if (!price) { s3.hidden = true; return; }
  s3.hidden = false;
  if (!r) { $('result').innerHTML = '<p>이 품목은 시세 정보가 부족해서 판정하기 어려워요.</p>'; return; }
  const v = unitView(unit, cur.base), a = cur.auction;
  const abs = Math.abs(r.diffPct);
  const dtxt = abs < 5 ? '오늘 보통 가격과 비슷해요' : `오늘 보통 가격보다 ${abs.toFixed(0)}% ${r.diffPct > 0 ? '비싸요' : '싸요'}`;
  const total = r.center * qty * factorFor(unit), extra = price - total;
  const ttxt = Math.abs(extra) < 100 ? '' : extra > 0
    ? `같은 양을 보통 가격에 사면 약 <b>${won10(total)}</b> (지금보다 <b>${won10(extra)}</b> 절약)`
    : `보통 가격(약 ${won10(total)})보다 <b>${won10(-extra)}</b> 아낀 셈이에요`;
  const pos = (x) => Math.min(100, Math.max(0, ((x - 0.6) / 1.0) * 100));
  const lowR = r.fairLow / r.center, highR = r.fairHigh / r.center;
  const fairLo = r.fairLow * v.k, fairHi = r.fairHigh * v.k;
  $('result').innerHTML = `
    <div class="res ${r.band.key}">
      <div class="e">${r.band.emoji}</div>
      <div class="t">${SAY[r.band.key]}</div>
      <div class="d">${dtxt}</div>
      <p class="advice">${esc(r.band.msg)}</p>
      <div class="cmp"><div><small>내가 사려는 값 (${v.label})</small><b>${won(r.mine * v.k)}</b></div>
        <div><small>이 정도면 적당해요 (${v.label})</small><b>${won(fairLo)} ~ ${won(fairHi)}</b></div></div>
      ${ttxt ? `<p class="advice">${ttxt}</p>` : ''}
      <div class="gauge"><div class="fairbox" style="left:${pos(lowR)}%;width:${pos(highR) - pos(lowR)}%"></div>
        <div class="pin" style="left:${Math.min(88, Math.max(12, pos(r.ratio)))}%">내 가격</div></div>
      <div class="gl"><span>싸다</span><span>적당</span><span>비싸다</span></div>
      ${r.notes.map((n) => `<div class="note">⚠️ ${esc(n)}</div>`).join('')}
    </div>
    <details class="more"${mode === 'normal' ? ' open' : ''}><summary>자세히 보기 (시세 비교·변화)</summary>
      <table>
        <tr><td>전국 소매 평균${r.estimated ? ' (추정)' : ''}</td><td>${won(r.ref * v.k)}<small>/${v.label}</small></td></tr>
        ${cur.wholesale ? `<tr><td>도매 평균 <small>(시장 상인이 떼오는 값)</small></td><td>${won(cur.wholesale.p * v.k)}<small>/${v.label}</small></td></tr>` : ''}
        ${a ? `<tr><td>오늘 경매 평균${a.scope === 'item' ? '(품목 전체)' : ''} <small>(${esc(a.markets.join('·') || '공영도매시장')}, ${a.n}건)</small></td><td>${won(a.avg * v.k)}<small>/${v.label}</small></td></tr>` : ''}
        ${r.percentile != null ? `<tr><td>최근 ${r.percentileDays}일 중 내 가격 순위</td><td>비싼 쪽 상위 ${Math.max(1, 100 - r.percentile)}%</td></tr>` : ''}
      </table>
      ${trendHtml()}
    </details>
    <button class="btn-sub restart" id="again" type="button">🔄 다른 물건 확인하기</button>`;
  $('again').addEventListener('click', reset);
}

/* ---------- 시세 변화 ---------- */
function chg(now, past) {
  const c = pct(now, past);
  if (c == null) return '<b>–</b>';
  return `<b class="${c > 0 ? 'up' : 'down'}">${c > 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%</b>`;
}
function trendHtml() {
  const p = cur.retail ?? cur.wholesale, h = (history[cur.id] ?? []).slice(-120);
  let pts = h.map((r) => r[1] ?? r[2]).filter(Boolean), xs = null, l0 = '', l1 = '';
  if (pts.length < 7) {
    const dp = [[-365, p.y1], [-30, p.m1], [-7, p.w1], [-1, p.d1], [0, p.p]].filter(([, v]) => v);
    const d0 = dp[0]?.[0] ?? 0; pts = dp.map(([, v]) => v); xs = dp.map(([d]) => (d - d0) / (-d0 || 1));
    l0 = dp.length ? `${-d0}일 전` : ''; l1 = '오늘';
  } else { l0 = h[0][0].slice(5); l1 = h.at(-1)[0].slice(5); }
  let svg = '';
  if (pts.length >= 3) {
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
    const X = (i) => 6 + (xs ? xs[i] : i / (pts.length - 1)) * 288, Y = (v) => 80 - ((v - min) / span) * 70;
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join(' ');
    const dots = xs ? pts.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="var(--brand)"/>`).join('') : '';
    svg = `<svg class="spark" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label="가격 변화 그래프"><path d="${d}" fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${dots}</svg>
      <div class="gl"><span>${l0}</span><span>최저 ${won(min)} · 최고 ${won(max)}</span><span>${l1}</span></div>`;
  }
  return `<div class="h3">${esc(cur.display)} 가격 변화 <small>(1kg 기준)</small></div>
    <div class="chg"><div>어제${chg(p.p, p.d1)}</div><div>1주 전${chg(p.p, p.w1)}</div><div>1달 전${chg(p.p, p.m1)}</div><div>1년 전${chg(p.p, p.y1)}</div></div>${svg}`;
}

/* ---------- 가격표 촬영(OCR) ---------- */
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/kor/4.0.0_best_int';
let worker;
const loadScript = (src) => new Promise((ok, no) => { if (window.Tesseract) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('인식 프로그램을 불러오지 못했어요')); document.head.append(s); });
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
  return (await worker.recognize(await prep(file))).data.text;
}
function applyScan(text) {
  const r = parseTag(text, [...groups.values()].flat());
  const box = $('ocr'); box.hidden = false;
  const item = r.matches[0];
  const raw = `<details><summary>읽은 글자 보기</summary><pre>${esc(text) || '(없음)'}</pre></details>`;
  const bits = []; let warn = '';
  if (item) { pickGroup(item.name, item); bits.push(`${emojiFor(item.name, item.category)} <b>${esc(item.name)}</b>`); }
  else warn += '품목을 못 찾았어요. 아래에서 직접 골라주세요. ';
  if (r.prices.length) { $('price').value = r.prices[0]; bits.push(`<b>${won(r.prices[0])}</b>`); } else warn += '가격을 못 읽었어요. 직접 입력해 주세요. ';
  if (r.qty && r.unit) {
    if (item && unitsFor(item.base).includes(r.unit)) { setQty([r.qty, r.unit]); bits.push(`<b>${r.qty}${r.unit}</b>`); }
    else if (item) warn += `가격표 단위(${r.qty}${r.unit})가 달라요. 수량을 확인해 주세요. `;
    if (r.perUnit) warn += '"~당" 가격으로 보여요. 수량을 확인해 주세요. ';
  } else if (item) warn += '수량을 못 읽었어요. 확인해 주세요. ';
  const chips = r.prices.length > 1 ? `<p class="lbl">다른 가격이면 눌러주세요</p><div class="chips wrap">${r.prices.map((p) => `<button class="chip" type="button" data-p="${p}">${won(p)}</button>`).join('')}</div>` : '';
  const html = `<div>${bits.join(' · ') || '읽은 내용이 없어요.'}</div>${warn ? `<div class="note">⚠️ ${esc(warn)}</div>` : '<small>⚠️ 맞게 읽었는지 꼭 확인해 주세요.</small>'}${chips}${raw}`;
  // 품목을 찾으면 선택 화면이 닫히므로 2단계 위에 결과를 보여준다
  const holder = item ? ($('ocr2') ?? (() => { const d = document.createElement('div'); d.id = 'ocr2'; d.className = 'note'; d.style.cssText = 'background:var(--tint);color:var(--ink)'; $('s2').prepend(d); return d; })()) : box;
  holder.innerHTML = html; if (item) { box.hidden = true; update(); }
}

/* ---------- 화면 버전(일반/쉬운) ---------- */
function applyMode() {
  document.documentElement.dataset.mode = mode;
  document.querySelectorAll('.mode [data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
}

/* ---------- 이벤트 ---------- */
function bind() {
  applyMode();
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); });
  $('reco').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) goCheck(b.dataset.n); });
  $('moreRecipe').addEventListener('click', () => { recoPage = (recoPage + 1) % Math.ceil(recos.length / 3); renderRecipes(); });
  document.querySelector('.mode').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return; mode = b.dataset.m; store.set({ mode }); applyMode(); update(); });
  $('recentChips').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { pickGroup(b.dataset.n); $('s2').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  $('q').addEventListener('input', renderGrid);
  $('cats').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { cat = b.dataset.c; renderCats(); renderGrid(); } });
  $('grid').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { pickGroup(b.dataset.n); $('price').focus({ preventScroll: true }); $('s2').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  $('variants').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) chooseItem(groups.get(cur.name)[Number(b.dataset.i)]); });
  $('presets').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { setQty([Number(b.dataset.q), b.dataset.u]); update(); } });
  $('venues').innerHTML = Object.keys(VENUES).map((k) => `<button class="chip" type="button" data-v="${k}" aria-pressed="${k === venue}">${VENUE_EMOJI[k]} ${VENUE_LABEL[k]}</button>`).join('');
  $('venues').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; venue = b.dataset.v; document.querySelectorAll('#venues .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); update(); });
  $('price').addEventListener('input', update);
  $('qty').addEventListener('input', () => { setQty([Number($('qty').value), $('unit').value]); update(); });
  $('unit').addEventListener('input', () => { setQty([Number($('qty').value), $('unit').value]); update(); });
  $('change').addEventListener('click', reset);
  document.body.addEventListener('click', (e) => { const p = e.target.closest('#ocr [data-p], #ocr2 [data-p]'); if (p) { $('price').value = p.dataset.p; update(); } });
  $('shot').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const box = $('ocr'); box.hidden = false; $('chooser').hidden = false; $('pickedBox').hidden = true;
    box.innerHTML = '글자를 읽고 있어요… <small>(처음에는 10~30초 걸려요)</small><div class="bar"><i id="pg"></i></div>';
    try { applyScan(await recognize(f, (p) => { const el = $('pg'); if (el) el.style.width = `${Math.round(p * 100)}%`; })); }
    catch (err) { box.innerHTML = `<div class="note">⚠️ 사진을 읽지 못했어요 (${esc(err.message)}). 인터넷 연결을 확인하거나 직접 골라주세요.</div>`; }
  });
  // 글씨 크기
  const apply = (x) => { if (x) document.documentElement.dataset.size = 'xl'; else delete document.documentElement.dataset.size; };
  apply(store.get().xl);
  $('size').addEventListener('click', () => { const x = !store.get().xl; store.set({ xl: x }); apply(x); });
}

async function init() {
  bind();
  try { await load(); } catch { $('meta').textContent = '시세를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'; return; }
  renderMeta(); renderCats(); renderGrid(); renderReco();
  if (new URLSearchParams(location.search).get('tab') === 'reco') setTab('reco');
}
init();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
let deferred;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('install').hidden = false; });
$('install').addEventListener('click', async () => { if (deferred) { deferred.prompt(); deferred = null; $('install').hidden = true; } });
