// 가격표 사진 → 글자. 확대·대비·선명하게·기울기 보정·이진화로 여러 형태를 만들고, 여러 방식으로 읽어서 가장 잘 읽힌 결과를 고른다.
import { mean, invert, stretch, sharpen, adaptiveBinary, skewAngle } from './ocr-image.js';

export const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
export const LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/kor/4.0.0_best_int';
let worker = null;

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
export const loadScript = (src = TESS) => new Promise((ok, no) => {
  if (window.Tesseract) return ok();
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('인식 프로그램을 불러오지 못했어요')); document.head.append(s);
});
const STEP = { 'loading tesseract core': '인식 프로그램', 'loading language traineddata': '한국어 데이터', 'initializing tesseract': '준비', 'initializing api': '준비' };

/** 한국어 데이터만 쓴다(영어는 다른 꾸러미라 같은 주소에 없어 404 로 멈췄었음). 숫자·kg 는 한국어 모델로도 읽힌다 */
export async function getWorker(onStatus = () => {}) {
  if (worker) return worker;
  onStatus('인식 프로그램 불러오는 중', 0);
  await withTimeout(loadScript(), 60000, '인식 프로그램을 불러오지 못했어요');
  worker = await withTimeout(window.Tesseract.createWorker('kor', 1, {
    langPath: LANG,
    logger: (m) => { if (STEP[m.status]) onStatus(`${STEP[m.status]} 내려받는 중`, m.progress ?? 0); },
    errorHandler: (e) => console.error('ocr', e),
  }), 90000, '한국어 데이터를 받지 못했어요 (시간 초과)');
  return worker;
}

// ───────── 이미지 → 캔버스 ─────────
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/** 글자가 너무 작으면 키우고(긴 변 약 1900px), 너무 크면 줄인다(2200px) */
export function scaled(bmp) {
  const long = Math.max(bmp.width, bmp.height), k = long < 1500 ? 1900 / long : long > 2400 ? 2200 / long : 1;
  const c = canvasOf(Math.round(bmp.width * k), Math.round(bmp.height * k)), x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
function grayOf(c) {
  const { data, width: w, height: h } = c.getContext('2d').getImageData(0, 0, c.width, c.height), g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  return { g, w, h };
}
function canvasOfGray(g, w, h) {
  const c = canvasOf(w, h), x = c.getContext('2d'), im = x.createImageData(w, h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) { im.data[j] = im.data[j + 1] = im.data[j + 2] = g[i]; im.data[j + 3] = 255; }
  x.putImageData(im, 0, 0); return c;
}
function rotated(c, deg) {
  const r = (deg * Math.PI) / 180, s = Math.abs(Math.sin(r)), co = Math.abs(Math.cos(r));
  const w = Math.round(c.width * co + c.height * s), h = Math.round(c.width * s + c.height * co), o = canvasOf(w, h), x = o.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.translate(w / 2, h / 2); x.rotate(r); x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}

/** 원본 한 장 → {angle, enh(대비·선명), bin(적응형 이진화), raw(예전 방식: 흑백+대비)} */
export function makeVariants(src) {
  const base = scaled(src);
  let { g, w, h } = grayOf(base);
  if (mean(g) < 110) g = invert(g);                         // 어두운 바탕·밝은 글자 → 반전
  g = stretch(g);
  const bin0 = adaptiveBinary(g, w, h), angle = skewAngle(bin0, w, h);
  let cv = canvasOfGray(g, w, h);
  if (Math.abs(angle) >= 0.5) { cv = rotated(cv, angle); ({ g, w, h } = grayOf(cv)); }
  const enh = canvasOfGray(sharpen(g, w, h), w, h), bin = canvasOfGray(adaptiveBinary(g, w, h), w, h);
  const raw = canvasOf(base.width, base.height), rx = raw.getContext('2d'); rx.filter = 'grayscale(1) contrast(1.4)'; rx.drawImage(base, 0, 0);
  return { angle, enh, bin, raw };
}

// 읽는 순서: (형태, 페이지 분할 방식) — 6: 한 덩어리 글, 11: 흩어진 글, 3: 자동. 앞쪽에서 충분히 잘 읽히면 멈춘다.
export const PASSES = [['enh', '6'], ['bin', '6'], ['enh', '11'], ['bin', '11'], ['raw', '3']];

/**
 * 사진(File/Blob/캔버스/ImageBitmap)을 읽는다.
 * parse(text) → { score, complete }: 읽은 글자가 얼마나 쓸모 있는지(품목·가격·수량을 찾았는지) 판단하는 함수. 가장 점수가 높은 결과를 돌려준다.
 */
export async function recognize(source, { onStatus = () => {}, parse = () => ({ score: 0, complete: false }), passes = PASSES } = {}) {
  const w = await getWorker(onStatus);
  const bmp = source instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) ? source : await createImageBitmap(source);
  onStatus('사진을 보정하는 중', 0);
  const v = makeVariants(bmp);
  let best = null; const tried = [];
  for (const [i, [name, psm]] of passes.entries()) {
    onStatus(`글자를 읽는 중 (${i + 1}/${passes.length})`, i / passes.length);
    await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await withTimeout(w.recognize(v[name]), 90000, '글자 읽기가 너무 오래 걸려요');
    const p = parse(data.text), conf = data.confidence ?? 0, rank = (p.score ?? 0) + conf / 1000;
    tried.push({ name, psm, score: p.score ?? 0, conf: Math.round(conf), complete: !!p.complete });
    if (!best || rank > best.rank) best = { text: data.text, conf, rank, name, psm };
    if (p.complete && conf >= 60) break;                    // 충분히 잘 읽힘 → 나머지는 건너뜀
  }
  return { text: best.text, conf: best.conf, pass: `${best.name}/${best.psm}`, angle: v.angle, tried };
}
