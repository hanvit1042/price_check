// 품종 이름이 "20kg", "10kg(햅쌀)" 처럼 포장 단위이면 (쌀 등) 그 포장 한 개 가격으로 입력받는다
export function parsePack(vrty) {
  const m = String(vrty ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!m) return null;
  const q = Number(m[1]), u = m[2].toLowerCase();
  const kg = u === 'g' ? q / 1000 : q;
  return kg > 0 ? { qty: kg, label: `${q}${u}` } : null;
}
