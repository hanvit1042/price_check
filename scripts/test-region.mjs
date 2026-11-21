import test from 'node:test';
import assert from 'node:assert/strict';
import { itemKeys, aggregateRegion } from './region-lib.mjs';
import { nearestRegion, distanceKm, lookupChain, median, REGIONS, REGION_BY_CODE } from '../docs/regions.js';

const row = (o) => ({ se_cd: '01', ctgry_cd: '200', item_cd: '245', vrty_cd: '00', grd_cd: '04', exmn_ymd: '20261120', sgg_cd: '1101', exmn_dd_cnvs_prc: '2000', ...o });
test('지역 집계: 최근 조사일만, 시장 평균, kg환산가만, 소매만', () => {
  const rows = [
    row({ exmn_dd_cnvs_prc: '2000' }), row({ exmn_dd_cnvs_prc: '2200' }),            // 서울 11/20 → 평균 2100
    row({ exmn_ymd: '20261119', exmn_dd_cnvs_prc: '9999' }),                          // 옛 날짜는 무시
    row({ sgg_cd: '2100', exmn_dd_cnvs_prc: '1800' }),                                // 부산
    row({ sgg_cd: '2200', exmn_dd_cnvs_prc: '' }),                                    // kg환산가 없음 → 제외
    row({ se_cd: '02', sgg_cd: '2300' }),                                             // 중도매 → 제외
    row({ item_cd: '999' }),                                                          // 모르는 품목 → 제외
  ];
  const r = aggregateRegion(rows, new Set(['200:245:00:04']));
  assert.deepEqual(r, { '200:245:00:04': { 1101: 2100, 2100: 1800 } });
});
test('조회할 품목 목록(소매·kg 또는 축산물, 중복 제거)', () => {
  const k = itemKeys([{ id: '200:245:00:04', retail: {}, base: 'kg' }, { id: '200:245:01:05', retail: {}, base: 'kg' }, { id: '200:211:06:04', retail: {}, base: '포기' }, { id: '100:111:01:04', base: 'kg' },
    { id: '500:9903:23:1', retail: {}, base: '구' }, { id: '500:4304:27:1', retail: {}, base: 'kg' }]);
  assert.deepEqual(k, [{ ctgry: '200', item: '245' }, { ctgry: '500', item: '9903' }, { ctgry: '500', item: '4304' }]);
});
test('지역 집계: 축산물은 가격÷단위(kg환산가 무시), 기준단위가 다르면 제외', () => {
  const L = (o) => ({ se_cd: '01', ctgry_cd: '500', item_cd: '4304', vrty_cd: '27', grd_cd: '1', exmn_ymd: '20261120', sgg_cd: '1101', unit_sz: '100', unit: 'g', exmn_dd_prc: '2800', exmn_dd_cnvs_prc: '30320', ...o });
  const E = (o) => ({ se_cd: '01', ctgry_cd: '500', item_cd: '9903', vrty_cd: '23', grd_cd: '1', exmn_ymd: '20261120', sgg_cd: '1101', unit_sz: '30', unit: '구', exmn_dd_prc: '7068', exmn_dd_cnvs_prc: '3032', ...o });
  const r = aggregateRegion([L({}), L({ exmn_dd_prc: '3000' }), L({ sgg_cd: '2100', exmn_dd_prc: '2700' }), E({}), E({ sgg_cd: '2100', exmn_dd_prc: '6900' })],
    new Map([['500:4304:27:1', 'kg'], ['500:9903:23:1', '구']]));
  assert.deepEqual(r['500:4304:27:1'], { 1101: 29000, 2100: 27000 });           // 원/kg
  assert.deepEqual(r['500:9903:23:1'], { 1101: 235.6, 2100: 230 });             // 원/구
  assert.deepEqual(aggregateRegion([E({})], new Map([['500:9903:23:1', 'kg']])), {}); // 기준단위 불일치
});
test('내 위치 → 가까운 도시', () => {
  assert.equal(nearestRegion(37.5665, 126.9780).region.name, '서울');
  assert.equal(nearestRegion(35.15, 129.06).region.name, '부산');
  assert.equal(nearestRegion(37.28, 127.02).region.name, '수원');       // 경기 수원 (도 단위 항목이 아니라 도시를 고름)
  assert.equal(nearestRegion(33.5, 126.5).region.name, '제주');
  assert.equal(nearestRegion(35.68, 139.69), null);                      // 도쿄는 한국 밖
  assert.ok(Math.abs(distanceKm(37.5665, 126.978, 35.1796, 129.0756) - 325) < 15);
});
test('자료 있는 도시 안에서만 가까운 곳 찾기', () => {
  const ok = new Set(['1101', '3138', '3112']);                   // 서울·고양·성남만 조사
  assert.equal(nearestRegion(37.7381, 127.0337, ok).region.name, '서울');   // 의정부 → 가까운 조사 도시
  assert.equal(nearestRegion(37.7381, 127.0337).region.name, '의정부');
  assert.equal(nearestRegion(33.5, 126.5, ok), null);                       // 제주에서는 300km 안에 조사 도시가 없음
});
test('지역 조회 순서·중앙값·표 무결성', () => {
  assert.deepEqual(lookupChain('3111'), ['3111', '3100']); assert.deepEqual(lookupChain('1101'), ['1101']);
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null);
  assert.equal(new Set(REGIONS.map((r) => r.code)).size, REGIONS.length);
  assert.ok(REGIONS.filter((r) => r.parent).every((r) => REGION_BY_CODE[r.parent]?.province));
});
