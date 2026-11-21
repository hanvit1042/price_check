// "지금 사면 좋은 품목": 1달 전(없으면 1주 전) 대비 가격 변화
import { inSeason } from './season.js';
const MIN = 3, MAX = 80; // ±3% 미만은 보합, 80% 넘는 변화는 자료 오류로 보고 제외

export function changeOf(item) {
  const p = item?.retail ?? item?.wholesale;
  if (!p?.p) return null;
  const past = p.m1 ?? p.w1, since = p.m1 ? '1달 전' : p.w1 ? '1주 전' : null;
  if (!past || !since) return null;
  const chg = ((p.p - past) / past) * 100;
  return Math.abs(chg) > MAX ? null : { chg, since, price: p.p, kind: item.retail ? 'retail' : 'wholesale', y1: p.y1 ? ((p.p - p.y1) / p.y1) * 100 : null };
}

/** groups: Map(name → items[]) (각 배열의 첫 번째가 대표 품목) */
export function computeDeals(groups, month) {
  const rows = [];
  for (const [name, arr] of groups) {
    const c = changeOf(arr[0]);
    if (c) rows.push({ name, item: arr[0], ...c, seasonal: inSeason(name, month) });
  }
  return {
    down: rows.filter((r) => r.chg <= -MIN).sort((a, b) => a.chg - b.chg),
    up: rows.filter((r) => r.chg >= MIN).sort((a, b) => b.chg - a.chg),
    all: new Map(rows.map((r) => [r.name, r])),
  };
}
