import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTag } from '../docs/ocr-parse.js';
const items = [{ id: 'a', name: '양파', display: '양파/햇양파' }, { id: 'b', name: '대파', display: '대파' }, { id: 'c', name: '파', display: '파' }];
test('기본 가격표', () => {
  const r = parseTag('국산 양파 1.5kg\n정상가 4,500원\n행사가 3,980원', items);
  assert.deepEqual(r.prices, [3980, 4500]);
  assert.equal(r.qty, 1.5); assert.equal(r.unit, 'kg');
  assert.equal(r.matches[0].id, 'a');
});
test('OCR 오인식 보정/그램 환산', () => {
  const r = parseTag('대파 5OOg 2 ,98O원', items);
  assert.equal(r.matches[0].id, 'b');
  assert.equal(r.qty, 0.5); assert.equal(r.unit, 'kg');
  assert.deepEqual(r.prices, [2980]);
});
test('100g당 단가', () => {
  const r = parseTag('한우 등심 100g당 9,800원', []);
  assert.equal(r.perUnit, true); assert.equal(r.qty, 0.1); assert.deepEqual(r.prices, [9800]);
});
test('아무것도 못 읽음', () => {
  const r = parseTag('abc', items);
  assert.deepEqual(r.prices, []); assert.equal(r.qty, null); assert.equal(r.matches.length, 0);
});

test('품종명(국산 등)에 잘못 걸리지 않음', () => {
  const its = [
    { id: 'n', name: '땅콩', vrty: '국산', display: '땅콩 (국산) 상품' },
    { id: 'o1', name: '양파', vrty: '양파', display: '양파 상품' },
    { id: 'o2', name: '양파', vrty: '햇양파', display: '양파 (햇양파) 상품' },
  ];
  assert.equal(parseTag('국산 양파 1.5kg 1,980원', its).matches[0].id, 'o1');
  assert.equal(parseTag('국산 햇양파 1,980원', its).matches[0].id, 'o2'); // 품종 힌트
  assert.equal(parseTag('수입 2,000원', its).matches.length, 0);
});
test('별칭', () => {
  const its = [{ id: 'p', name: '파', vrty: '', display: '파 상품' }, { id: 'g', name: '깐마늘(국산)', vrty: '', display: '깐마늘(국산) 상품' }];
  assert.equal(parseTag('대파 한단 2,980원', its).matches[0].id, 'p');
  assert.equal(parseTag('국산 마늘 1kg', its).matches[0].id, 'g');
});

test('단위 글자 오인식 보정 (g→8, kg→+8)', () => {
  const g = (txt) => { const r = parseTag(txt, []); return [r.qty, r.unit, r.perUnit]; };
  assert.deepEqual(g('삼겹살 6008 16,800원'), [0.6, 'kg', false]);          // 600g
  assert.deepEqual(g('한우 1008당 13,900원'), [0.1, 'kg', true]);           // 100g당
  assert.deepEqual(g('양파 1.5+8 3,980원'), [1.5, 'kg', false]);            // 1.5kg
  assert.deepEqual(g('양파 2k9 5,000원'), [2, 'kg', false]);
  assert.deepEqual(parseTag('특가 1,008원 / 2008원', []).prices, [1008, 2008]); // 가격은 건드리지 않음
  assert.equal(parseTag('양파 1,008원', []).qty, null);
});
test('축산물 별칭·등급 선택', () => {
  const its = [
    { id: 'p1', name: '돼지고기', vrty: '삼겹살', display: '돼지고기 (삼겹살)' }, { id: 'p2', name: '돼지고기', vrty: '앞다리', display: '돼지고기 (앞다리)' },
    { id: 'b1', name: '쇠고기', vrty: '한우 등심', display: '쇠고기 (한우 등심) 1++등급' }, { id: 'b2', name: '쇠고기', vrty: '한우 등심', display: '쇠고기 (한우 등심) 1+등급' },
    { id: 'b3', name: '쇠고기', vrty: '한우 등심', display: '쇠고기 (한우 등심) 1등급' }, { id: 'e1', name: '계란', vrty: 'XL30구', display: '계란 (XL30구) 일반란' }, { id: 'e2', name: '계란', vrty: 'XL30구', display: '계란 (XL30구) 등급란' },
  ];
  assert.equal(parseTag('삼겹살 600g 16,800원', its).matches[0].id, 'p1');
  assert.equal(parseTag('국내산 앞다리 500g', its).matches[0].id, 'p2');
  assert.equal(parseTag('한우 등심 1+등급 100g당 13,900원', its).matches[0].id, 'b2');
  assert.equal(parseTag('한우 등심 1++등급 100g당 16,000원', its).matches[0].id, 'b1');
  assert.equal(parseTag('한우 등심 1등급 100g당 11,000원', its).matches[0].id, 'b3');
  assert.equal(parseTag('신선한 달걀 특란 30구 7,500원', its).matches[0].name, '계란');
});

