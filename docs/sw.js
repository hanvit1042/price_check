const V = 'v18';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'judge.js', 'ocr-parse.js', 'emoji.js', 'pack.js', 'season.js', 'deals.js', 'recipes.js', 'menu.js', 'units.js', 'regions.js', 'help.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isData = req.url.includes('/data/');
  // 시세 데이터·화면 코드는 네트워크 우선(매번 서버에 최신 여부 확인), 오프라인이면 캐시
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); return res;
  }).catch(() => caches.match(req).then((r) => r || (isData ? new Response('{}', { status: 503 }) : caches.match('index.html')))));
});
