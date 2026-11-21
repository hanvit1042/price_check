import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMON, commonPrice, presetOf } from '../docs/units.js';
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
test('축산물 단위: 100g·30구, 기준단위가 다르면 null', () => {
  assert.equal(commonPrice('돼지고기', 28460, 'kg').price, 2850);        // 100g
  assert.equal(commonPrice('쇠고기', 139000, 'kg').price, 13900);
  assert.equal(commonPrice('계란', 235.6, '구').price, 7070); assert.equal(commonPrice('계란', 235.6, '구').label, '30구');
  assert.equal(commonPrice('계란', 235.6, 'kg'), null);                  // 기준단위 불일치
  assert.deepEqual(presetOf(COMMON['돼지고기']), ['100g', 100, 'g']); assert.deepEqual(presetOf(COMMON['계란']), ['30구', 30, '구']); assert.deepEqual(presetOf(COMMON['배추']), ['1포기(약 2.5kg)', 2.5, 'kg']);
});
test('단위표 품목 이름이 공식 품목코드표에 있음', () => {
  const known = new Set(JSON.parse(readFileSync(new URL('./known-names.json', import.meta.url), 'utf8')));
  assert.deepEqual(Object.keys(COMMON).filter((n) => !known.has(n)), []);
});
