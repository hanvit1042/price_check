import test from 'node:test';
import assert from 'node:assert/strict';
import { isOkHeader, parseUnit, perBase, normalizeRecent, aggregateAuction, attachAuction, updateHistory } from './lib.mjs';

test('단위 파싱', () => {
  assert.deepEqual(parseUnit('20kg'), { qty: 20, type: 'kg' });
  assert.deepEqual(parseUnit('100g'), { qty: 0.1, type: 'kg' });
  assert.deepEqual(parseUnit('10개'), { qty: 10, type: '개' });
  assert.deepEqual(parseUnit('1포기'), { qty: 1, type: '포기' });
  assert.deepEqual(parseUnit('30구'), { qty: 30, type: '구' });
  assert.equal(parseUnit('???'), null);
});
test('기준단위 환산', () => {
  assert.deepEqual(perBase('52,000', '20kg'), { price: 2600, base: 'kg' });
  assert.deepEqual(perBase('900', '100g'), { price: 9000, base: 'kg' });
  assert.equal(perBase('-', '1kg'), null);
});
test('최근일자 도소매 변환', () => {
  const rows = [
    { exmn_ymd: '20261120', se_cd: '01', ctgry_cd: '200', ctgry_nm: '채소류', item_cd: '245', item_nm: '양파', vrty_cd: '00', vrty_nm: '양파', grd_cd: '04', grd_nm: '상품',
      unit: 'kg', unit_sz: '1', exmn_dd_prc: '2,500', exmn_dd_cnvs_prc: '2500', dd1_bfr_cnvs_prc: '2400', ww1_bfr_cnvs_prc: '2300', mm1_bfr_cnvs_prc: '2000', yy1_bfr_cnvs_prc: '' },
    { exmn_ymd: '20261120', se_cd: '02', ctgry_cd: '200', ctgry_nm: '채소류', item_cd: '245', item_nm: '양파', vrty_cd: '00', vrty_nm: '양파', grd_cd: '04', grd_nm: '상품',
      unit: 'kg', unit_sz: '20', exmn_dd_prc: '24,000', exmn_dd_cnvs_prc: '1200', dd1_bfr_cnvs_prc: '1200', ww1_bfr_cnvs_prc: '1100', mm1_bfr_cnvs_prc: '1000', yy1_bfr_cnvs_prc: '900' },
    // kg 환산가가 없는 개수 단위 품목 (포기)
    { exmn_ymd: '20261120', se_cd: '01', ctgry_cd: '200', ctgry_nm: '채소류', item_cd: '211', item_nm: '배추', vrty_cd: '06', vrty_nm: '월동', grd_cd: '04', grd_nm: '상품',
      unit: '포기', unit_sz: '1', exmn_dd_prc: '4,000', exmn_dd_cnvs_prc: '', dd1_bfr_prc: '4,200', mm1_bfr_prc: '3,000', yy1_bfr_prc: '-' },
    { se_cd: '09', item_nm: '무시됨' },
  ];
  const items = normalizeRecent(rows);
  assert.equal(items.length, 2);
  const onion = items.find((i) => i.name === '양파');
  assert.equal(onion.display, '양파 상품');
  assert.equal(onion.base, 'kg');
  assert.deepEqual([onion.retail.p, onion.retail.d1, onion.retail.w1, onion.retail.m1, onion.retail.y1], [2500, 2400, 2300, 2000, null]);
  assert.equal(onion.wholesale.p, 1200);
  const cab = items.find((i) => i.name === '배추');
  assert.equal(cab.base, '포기'); assert.equal(cab.display, '배추 (월동) 상품');
  assert.deepEqual([cab.retail.p, cab.retail.d1, cab.retail.m1, cab.retail.y1], [4000, 4200, 3000, null]);
  assert.throws(() => normalizeRecent(undefined));
});
test('경매 집계/연결/이력', () => {
  const agg = aggregateAuction([
    { gds_mclsf_nm: '양파', unit_nm: 'kg', unit_qty: '20', scsbd_prc: '20000', qty: '10', whsl_mrkt_nm: '서울가락' },
    { gds_mclsf_nm: '양파', unit_nm: 'kg', unit_qty: '20', scsbd_prc: '24000', qty: '30', whsl_mrkt_nm: '서울강서' },
  ]);
  assert.equal(agg[0].avg, 1150); // (1000*10+1200*30)/40
  const items = attachAuction([{ id: 'a', name: '양파', base: 'kg', retail: { p: 2000 } }], agg, '2026-01-01');
  assert.equal(items[0].auction.avg, 1150);
  const h = updateHistory({}, items, '2026-01-01'); updateHistory(h, items, '2026-01-01');
  assert.equal(h.a.length, 1);
});
test('성공 코드 판정', () => {
  assert.ok(isOkHeader({ resultCode: '00', resultMsg: 'NORMAL SERVICE.' }));
  assert.ok(isOkHeader({ resultCode: '0', resultMsg: '정상' }));
  assert.ok(isOkHeader({ resultCode: 0, resultMsg: '정상' }));
  assert.ok(!isOkHeader({ resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED' }));
});
