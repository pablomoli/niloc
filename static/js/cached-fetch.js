(function () {
    const DEFAULT_TTL = 60_000; // 1 minute
    const STORAGE_PREFIX = "api-cache:";
    const cacheStore = new Map();

    function buildKey(url, method, customKey) {
        if (customKey) return customKey;
        return `${method}:${url}`;
    }

    function cloneResponseSnapshot(snapshot) {
        const headers = new Headers();
        (snapshot.headers || []).forEach(([name, value]) => headers.append(name, value));
        return new Response(snapshot.bodyText, {
            status: snapshot.status,
            statusText: snapshot.statusText,
            headers
        });
    }

    function persistSupported() {
        try {
            const testKey = `${STORAGE_PREFIX}__test__`;
            window.sessionStorage.setItem(testKey, "1");
            window.sessionStorage.removeItem(testKey);
            return true;
        } catch (_) {
            return false;
        }
    }

    const canPersist = persistSupported();

    function readPersistedEntry(key) {
        if (!canPersist) return null;
        try {
            const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.expiresAt !== "number" || !parsed.snapshot) {
                window.sessionStorage.removeItem(STORAGE_PREFIX + key);
                return null;
            }
            if (parsed.expiresAt <= Date.now()) {
                window.sessionStorage.removeItem(STORAGE_PREFIX + key);
                return null;
            }
            return {
                expiresAt: parsed.expiresAt,
                snapshot: parsed.snapshot
            };
        } catch (_) {
            return null;
        }
    }

    function persistEntry(key, entry) {
        if (!canPersist) return;
        try {
            const payload = JSON.stringify({
                expiresAt: entry.expiresAt,
                snapshot: entry.snapshot
            });
            window.sessionStorage.setItem(STORAGE_PREFIX + key, payload);
        } catch (_) {
            // Ignore storage quota errors silently
        }
    }

    function removePersisted(key) {
        if (!canPersist) return;
        try {
            window.sessionStorage.removeItem(STORAGE_PREFIX + key);
        } catch (_) {
            // ignore
        }
    }

    function cloneEntry(entry) {
        return {
            expiresAt: entry.expiresAt,
            promise: Promise.resolve(entry.snapshot),
            snapshot: entry.snapshot
        };
    }

    async function resolveEntry(entry, key) {
        try {
            const snapshot = await entry.promise;
            return cloneResponseSnapshot(snapshot);
        } catch (error) {
            cacheStore.delete(key);
            removePersisted(key);
            throw error;
        }
    }

    async function cachedFetch(url, options = {}, cacheOptions = {}) {
        const method = (options.method || "GET").toUpperCase();
        const {
            force = false,
            ttl = DEFAULT_TTL,
            cacheKey = null,
            cacheable = true,
            persist = true
        } = cacheOptions;

        if (method !== "GET" || !cacheable || ttl <= 0) {
            if (force) {
                invalidate(cacheKey || url, method);
            }
            return fetch(url, options);
        }

        const key = buildKey(url, method, cacheKey);

        if (force) {
            cacheStore.delete(key);
            removePersisted(key);
        }

        const now = Date.now();
        let entry = cacheStore.get(key);

        if (!entry) {
            const persisted = readPersistedEntry(key);
            if (persisted) {
                entry = cloneEntry(persisted);
                cacheStore.set(key, entry);
            }
        }

        if (entry && entry.expiresAt > now) {
            return resolveEntry(entry, key);
        }

        if (entry) {
            cacheStore.delete(key);
            removePersisted(key);
        }

        const expiresAt = now + ttl;
        entry = {
            expiresAt,
            promise: fetch(url, options).then(async (response) => {
                if (!response.ok) {
                    const error = new Error(`Request failed with status ${response.status}`);
                    error.response = response;
                    throw error;
                }

                const headers = [];
                response.headers.forEach((value, name) => {
                    headers.push([name, value]);
                });

                const snapshot = {
                    bodyText: await response.clone().text(),
                    status: response.status,
                    statusText: response.statusText,
                    headers
                };

                entry.snapshot = snapshot;
                if (persist) {
                    persistEntry(key, { expiresAt, snapshot });
                }
                return snapshot;
            })
        };

        cacheStore.set(key, entry);
        return resolveEntry(entry, key);
    }

    function invalidate(identifier, method = "GET") {
        if (!identifier) return;
        const options = [
            identifier,
            `${method.toUpperCase()}:${identifier}`,
            `GET:${identifier}`
        ];

        for (const key of options) {
            if (cacheStore.delete(key)) {
                removePersisted(key);
                return;
            }
            removePersisted(key);
        }
    }

    function invalidateMatching(prefix) {
        if (!prefix) return;
        const keys = Array.from(cacheStore.keys());
        for (const key of keys) {
            if (key.includes(prefix)) {
                cacheStore.delete(key);
                removePersisted(key);
            }
        }

        if (!canPersist) return;
        try {
            const toRemove = [];
            for (let i = 0; i < window.sessionStorage.length; i += 1) {
                const storageKey = window.sessionStorage.key(i);
                if (storageKey && storageKey.startsWith(STORAGE_PREFIX)) {
                    if (storageKey.includes(prefix)) {
                        toRemove.push(storageKey);
                    }
                }
            }
            toRemove.forEach((k) => window.sessionStorage.removeItem(k));
        } catch (_) {
            // ignore storage iteration errors
        }
    }

    function clear() {
        cacheStore.clear();

        if (!canPersist) return;
        try {
            const keys = [];
            for (let i = 0; i < window.sessionStorage.length; i += 1) {
                const storageKey = window.sessionStorage.key(i);
                if (storageKey && storageKey.startsWith(STORAGE_PREFIX)) {
                    keys.push(storageKey);
                }
            }
            keys.forEach((k) => window.sessionStorage.removeItem(k));
        } catch (_) {
            // ignore
        }
    }

    window.ApiCache = {
        fetch: cachedFetch,
        invalidate,
        invalidateMatching,
        clear,
        DEFAULT_TTL
    };

    window.cachedFetch = cachedFetch;
})();
