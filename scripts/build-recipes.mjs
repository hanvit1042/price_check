// data-src/COOKRCP01.csv.gz (식약처 조리식품의 레시피 DB) → docs/data/recipes.json
//   사용: node scripts/build-recipes.mjs   (시세 품목 이름은 docs/data/latest.json 에서 읽는다)
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseCsv, buildRecipes } from './recipe-lib.mjs';

const root = new URL('../', import.meta.url);
const csv = gunzipSync(readFileSync(new URL('data-src/COOKRCP01.csv.gz', root))).toString('utf8');
const latest = JSON.parse(readFileSync(new URL('docs/data/latest.json', root), 'utf8'));
const FLOWERS = new Set(['안개꽃', '장미', '글라디올러스', '거베라', '백합', '국화', '카네이션', '튜울립']); // 꽃은 식재료가 아님(백합조개와 혼동 방지)
const ALWAYS = ['쇠고기', '돼지고기', '닭고기', '계란', '우유']; // 축산물은 일별 API 로 받으므로 항상 연결 대상에 포함
const names = [...new Set([...latest.items.map((i) => i.name), ...ALWAYS])].filter((n) => !FLOWERS.has(n));
const recipes = buildRecipes(parseCsv(csv), names);
writeFileSync(new URL('docs/data/recipes.json', root), JSON.stringify({ source: '식품의약품안전처 조리식품의 레시피 DB', count: recipes.length, recipes }));
const withM = recipes.filter((r) => r.m.length).length;
const cats = {}; recipes.forEach((r) => (cats[r.c] = (cats[r.c] ?? 0) + 1));
console.log(`레시피 ${recipes.length}개 (시세 재료 포함 ${withM}개)`, cats);
