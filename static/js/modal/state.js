/**
 * Modal State Module
 * Tag cache and modal state management.
 */

// In-memory Tag cache for the map session
window.TagCache = {
    items: [],
    loaded: false,
    async loadOnce() {
        if (this.loaded && Array.isArray(this.items) && this.items.length) return this.items;
        try {
            const fetcher = window.cachedFetch || window.fetch;
            const resp = await fetcher('/api/tags', {}, { ttl: 120_000 });
            this.items = await resp.json();
        } catch (_) {
            this.items = [];
        }
        this.loaded = true;
        return this.items;
    },
    invalidate() {
        this.loaded = false;
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/tags');
        }
    },
    add(tag) {
        if (tag && tag.id && !this.items.find(t => t.id === tag.id)) {
            this.items.push(tag);
        }
    }
};

// SimpleModal state object
window.SimpleModal = {
    currentJob: null,
    fieldworkData: [],
    fieldworkLoaded: false,
    allTags: [],
    confirmModal: {
        title: '',
        message: '',
        callback: null
    }
};

