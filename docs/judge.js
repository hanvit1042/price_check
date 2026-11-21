// 가격 판정 로직 (브라우저/Node 공용, 순수 함수)
export const KG_UNITS = { kg: 1, g: 0.001, 근: 0.6, 관: 3.75 };
// 구매처: 시장·마트는 실제 조사 시세(channel.json)와 비교한다. 그 밖(온라인·편의점 등)은 조사 자료가 없어 전국·지역 평균과 비교.
// adj 는 예전에 추측으로 넣었던 보정(마트 +8% 등)으로, 실제 조사에서 마트가 시장보다 싼 품목이 많아 모두 1.0 으로 둔다.
export const VENUES = {
  market: { label: '전통시장·동네가게', adj: 1.0 },
  mart: { label: '대형마트·유통업체', adj: 1.0 },
  other: { label: '그 밖 (온라인·편의점 등)', adj: 1.0 },
};
export const BANDS = [
  { max: 0.85, key: 'great', label: '매우 저렴', emoji: '🤩', msg: '시세보다 확실히 쌉니다. 다만 품질·중량·유통기한은 꼭 확인하세요.' },
  { max: 0.95, key: 'good', label: '저렴한 편', emoji: '😊', msg: '시세보다 조금 싸요. 사도 좋은 가격입니다.' },
  { max: 1.10, key: 'fair', label: '적정 가격', emoji: '👌', msg: '지금 시세에 맞는 가격입니다.' },
  { max: 1.30, key: 'high', label: '조금 비쌈', emoji: '🤔', msg: '시세보다 다소 비쌉니다. 다른 곳과 비교해 보세요.' },
  { max: Infinity, key: 'bad', label: '비쌈', emoji: '😱', msg: '시세보다 많이 비쌉니다. 급하지 않다면 다른 곳을 추천해요.' },
];

export const factorFor = (unit) => KG_UNITS[unit] ?? 1;
export const unitsFor = (base) => (base === 'kg' ? Object.keys(KG_UNITS) : [base]);
export const pct = (a, b) => (a && b ? ((a - b) / b) * 100 : null);

/** 최근 prices(소매가 이력) 중 target 이하인 비율 (0~100) */
export function percentile(prices, target) {
  const xs = prices.filter((x) => x > 0);
  if (xs.length < 7) return null;
  return Math.round((xs.filter((x) => x <= target).length / xs.length) * 100);
}

export function judge({ item, price, qty, unit, venue = 'market', history = [] }) {
  if (!(price > 0) || !(qty > 0)) return null;
  const mine = price / (qty * factorFor(unit)); // 기준단위(kg/개…) 당 내 가격
  const v = VENUES[venue] ?? VENUES.market;
  const retail = item.retail?.p ?? null;
  const wholesale = item.wholesale?.p ?? null;
  const estimated = !retail && !!wholesale;
  const ref = retail ?? (wholesale ? Math.round(wholesale * 1.5) : null);
  if (!ref) return null;
  const center = ref * v.adj;
  const ratio = mine / center;
  const band = BANDS.find((b) => ratio <= b.max);
  const notes = [];
  if (estimated) notes.push('소매 시세가 없어 도매가×1.5 로 추정했어요. 참고용으로만 보세요.');
  if (wholesale && mine < wholesale) notes.push('도매가보다도 낮아요. 중량 부족·상태 불량(떨이)일 수 있으니 확인하세요.');
  if (item.auction && mine > item.auction.avg * 2.5) notes.push('오늘 경매 평균가의 2.5배 이상입니다. 유통 마진이 큰 편이에요.');
  const hp = history.map((r) => r[1]).filter(Boolean).slice(-90);
  return {
    mine, ref, center, ratio, band, notes, estimated,
    diffPct: (ratio - 1) * 100,
    fairLow: center * 0.95, fairHigh: center * 1.10,
    percentile: percentile(hp, mine / v.adj),
    percentileDays: hp.length,
  };
}