test('전자 가격표: 오타(방물토마토)·원 없는 가격·100g당 단가 검산', () => {
  const its = [
    { id: 't1', name: '토마토', vrty: '토마토', display: '토마토 상품' },
    { id: 'm1', name: '방울토마토', vrty: '방울토마토', display: '방울토마토 상품' }, { id: 'm2', name: '방울토마토', vrty: '대추방울토마토', display: '방울토마토 (대추방울토마토) 상품' },
  ];
  const r = parseTag('대추방물토마토750g/팩\n국내산\n100g당 1197원\n8,980\n070181\n119/0/정정', its);
  assert.equal(r.matches[0].id, 'm2');              // 방물→방울(한 글자 차이), 대추 변종까지
  assert.deepEqual(r.prices, [8980]);               // 100g당 1197 은 총 가격이 아님, 바코드 070181 도 제외
  assert.equal(r.qty, 0.75); assert.equal(r.unit, 'kg'); assert.equal(r.perUnit, false);
  assert.deepEqual([r.unitPrice.q, r.unitPrice.u, r.unitPrice.p], [100, 'g', 1197]);
  // 같은 단가로 보이는 후보가 둘이면 단가×무게(≈8,977원)에 가까운 값을 먼저
  assert.equal(parseTag('토마토 750g/팩 100g당 1197원 9,900 8,980', its).prices[0], 8980);
  // 총 가격이 인식되지 않아도 단가×무게로 추정
  const e = parseTag('방울토마토 750g/팩 100g당 1,197원', its); assert.deepEqual([e.prices, e.priceEstimated], [[8980], true]);
  // 8980 처럼 콤마·원 없이 적힌 가격
  assert.deepEqual(parseTag('방울토마토 500g 6980', its).prices, [6980]);
  // 짧은 이름은 오타 허용 안 함(오탐 방지): '무'/'파' 같은 한 글자 이름이 엉뚱하게 걸리지 않음
  assert.equal(parseTag('토마도 1kg', [{ id: 'x', name: '토마토', vrty: '', display: '토마토' }]).matches.length, 0);
});

test('750g/팩 → "7508/팩" 오인식 보정 (단위 표기가 뒤에 있을 때만)', () => {
  const r = parseTag('대추방물토마토7508/팩\n국내산\n1008당 1197원\n8,980', []);
  assert.deepEqual([r.qty, r.unit, r.perUnit, r.prices], [0.75, 'kg', false, [8980]]);
  assert.equal(parseTag('토마토 3508원', []).qty, null);          // 가격(원)은 건드리지 않음
  assert.equal(parseTag('토마토 2508 9,900원', []).qty, null);     // 단위 표기가 없으면 그대로 둠
  assert.equal(parseTag('토마토 4508/봉 3,980원', []).qty, 0.45);  // 450g/봉
});
