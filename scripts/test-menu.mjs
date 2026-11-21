import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestMenus } from '../docs/menu.js';

const R = (id, n, c, m, s = ['a', 'b']) => ({ id: String(id), n, c, m, s });
const d = (name, chg) => [name, { name, chg, since: '1달 전' }];
const have = new Set(['고등어', '무', '양파', '배추', '쇠고기', '감자']);
const recipes = [
  R(1, '고등어조림', '반찬', [['고등어', 200], ['무', 150], ['양파', 30]]),
  R(2, '배추전', '반찬', [['배추', 200]]),
  R(3, '무국', '국&찌개', [['무', 100], ['쇠고기', 60]]),
  R(4, '양파볶음A', '반찬', [['양파', 120]]), R(5, '양파볶음B', '반찬', [['양파', 110]]), R(6, '양파볶음C', '반찬', [['양파', 100]]),
  R(7, '감자케이크', '후식', [['감자', 200]]),
  R(8, '두부요리', '반찬', [['두부', 200]]),                 // 시세 없는 재료뿐 → 제외
  R(10, '크림파스타', '일품', [['감자', 200]]),
  R(9, '짧은요리', '반찬', [['고등어', 200]], ['한 단계뿐']),   // 단계 부족 → 제외
];
const deals = new Map([d('고등어', -15), d('배추', 12), d('양파', -19), d('감자', -10)]);

test('싸진 주재료 우선, 오르는 주재료·시세없음·단계부족 제외', () => {
  const r = suggestMenus(recipes, deals, have, 11);
  const names = r.map((x) => x.r.n);
  assert.ok(names.includes('고등어조림')); assert.ok(!names.includes('배추전'));
  assert.ok(!names.includes('두부요리')); assert.ok(!names.includes('짧은요리')); assert.ok(!names.includes('감자케이크') && !names.includes('크림파스타')); // 후식·일품은 기본 제외
  assert.equal(r.find((x) => x.r.n === '고등어조림').reason.name, '고등어');
});
test('같은 재료로 추천되는 메뉴는 상한(2개)', () => {
  const r = suggestMenus(recipes, deals, have, 11);
  assert.equal(r.filter((x) => x.reason.name === '양파').length, 2);
});
test('분류 필터', () => {
  assert.deepEqual(suggestMenus(recipes, deals, have, 11, { filter: '일품' }).map((x) => x.r.n), ['크림파스타']);
  assert.deepEqual(suggestMenus(recipes, deals, have, 11, { filter: '후식' }).map((x) => x.r.n), ['감자케이크']);
  assert.ok(suggestMenus(recipes, deals, have, 11, { filter: '국&찌개' }).every((x) => x.r.c === '국&찌개'));
});
test('제철만 있어도 추천(가격 보합)', () => {
  const r = suggestMenus([R(1, '무국', '국&찌개', [['무', 100]])], new Map(), new Set(['무']), 11);
  assert.equal(r[0].reason.type, 'season');
  assert.equal(suggestMenus([R(1, '무국', '국&찌개', [['무', 100]])], new Map(), new Set(['무']), 7).length, 0); // 7월엔 제철 아님
});
test('같은 날(seed)은 같은 순서', () => {
  const a = suggestMenus(recipes, deals, have, 11, { seed: 5 }).map((x) => x.r.id), b = suggestMenus(recipes, deals, have, 11, { seed: 5 }).map((x) => x.r.id);
  assert.deepEqual(a, b);
});
