import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLivestock, rowPrice, sanitize, isOkHeader, parseUnit, perBase, normalizeRecent, aggregateAuction, attachAuction, updateHistory } from './lib.mjs';

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
  const NOW = Date.UTC(2026, 10, 21);
  const items = normalizeRecent(rows, { now: NOW });
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
test('조사일이 오래된 값은 제외', () => {
  const NOW = Date.UTC(2026, 10, 21), base = { se_cd: '01', ctgry_cd: '200', ctgry_nm: '채소류', item_cd: '245', item_nm: '양파', vrty_cd: '1', vrty_nm: '호주산', grd_cd: '10', grd_nm: '냉장', unit: 'g', unit_sz: '100', exmn_dd_prc: '3,000', exmn_dd_cnvs_prc: '30000' };
  const stats = {};
  const r = normalizeRecent([
    { ...base, exmn_ymd: '20261120' },                                   // 1일 전 → 유지
    { ...base, vrty_cd: '2', vrty_nm: '미국산', exmn_ymd: '20261101' },   // 20일 전 → 유지
    { ...base, vrty_cd: '3', vrty_nm: '국산', exmn_ymd: '20261031' },     // 21일 전 → 유지(경계)
    { ...base, vrty_cd: '4', vrty_nm: '옛것', exmn_ymd: '20261030' },     // 22일 전 → 제외
    { ...base, vrty_cd: '5', vrty_nm: '아주옛것', exmn_ymd: '20220401' }, // 제외
    { ...base, vrty_cd: '6', vrty_nm: '날짜없음', exmn_ymd: '' },         // 제외
  ], { now: NOW, stats });
  assert.deepEqual(r.map((i) => i.vrty).sort(), ['국산', '미국산', '호주산']);
  assert.equal(stats.dropped, 3);
  assert.equal(normalizeRecent([{ ...base, exmn_ymd: '20220401' }], { now: NOW, maxAgeDays: 99999 }).length, 1);
});
test('경매 집계/연결/이력', () => {
  const agg = aggregateAuction([
    { gds_mclsf_nm: '사과', gds_sclsf_nm: '후지', unit_nm: 'kg', unit_qty: '10', scsbd_prc: '40000', qty: '10', whsl_mrkt_nm: '서울가락' },
    { gds_mclsf_nm: '사과', gds_sclsf_nm: '홍로', unit_nm: 'kg', unit_qty: '10', scsbd_prc: '60000', qty: '30', whsl_mrkt_nm: '서울강서' },
  ]);
  assert.equal(agg[0].sclsf, null);
  assert.equal(agg[0].avg, 5500); // (4000*10+6000*30)/40
  const items = attachAuction([
    { id: 'a', name: '사과', vrty: '후지', base: 'kg', retail: { p: 2000 } },
    { id: 'b', name: '사과', vrty: '시나노', base: 'kg' },
    { id: 'c', name: '사과', vrty: '사과', base: 'kg' }], agg, '2026-01-01');
  assert.equal(items[0].auction.avg, 4000); assert.equal(items[0].auction.scope, 'variety');
  assert.equal(items[1].auction.avg, 5500); assert.equal(items[1].auction.scope, 'item');
  assert.equal(items[2].auction.scope, 'item');
  const h = updateHistory({}, items, '2026-01-01'); updateHistory(h, items, '2026-01-01');
  assert.equal(h.a.length, 1);
});
test('이상 도매가 제거', () => {
  const r = sanitize([{ retail: { p: 2300 }, wholesale: { p: 8846 } }, { retail: { p: 2000 }, wholesale: { p: 2100 } }]);
  assert.equal(r[0].wholesale, undefined); assert.equal(r[1].wholesale.p, 2100);
});
test('성공 코드 판정', () => {
  assert.ok(isOkHeader({ resultCode: '00', resultMsg: 'NORMAL SERVICE.' }));
  assert.ok(isOkHeader({ resultCode: '0', resultMsg: '정상' }));
  assert.ok(isOkHeader({ resultCode: 0, resultMsg: '정상' }));
  assert.ok(!isOkHeader({ resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED' }));
});

test('축산물: kg환산가 무시하고 가격÷단위로 계산', () => {
  const b = { ctgry_cd: '500', exmn_dd_cnvs_prc: '30320' };
  const pork = rowPrice({ ...b, exmn_dd_prc: '2,846', unit_sz: '100', unit: 'g' });
  assert.deepEqual([Math.round(pork.per), pork.base, pork.unit], [28460, 'kg', '100g']);   // 100g 2,846원 → kg당 28,460원
  const egg = rowPrice({ ...b, exmn_dd_prc: '7068', unit_sz: '30', unit: '구' });
  assert.equal(egg.base, '구'); assert.ok(Math.abs(egg.per - 235.6) < 0.01);
  assert.equal(rowPrice({ ctgry_cd: '200', exmn_dd_cnvs_prc: '2500' }).per, 2500);   // 농산물은 kg환산가 사용
});
const NOW_L = Date.UTC(2026, 10, 21);
const live = (item, vcd, vnm, gcd, gnm, ymd, sgg, prc, unit = '100g') => ({ se_cd: '01', ctgry_cd: '500', item_cd: item, vrty_cd: vcd, vrty_nm: vnm, grd_cd: gcd, grd_nm: gnm, exmn_ymd: ymd, sgg_cd: sgg, exmn_dd_prc: String(prc), unit_sz: unit.match(/^\d+/)[0], unit: unit.replace(/^\d+/, ''), exmn_dd_cnvs_prc: '30320' });
test('축산물 품목 만들기: 현재가·1일/1주/1달 전, 지역수 부족한 날 제외', () => {
  const rows = [];
  // 삼겹살: 10/15~11/20 매일 3개 지역 (가격 = 날짜에 따라 변동), 11/20 은 지역 1곳뿐(커버리지 미달)
  for (let d = 0; d <= 36; d++) {
    const ymd = new Date(Date.UTC(2026, 10, 20) - d * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    for (const [i, s] of ['1101', '2100', '2200'].entries()) { if (d === 0 && i > 0) continue; rows.push(live('4304', '27', '삼겹살', '1', '삼겹살', ymd, s, 2800 - d * 5 + i * 30)); }
  }
  const stats = {};
  const it = normalizeLivestock(rows, { now: NOW_L, stats });
  assert.equal(it.length, 1);
  const x = it[0];
  assert.deepEqual([x.id, x.name, x.display, x.category, x.base], ['500:4304:27:1', '돼지고기', '돼지고기 (삼겹살)', '축산물', 'kg']);
  assert.equal(x.date, '20261119');                       // 11/20 은 1/3 지역뿐이라 제외 → 11/19 이 현재
  assert.equal(x.retail.p, Math.round((2800 - 1 * 5 + 30) * 10)); // 3개 지역 평균(2800-5+30)=2825/100g → 28250원/kg
  assert.ok(x.retail.d1 < x.retail.p);                    // 가격이 날짜가 지날수록 올라가는 데이터 → 과거가 더 쌈
  assert.ok(x.retail.w1 && x.retail.m1 && x.retail.w1 < x.retail.d1);
  assert.equal(x.retail.y1, null);
});
test('축산물: 이름 규칙·닭 육계(kg)만·계란 구 단위·우유 L·오래된 건 제외', () => {
  const rows = [
    live('4301', '22', '등심', '2', '1+등급', '20261120', '1101', 14000), live('4301', '22', '등심', '2', '1+등급', '20261120', '2100', 13800),
    live('4401', '31', '갈비', '1', '미국산', '20261120', '1101', 4500), live('4402', '27', '삼겹살', '1', '삼겹살', '20261120', '1101', 1500),
    live('9901', '99', '육계(kg)', '1', '육계(kg)', '20261120', '1101', 5700, '1kg'), live('9901', '05', '육계12호', '1', '육계12호', '20261120', '1101', 586, '1kg'),
    live('9903', '23', 'XL30구', '1', '일반란', '20261120', '1101', 7068, '30구'),
    live('9908', '01', '흰우유', '1', '흰우유', '20261120', '1101', 2957, '1L'),
    live('4304', '25', '앞다리', '1', '앞다리', '20250101', '1101', 1600),          // 옛 자료 → 제외
  ];
  const by = Object.fromEntries(normalizeLivestock(rows, { now: NOW_L }).map((i) => [i.id, i]));
  assert.equal(by['500:4301:22:2'].display, '쇠고기 (한우 등심) 1+등급'); assert.equal(by['500:4301:22:2'].retail.p, 139000); // (14000+13800)/2=13900원/100g → 139,000원/kg
  assert.equal(by['500:4401:31:1'].display, '쇠고기 (수입 갈비) 미국산');
  assert.equal(by['500:4402:27:1'].display, '돼지고기 (수입 삼겹살)');
  assert.equal(by['500:9901:99:1'].display, '닭고기 (육계)'); assert.equal(by['500:9901:99:1'].retail.p, 5700);
  assert.equal(by['500:9901:05:1'], undefined);
  assert.deepEqual([by['500:9903:23:1'].name, by['500:9903:23:1'].base], ['계란', '구']); assert.equal(by['500:9903:23:1'].retail.p, 235.6);
  assert.deepEqual([by['500:9908:01:1'].name, by['500:9908:01:1'].base, by['500:9908:01:1'].retail.p], ['우유', 'L', 2957]);
  assert.equal(by['500:4304:25:1'], undefined);
});
test('최근일자 API 의 축산물은 제외(일별 API 로만)', () => {
  const r = normalizeRecent([{ se_cd: '01', ctgry_cd: '500', item_cd: '512', item_nm: '쇠고기', vrty_cd: '1', vrty_nm: 'x', grd_cd: '1', grd_nm: 'y', unit: 'g', unit_sz: '100', exmn_dd_prc: '3000', exmn_dd_cnvs_prc: '30000', exmn_ymd: '20261120' }], { now: Date.UTC(2026, 10, 21) });
  assert.equal(r.length, 0);
});
