import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../docs/judge.js';
const item = { retail: { p: 2000 }, wholesale: { p: 1000 } };
test('판정 구간', () => {
  assert.equal(judge({ item, price: 3000, qty: 1.5, unit: 'kg' }).band.key, 'fair');      // 2000/kg
  assert.equal(judge({ item, price: 1500, qty: 1, unit: 'kg' }).band.key, 'great');
  assert.equal(judge({ item, price: 3000, qty: 1, unit: 'kg' }).band.key, 'bad');
  assert.equal(judge({ item, price: 1200, qty: 1, unit: '근' }).band.key, 'fair');         // 근=600g → 2000/kg
  assert.equal(judge({ item, price: 2300, qty: 1, unit: 'kg', venue: 'mart' }).band.key, 'fair'); // 마트 보정 2160
  assert.equal(judge({ item: {}, price: 1, qty: 1, unit: 'kg' }), null);
});
test('경고', () => {
  assert.ok(judge({ item, price: 800, qty: 1, unit: 'kg' }).notes.some((n) => n.includes('도매가')));
  assert.ok(judge({ item: { wholesale: { p: 1000 } }, price: 1500, qty: 1, unit: 'kg' }).estimated);
});
