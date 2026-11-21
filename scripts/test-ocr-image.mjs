import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, invert, stretch, boxBlur, sharpen, adaptiveBinary, skewAngle } from '../docs/ocr-image.js';

// 가로 글줄 3개(두께 4)가 있는 이진 이미지 → 각도 β 만큼 canvas 방식으로 돌린 점들로 이미지 만들기
function stripes(w, h, beta = 0) {
  const g = new Uint8ClampedArray(w * h).fill(255);
  const th = (beta * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  for (const y0 of [h * 0.3, h * 0.5, h * 0.7]) for (let dy = 0; dy < 4; dy++) for (let x = w * 0.1; x < w * 0.9; x += 0.5) {
    const px = x - w / 2, py = y0 + dy - h / 2;
    const X = Math.round(px * c - py * s + w / 2), Y = Math.round(px * s + py * c + h / 2);   // ctx.rotate(β) 와 같은 변환
    if (X >= 0 && X < w && Y >= 0 && Y < h) g[Y * w + X] = 0;
  }
  return g;
}

test('기울기 추정: 돌려놓은 글줄을 바로잡는 각도(= -β)를 찾는다', () => {
  for (const beta of [-9, -5, -2, 0, 3, 6, 9]) {
    const a = skewAngle(stripes(400, 240, beta), 400, 240);
    assert.ok(Math.abs(a - -beta) <= 0.75, `β=${beta} → 추정 ${a}`);
  }
});
test('기울기 추정: 글자가 거의 없으면 0', () => {
  assert.equal(skewAngle(new Uint8ClampedArray(100 * 100).fill(255), 100, 100), 0);
});
test('대비 늘리기·반전·평균', () => {
  const g = Uint8ClampedArray.from({ length: 1000 }, (_, i) => 100 + (i % 50));   // 100~149 의 좁은 밝기
  const s = stretch(g); assert.ok(Math.min(...s) <= 5 && Math.max(...s) >= 250);
  assert.deepEqual([...invert(Uint8ClampedArray.of(0, 255, 100))], [255, 0, 155]);
  assert.equal(mean(Uint8ClampedArray.of(0, 100, 200, 100)), 100);
  assert.deepEqual([...stretch(new Uint8ClampedArray(50).fill(128))], new Array(50).fill(128));  // 단색은 그대로
});
test('흐림·선명하게는 크기 유지, 평평한 이미지는 그대로', () => {
  const g = new Uint8ClampedArray(30 * 20).fill(90);
  assert.ok([...boxBlur(g, 30, 20, 3)].every((v) => Math.abs(v - 90) < 1e-3));
  assert.ok([...sharpen(g, 30, 20)].every((v) => v === 90));
});
test('적응형 이진화: 한쪽이 그림자로 어두워도 글자(획)만 검게', () => {
  const w = 200, h = 100, g = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x < 100 ? 220 : 120;   // 오른쪽 절반은 그림자(배경이 어두움)
  for (let y = 40; y < 60; y++) for (const x0 of [30, 150]) for (let x = x0; x < x0 + 6; x++) g[y * w + x] = x0 < 100 ? 40 : 20;  // 양쪽에 세로 획
  const b = adaptiveBinary(g, w, h, { win: 41 });
  assert.equal(b[50 * w + 32], 0); assert.equal(b[50 * w + 152], 0);       // 획은 검게
  assert.equal(b[10 * w + 20], 255); assert.equal(b[10 * w + 180], 255);   // 어두운 그림자 배경도 흰색으로
  assert.equal(b[50 * w + 80], 255); assert.equal(b[50 * w + 120], 255);
});
