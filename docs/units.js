// 보통 사는 단위(포대·포기·단·개…)와 대략의 무게(kg). 실제 무게는 크기에 따라 달라 "약"으로 표시한다
const T = {
  쌀: ['20kg', 20], 양파: ['1망', 3], 파: ['1단', 1], 배추: ['1포기', 2.5], 알배기배추: ['1포기', 0.7], 무: ['1개', 1.5], '깐마늘(국산)': ['500g', 0.5],
  오이: ['1개', 0.2], 가지: ['1개', 0.15], 파프리카: ['1개', 0.2], 브로콜리: ['1개', 0.4], 양배추: ['1통', 2],
  시금치: ['1단', 0.4], 부추: ['1단', 0.3], 열무: ['1단', 1], 상추: ['1봉', 0.2], 깻잎: ['100g', 0.1], 풋고추: ['100g', 0.1], 생강: ['100g', 0.1], 고춧가루: ['500g', 0.5],
  사과: ['1개', 0.3], 배: ['1개', 0.6], 단감: ['1개', 0.25], 참외: ['1개', 0.3], 딸기: ['1팩', 0.5], 수박: ['1통', 8], 바나나: ['1송이', 1],
  쇠고기: ['100g', 0.1], 고등어: ['1마리', 0.4], 갈치: ['1마리', 0.3], 물오징어: ['1마리', 0.3], 굴: ['100g', 0.1], 새우: ['100g', 0.1],
};
const fmt = (kg) => (kg < 1 ? `${Math.round(kg * 1000)}g` : `${kg}kg`);
export const COMMON = Object.fromEntries(Object.entries(T).map(([n, [short, kg]]) => [n, {
  short, kg, label: /^\d+(\.\d+)?(kg|g)$/.test(short) ? short : `${short}(약 ${fmt(kg)})`, exact: /^\d+(\.\d+)?(kg|g)$/.test(short),
}]));
export const commonOf = (name) => COMMON[name] ?? null;
const r10 = (n) => Math.round(n / 10) * 10;
/** kg당 가격 → 보통 사는 단위의 가격 */
export function commonPrice(name, perKg) {
  const c = COMMON[name]; if (!c || !perKg) return null;
  return { ...c, price: r10(perKg * c.kg), approx: !c.exact };
}
