import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnit, perBase, normalizeKamis, aggregateAuction, attachAuction, updateHistory } from './lib.mjs';

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
test('KAMIS 변환', () => {
  const j = { data: { error_code: '000', item: [
    { product_cls_code: '01', category_code: '200', category_name: '채소류', item_name: '배추', productName: '배추/월동', unit: '1포기', dpr1: '4,000', dpr2: '4,200', dpr3: '3,000', dpr4: '-' },
    { product_cls_code: '02', category_code: '200', category_name: '채소류', item_name: '배추', productName: '배추/월동', unit: '10kg', dpr1: '8,000', dpr2: '8,000', dpr3: '-', dpr4: '7,000' },
  ] } };
  const items = normalizeKamis(j);
  // 소매는 포기, 도매는 kg 이라 단위가 달라 도매 행은 제외된다 (서로 다른 기준단위 섞지 않음)
  assert.equal(items.length, 1);
  assert.equal(items[0].retail.p, 4000);
  assert.equal(items[0].retail.y1, null);
  assert.equal(items[0].wholesale, undefined);
  assert.throws(() => normalizeKamis({ data: ['001'] }));
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
