// 가격표 사진 전처리용 순수 함수 (DOM 없음 → Node 에서 테스트 가능)
// g: 그레이 픽셀 Uint8ClampedArray(0~255), w·h: 가로·세로. 이진 이미지는 글자=0, 배경=255.

/** 평균 밝기 */
export function mean(g) { let s = 0; for (let i = 0; i < g.length; i++) s += g[i]; return s / g.length; }

/** 색 반전(어두운 바탕에 밝은 글자인 가격표용) */
export function invert(g) { const o = new Uint8ClampedArray(g.length); for (let i = 0; i < g.length; i++) o[i] = 255 - g[i]; return o; }

/** 대비 늘리기: 아래 lo%·위 hi% 밝기를 0과 255로 */
export function stretch(g, lo = 2, hi = 98) {
  const hist = new Uint32Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const at = (p) => { const t = (g.length * p) / 100; let c = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= t) return v; } return 255; };
  const a = at(lo), b = at(hi);
  if (b - a < 8) return Uint8ClampedArray.from(g); // 거의 단색이면 그대로
  const o = new Uint8ClampedArray(g.length), k = 255 / (b - a);
  for (let i = 0; i < g.length; i++) o[i] = (g[i] - a) * k;
  return o;
}

/** 상자 흐림(가로·세로 분리) — 선명하게 하기와 흐림 배경 추정에 사용 */
export function boxBlur(g, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += g[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += g[row + Math.min(w - 1, x + r + 1)] - g[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** 선명하게(unsharp mask) */
export function sharpen(g, w, h, amount = 1.3, r = 2) {
  const b = boxBlur(g, w, h, r), o = new Uint8ClampedArray(g.length);
  for (let i = 0; i < g.length; i++) o[i] = g[i] + amount * (g[i] - b[i]);
  return o;
}

/**
 * 적응형 이진화(Bradley–Roth): 주변 평균보다 t 비율 이상 어두운 픽셀만 글자(0). 반사·그림자처럼 밝기가 고르지 않은 사진에 강함.
 * win: 주변 창 크기(홀수 권장, 기본은 짧은 변의 1/12)
 */
export function adaptiveBinary(g, w, h, { win = 0, t = 0.15 } = {}) {
  const s = Math.max(15, win || Math.round(Math.min(w, h) / 12)), half = s >> 1;
  const W = w + 1, I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
  const o = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = I[(y1 + 1) * W + x1 + 1] - I[y0 * W + x1 + 1] - I[(y1 + 1) * W + x0] + I[y0 * W + x0];
      o[y * w + x] = g[y * w + x] * cnt < sum * (1 - t) ? 0 : 255;
    }
  }
  return o;
}

/**
 * 글줄 기울기 추정. 이미지를 canvas 의 ctx.rotate(각도) 로 돌렸을 때 글줄이 수평이 되는 각도(도)를 돌려준다.
 * 방법: 돌린 뒤 y' = x·sinθ + y·cosθ 가 한 줄에 몰릴수록(히스토그램 제곱합 최대) 수평이다.
 */
export function skewAngle(bin, w, h, { range = 10, step = 1, maxPoints = 80000 } = {}) {
  const xs = [], ys = []; let dark = 0;
  for (let i = 0; i < bin.length; i++) if (bin[i] === 0) dark++;
  if (dark < 50) return 0;
  const every = Math.max(1, Math.floor(dark / maxPoints)); let k = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x] === 0 && k++ % every === 0) { xs.push(x - w / 2); ys.push(y - h / 2); }
  const off = w + h, size = 2 * off + 2;
  const score = (deg) => {
    const th = (deg * Math.PI) / 180, s = Math.sin(th), c = Math.cos(th), hist = new Uint32Array(size);
    for (let i = 0; i < xs.length; i++) hist[Math.round(xs[i] * s + ys[i] * c) + off]++;
    let sc = 0; for (let i = 0; i < size; i++) sc += hist[i] * hist[i];
    return sc;
  };
  let best = 0, bs = -1;
  for (let a = -range; a <= range + 1e-9; a += step) { const sc = score(a); if (sc > bs) { bs = sc; best = a; } }
  for (let a = best - step; a <= best + step + 1e-9; a += step / 4) { const sc = score(a); if (sc > bs) { bs = sc; best = a; } }
  return Math.round(best * 100) / 100;
}
