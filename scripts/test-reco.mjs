import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changeOf, computeDeals } from '../docs/deals.js';
import { inSeason, seasonalNow } from '../docs/season.js';
import { RECIPES, suggestRecipes } from '../docs/recipes.js';

const it = (m1, p, extra = {}) => ({ retail: { p, m1, ...extra } });
test('가격 변화 계산', () => {
  assert.equal(Math.round(changeOf(it(2000, 1600)).chg), -20);
  assert.equal(changeOf(it(2000, 1600)).since, '1개월'.replace('개월', '달') + ' 전');
  assert.equal(changeOf({ retail: { p: 100, w1: 125 } }).since, '1주 전');
  assert.equal(changeOf(it(100, 1000)), null);          // 900% 변화는 자료 오류
  assert.equal(changeOf({ retail: { p: 100 } }), null);   // 비교 대상 없음
  assert.equal(changeOf({ wholesale: { p: 90, m1: 100 } }).kind, 'wholesale');
});
test('싸진/오른 품목 분류', () => {
  const g = new Map([['양파', [it(2000, 1600)]], ['무', [it(1000, 1020)]], ['배추', [it(1000, 1400)]], ['쌀', [it(3000, 2900)]]]);
  const d = computeDeals(g, 11);
  assert.deepEqual(d.down.map((x) => x.name), ['양파', '쌀']);   // 보합(+2%)은 제외, 더 많이 내린 순
  assert.deepEqual(d.up.map((x) => x.name), ['배추']);
});
test('제철', () => {
  assert.ok(inSeason('배추', 11)); assert.ok(!inSeason('수박', 11));
  assert.ok(seasonalNow(7).includes('수박'));
});
test('레시피 구조', () => {
  const names = RECIPES.map((r) => r.n);
  assert.equal(new Set(names).size, names.length);
  for (const r of RECIPES) { assert.ok(r.main.length >= 1 && r.tip && r.t, r.n); assert.equal(new Set(r.main).size, r.main.length, r.n); }
});
test('추천: 싸진 재료 우선, 오르는 주재료 제외', () => {
  const have = new Set(['고등어', '무', '파', '풋고추', '배추', '깐마늘(국산)']);
  const dealMap = new Map([['고등어', { name: '고등어', chg: -15, since: '1달 전' }], ['배추', { name: '배추', chg: 12, since: '1달 전' }]]);
  const s = suggestRecipes(dealMap, have, 11);
  assert.equal(s[0].n, '고등어무조림');
  assert.equal(s[0].reason.type, 'down'); assert.equal(Math.round(s[0].reason.pct), 15);
  assert.ok(!s.some((r) => r.n === '배추전' || r.n === '배춧국'));
});
test('실제 데이터에 레시피 주재료 이름이 존재 (이름 오타 방지)', (t) => {
  let d; try { d = JSON.parse(readFileSync(new URL('../docs/data/latest.json', import.meta.url), 'utf8')); } catch { return t.skip('데이터 없음'); }
  if (d.source === 'sample') return t.skip('샘플 데이터');
  const have = new Set(d.items.map((i) => i.name));
  const missing = RECIPES.filter((r) => !have.has(r.main[0])).map((r) => `${r.n}:${r.main[0]}`);
  assert.deepEqual(missing, []);
});
