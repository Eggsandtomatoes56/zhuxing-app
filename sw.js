// 工作台 Service Worker - 离线缓存
const CACHE = 'zhuxing-v14';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// 安装：逐个缓存核心资源（任一失败不影响其它，避免原子性整体失败）
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const results = await Promise.allSettled(ASSETS.map((asset) => cache.add(asset)));
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.warn('[SW] 缓存失败:', ASSETS[i], r.reason);
      });
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存并接管
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：HTML 网络优先（保证更新及时），其它资源 Stale-While-Revalidate
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 导航请求（HTML 页面）：网络优先，失败回退缓存
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, copy));
        return resp;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 同源静态资源：Stale-While-Revalidate（先返回缓存保证首屏，后台更新）
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const networkFetch = fetch(e.request).then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, copy));
          }
          return resp;
        }).catch(() => cached);
        // 有缓存先返回，无缓存等网络
        return cached || networkFetch;
      })
    );
    return;
  }
  // 跨域资源（如代理抓取）：直接走网络，不缓存
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
