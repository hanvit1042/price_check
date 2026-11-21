// 데모용 샘플 데이터 생성 (실제 시세가 아님). 키 없이도 앱을 둘러볼 수 있게 한다.
import { mkdir, writeFile } from 'node:fs/promises';
const OUT = new URL('../docs/data/', import.meta.url);
// [이름, 분류, 기준단위, 소매가, 도매가]
const S = [
  ['쌀', '식량작물', 'kg', 3200, 2600], ['감자', '식량작물', 'kg', 3800, 2300], ['고구마', '식량작물', 'kg', 5600, 3600],
  ['배추', '채소류', 'kg', 1900, 900], ['무', '채소류', 'kg', 1700, 800], ['양파', '채소류', 'kg', 2300, 1100],
  ['대파', '채소류', 'kg', 3600, 2000], ['마늘(깐마늘)', '채소류', 'kg', 13500, 9000], ['당근', '채소류', 'kg', 3400, 1900],
  ['오이', '채소류', 'kg', 3700, 2400], ['애호박', '채소류', 'kg', 3300, 2000], ['시금치', '채소류', 'kg', 9800, 6500],
  ['상추', '채소류', 'kg', 11500, 7200], ['토마토', '채소류', 'kg', 6200, 4100], ['고추(청양)', '채소류', 'kg', 12800, 8300],
  ['사과(후지)', '과일류', 'kg', 6900, 4300], ['배(신고)', '과일류', 'kg', 5800, 3500], ['감귤', '과일류', 'kg', 4300, 2500],
  ['딸기', '과일류', 'kg', 17500, 12000], ['포도(샤인머스켓)', '과일류', 'kg', 15500, 10500], ['바나나', '과일류', 'kg', 3400, 2200],
  ['한우 등심', '축산물', 'kg', 98000, 72000], ['돼지고기(삼겹살)', '축산물', 'kg', 24500, 17800], ['닭고기', '축산물', 'kg', 6200, 4200],
  ['계란(특란)', '축산물', '구', 270, 200], ['고등어', '수산물', 'kg', 7200, 4400], ['오징어', '수산물', 'kg', 11500, 7800],
  ['갈치', '수산물', 'kg', 21000, 14500], ['굴', '수산물', 'kg', 18000, 11000], ['김', '수산물', '개', 1200, 800],
];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const r10 = (n) => Math.round(n / 10) * 10 || 1;
const date = (d) => new Date(Date.now() + 9 * 3600e3 - d * 864e5).toISOString().slice(0, 10);
const items = [], history = {};
for (const [name, category, base, rp, wp] of S) {
  const id = `sample:${name}`; const trend = (rnd() - 0.5) * 0.3; const days = 120;
  const series = []; let k = 1 - trend;
  for (let d = days; d >= 0; d--) { k += (trend / days) + (rnd() - 0.5) * 0.03; series.push([date(d), r10(rp * k), r10(wp * k * (1 + (rnd() - 0.5) * 0.04))]); }
  history[id] = series;
  const at = (d) => series[series.length - 1 - d];
  const pack = (b) => ({ p: b[1], d1: at(1)[1], w1: at(7)[1], m1: at(30)[1], y1: r10(at(0)[1] * (0.85 + rnd() * 0.3)) });
  const r = pack(at(0)); const w = { p: at(0)[2], d1: at(1)[2], w1: at(7)[2], m1: at(30)[2], y1: r10(at(0)[2] * (0.85 + rnd() * 0.3)) };
  const it = { id, name, display: name, category, base, retail: r, wholesale: w };
  if (rnd() > 0.35) it.auction = { avg: r10(w.p * (0.93 + rnd() * 0.1)), min: r10(w.p * 0.7), max: r10(w.p * 1.35), n: 20 + Math.floor(rnd() * 200), markets: ['서울가락', '서울강서'], date: date(0) };
  items.push(it);
}
await mkdir(OUT, { recursive: true });
await writeFile(new URL('latest.json', OUT), JSON.stringify({ updated: new Date(Date.now() + 9 * 3600e3).toISOString(), source: 'sample', items }));
await writeFile(new URL('history.json', OUT), JSON.stringify(history));
console.log('sample written', items.length);
