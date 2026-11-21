import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMON, commonPrice } from '../docs/units.js';
test('라벨·가격', () => {
  assert.equal(COMMON['쌀'].label, '20kg');
  assert.equal(COMMON['배추'].label, '1포기(약 2.5kg)');
  assert.equal(COMMON['오이'].label, '1개(약 200g)');
  assert.equal(COMMON['양파'].label, '1망(약 3kg)');
  assert.deepEqual([commonPrice('쌀', 3168).price, commonPrice('쌀', 3168).approx], [63360, false]);
  assert.deepEqual([commonPrice('배추', 2300).price, commonPrice('배추', 2300).approx], [5750, true]);
  assert.equal(commonPrice('양파', 1792).price, 5380);
  assert.equal(commonPrice('모르는품목', 1000), null);
});
test('실제 데이터에 품목 이름이 존재', (t) => {
  let d; try { d = JSON.parse(readFileSync(new URL('../docs/data/latest.json', import.meta.url), 'utf8')); } catch { return t.skip(); }
  if (d.source === 'sample') return t.skip();
  const have = new Set(d.items.map((i) => i.name));
  assert.deepEqual(Object.keys(COMMON).filter((n) => !have.has(n)), []);
});
