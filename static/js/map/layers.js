/**
 * Map Layers Module
 * Base layers, overlays, and layer switching functionality.
 */

const BASE_TILE_OPTIONS = {
    tileSize: 256,
    maxNativeZoom: 19,
    updateWhenIdle: true,
    crossOrigin: true,
    subdomains: ['server', 'services'],
};

/**
 * Initialize base layers for the map.
 */
function initializeBaseLayers() {
    AppState.baseLayers = {
        satellite: L.tileLayer('https://{s}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            ...BASE_TILE_OPTIONS,
            attribution: 'Tiles \u00a9 Esri'
        }),
        streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            ...BASE_TILE_OPTIONS,
            subdomains: ['a', 'b', 'c'],
            attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        })
    };

    // Add the persisted or default base layer
    if (!AppState.baseLayers[AppState.currentBaseLayer]) {
        AppState.currentBaseLayer = 'streets';
    }
    AppState.baseLayers[AppState.currentBaseLayer].addTo(AppState.map);
}

// Debounced map view state save
let mapViewSaveTimer = null;

/**
 * Persist the map's current center, zoom level, and active base layer.
 */
function saveMapViewState() {
    if (mapViewSaveTimer) clearTimeout(mapViewSaveTimer);
    mapViewSaveTimer = setTimeout(() => {
        const center = AppState.map.getCenter();
        const zoom = AppState.map.getZoom();
        MapViewState.set([center.lat, center.lng], zoom, AppState.currentBaseLayer);
    }, 500);
}

/**
 * Switch the map's base layer.
 * @param {string} layerName - The base layer identifier ('satellite' or 'streets').
 */
function switchBaseLayer(layerName) {
    if (AppState.baseLayers[layerName] && layerName !== AppState.currentBaseLayer) {
        AppState.map.removeLayer(AppState.baseLayers[AppState.currentBaseLayer]);
        AppState.baseLayers[layerName].addTo(AppState.map);
        AppState.currentBaseLayer = layerName;
        saveMapViewState();

        const layerNames = {
            satellite: 'Satellite',
            streets: 'Street Map'
        };

        showNotification(`Switched to ${layerNames[layerName]}`, 'info');
    }
}

// Counties layer promise for lazy loading
let countiesLayerPromise = null;

/**
 * Load Florida counties GeoJSON layer.
 */
async function loadFloridaCounties() {
    if (AppState.overlayLayers.counties) {
        return AppState.overlayLayers.counties;
    }
    if (countiesLayerPromise) {
        return countiesLayerPromise;
    }

    countiesLayerPromise = (async () => {
        const response = await fetch('/static/data/florida_counties.geojson');
        if (!response.ok) {
            throw new Error(`Failed to fetch counties: ${response.status}`);
        }
        const countiesData = await response.json();

        const countiesLayer = L.geoJSON(countiesData, {
            style: {
                color: '#ff0000',
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0
            },
            onEachFeature: function (feature, layer) {
                if (feature.properties && feature.properties.NAME) {
                    const bounds = layer.getBounds();
                    const center = bounds.getCenter();

                    const label = L.marker(center, {
                        icon: L.divIcon({
                            className: 'county-label',
                            html: `<div class="county-name">${feature.properties.NAME}</div>`,
                            iconSize: [100, 20],
                            iconAnchor: [50, 10]
                        }),
                        interactive: false
                    });

                    layer.countyLabel = label;
                }
            }
        });

        AppState.overlayLayers.counties = countiesLayer;
        return countiesLayer;
    })();

    try {
        return await countiesLayerPromise;
    } catch (error) {
        countiesLayerPromise = null;
        throw error;
    }
}

/**
 * Toggle Florida counties overlay.
 */
async function toggleCounties() {
    try {
        const countiesLayer = await loadFloridaCounties();

        if (AppState.countiesVisible) {
            AppState.map.removeLayer(countiesLayer);
            countiesLayer.eachLayer(function (layer) {
                if (layer.countyLabel) {
                    AppState.map.removeLayer(layer.countyLabel);
                }
            });
            AppState.countiesVisible = false;
            showNotification('County boundaries hidden', 'info');
        } else {
            countiesLayer.addTo(AppState.map);
            countiesLayer.eachLayer(function (layer) {
                if (layer.countyLabel) {
                    layer.countyLabel.addTo(AppState.map);
                }
            });
            AppState.countiesVisible = true;
            showNotification('County boundaries shown', 'info');
        }
    } catch (error) {
        console.error('Failed to toggle Florida counties:', error);
        showNotification('Failed to load county boundaries', 'error');
    }
}

// Export to window
window.initializeBaseLayers = initializeBaseLayers;
window.saveMapViewState = saveMapViewState;
window.switchBaseLayer = switchBaseLayer;
window.loadFloridaCounties = loadFloridaCounties;
window.toggleCounties = toggleCounties;
