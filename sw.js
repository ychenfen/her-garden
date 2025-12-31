// Service Worker - 她的花园 离线缓存
const CACHE_NAME = 'her-garden-v2';
const OFFLINE_URLS = [
    './',
    './index.html',
    './anatomy.html',
    './cycle-simulator.html',
    './checker.html',
    './kegel.html',
    './pleasure.html',
    './manifest.json'
];

// 外部依赖 (Three.js CDN)
const CDN_URLS = [
    'https://unpkg.com/three@0.160.0/build/three.module.js',
    'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js'
];

// 安装时缓存核心资源
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching core files');
            // 先缓存本地文件
            return cache.addAll(OFFLINE_URLS).then(() => {
                // 尝试缓存CDN资源（可能失败，不影响安装）
                return Promise.allSettled(
                    CDN_URLS.map(url =>
                        fetch(url).then(response => {
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                        }).catch(() => {
                            console.log('[SW] CDN cache skipped:', url);
                        })
                    )
                );
            });
        }).then(() => {
            // 立即激活，不等待
            return self.skipWaiting();
        })
    );
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            // 立即控制所有页面
            return self.clients.claim();
        })
    );
});

// 拦截请求 - 缓存优先策略
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 只处理 GET 请求
    if (event.request.method !== 'GET') return;

    // 对于本地资源：缓存优先
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // 返回缓存，同时后台更新
                    fetchAndCache(event.request);
                    return cachedResponse;
                }
                return fetchAndCache(event.request);
            })
        );
        return;
    }

    // 对于CDN资源：网络优先，失败时用缓存
    if (url.hostname === 'unpkg.com') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // 成功获取，更新缓存
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // 网络失败，尝试缓存
                    return caches.match(event.request);
                })
        );
        return;
    }
});

// 获取并缓存
function fetchAndCache(request) {
    return fetch(request).then((response) => {
        if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
            });
        }
        return response;
    }).catch(() => {
        // 离线且无缓存时的降级处理
        if (request.destination === 'document') {
            return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
    });
}
