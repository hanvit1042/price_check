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
