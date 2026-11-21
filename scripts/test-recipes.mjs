import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseCsv, makeMatcher, extractIngredients, cleanStep, httpsUrl, buildRecipes } from './recipe-lib.mjs';

const NAMES = ['돼지고기', '닭고기', '계란', '쌀', '찹쌀', '파', '양파', '깐마늘(국산)', '무', '배추', '알배기배추', '양배추', '콩', '땅콩', '풋고추', '붉은고추', '고춧가루', '쇠고기', '물오징어', '마른오징어', '토마토', '방울토마토', '호박', '김', '굴', '배', '새우', '마른멸치', '오이'];
const m = makeMatcher(NAMES);

test('CSV 파서: 따옴표·줄바꿈·쉼표', () => {
  const r = parseCsv('﻿A,B\n1,"x, ""y""\nz"\n2,w\r\n');
  assert.deepEqual(r, [{ A: '1', B: 'x, "y"\nz' }, { A: '2', B: 'w' }]);
});
test('재료 → 시세 품목 매칭(오탐 방지)', () => {
  const eq = (s, n) => assert.equal(m(s), n, s);
  eq('양파(20g)', '양파'); eq('대파(5g)', '파'); eq('쪽파(1g)', '파'); eq('다진 마늘(10g)', '깐마늘(국산)');
  eq('땅콩(5g)', '땅콩'); eq('콩(50g)', '콩'); eq('완두콩(10g)', null);     // 완두콩은 '콩'이 아님
  eq('찹쌀(100g)', '찹쌀'); eq('쌀(60g)', '쌀'); eq('쌀파스타면(160g)', null); eq('찹쌀가루(5g)', null);
  eq('알배기배추(100g)', '알배기배추'); eq('배추(100g)', '배추'); eq('양배추(50g)', '양배추');
  eq('붉은 고추(5g)', '붉은고추'); eq('청양고추(3g)', '풋고추'); eq('고추장(10g)', null); eq('고춧가루(1g)', '고춧가루');
  eq('쇠고기(홍두깨살)(50g)', '쇠고기'); eq('마른 오징어(20g)', '마른오징어'); eq('오징어(100g)', '물오징어');
  eq('토마토(100g)', '토마토'); eq('방울토마토(50g)', '방울토마토'); eq('토마토소스(30g)', null);
  eq('단무지(30g)', null); eq('무(100g)', '무'); eq('굴(50g)', '굴'); eq('배(30g)', '배'); eq('배즙(10g)', null);
  eq('양념 다진 마늘(1g)', '깐마늘(국산)'); eq('육수 멸치(2g)', '마른멸치'); eq('오이(6g)', '오이'); eq('김치(50g)', null);
});
test('축산물 재료 매칭', () => {
  const eq = (s, n) => assert.equal(m(s), n, s);
  eq('삼겹살(200g)', '돼지고기'); eq('돼지고기 앞다리살(100g)', '돼지고기'); eq('목살(150g)', '돼지고기'); eq('돼지고기 육수(10g)', null); eq('베이컨(20g)', null);
  eq('닭가슴살(100g)', '닭고기'); eq('닭(1마리)', '닭고기'); eq('닭육수(300g)', null); eq('달걀(50g)', '계란'); eq('삶은 달걀(1개)', '계란'); eq('메추리알(5개)', null);
});
test('재료 추출: 그램 합계·정렬', () => {
  const r = extractIngredients('재료 양파(40g), 대파(10g)\n쪽파(15g), 소금(2g)\n양념 다진 마늘(7g), 호박(1.5kg)', m);
  assert.deepEqual(r, [{ name: '호박', g: 1500 }, { name: '양파', g: 40 }, { name: '파', g: 25 }, { name: '깐마늘(국산)', g: 7 }]);
});
test('문장 다듬기·https', () => {
  assert.equal(cleanStep('1. 새우를 데쳐 건진다.a'), '새우를 데쳐 건진다.');
  assert.equal(cleanStep('3) 찜기에 10분 찐다.'), '찜기에 10분 찐다.');
  assert.equal(httpsUrl('http://www.x.go.kr/a.png'), 'https://www.x.go.kr/a.png');
});
test('buildRecipes: 필수값 없는 행 제외', () => {
  const rows = [{ RCP_SEQ: '1', RCP_NM: '양파볶음', RCP_PAT2: '반찬', RCP_PARTS_DTLS: '재료 양파(100g)', MANUAL01: '1. 볶는다.a', INFO_ENG: '120', ATT_FILE_NO_MAIN: 'http://a/b.png' }, { RCP_SEQ: '2', RCP_NM: '', RCP_PARTS_DTLS: 'x' }];
  const r = buildRecipes(rows, NAMES);
  assert.equal(r.length, 1); assert.equal(r[0].s[0], '볶는다.'); assert.deepEqual(r[0].m, [['양파', 100]]); assert.equal(r[0].i, 'https://a/b.png'); assert.equal(r[0].k, 120);
});
test('생성된 recipes.json 점검', (t) => {
  const f = new URL('../docs/data/recipes.json', import.meta.url);
  if (!existsSync(f)) return t.skip('recipes.json 없음');
  const d = JSON.parse(readFileSync(f, 'utf8'));
  assert.ok(d.recipes.length > 1000);
  const ids = new Set(d.recipes.map((r) => r.id)); assert.equal(ids.size, d.recipes.length);
  assert.ok(d.recipes.every((r) => r.n && r.p && r.c));
  assert.ok(d.recipes.filter((r) => r.c === '반찬').length > 500);
  assert.ok(d.recipes.filter((r) => r.s.length >= 3).length > 1000);
});
