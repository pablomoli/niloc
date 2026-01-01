/**
 * Lightweight loader for route planner scripts.
 * Loads the planner bundle on demand using the URLs provided in window.ROUTE_PLANNER_SCRIPTS.
 */
(function () {
    const scriptUrls = Array.isArray(window.ROUTE_PLANNER_SCRIPTS) ? window.ROUTE_PLANNER_SCRIPTS : [];
    let loadingPromise = null;
    let loaded = false;

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = false; // preserve execution order
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${url}`));
            document.body.appendChild(script);
        });
    }

    async function loadPlannerScripts() {
        if (loaded) return;
        if (loadingPromise) return loadingPromise;
        if (scriptUrls.length === 0) {
            throw new Error('Route planner scripts are not configured');
        }

        loadingPromise = (async () => {
            for (const url of scriptUrls) {
                await loadScript(url);
            }
            loaded = true;
        })().finally(() => {
            loadingPromise = null;
        });

        return loadingPromise;
    }

    window.RoutePlannerLoader = {
        load: loadPlannerScripts,
        isLoaded: () => loaded
    };
})();
