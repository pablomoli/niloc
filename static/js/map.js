/**
 * Map Main Entry Point
 * Coordinates all map modules and handles initialization.
 *
 * Dependencies (must be loaded before this file):
 * - static/js/map/state.js
 * - static/js/map/notifications.js
 * - static/js/map/location.js
 * - static/js/map/layers.js
 * - static/js/map/markers.js
 * - static/js/map/pois.js
 * - static/js/map/selection.js
 * - static/js/map/filters.js
 */

/**
 * Initialize the map instance with persisted or default view settings.
 */
function initializeMap() {
    const initialView = MapViewState.getInitialView();
    AppState.map = L.map('map', { preferCanvas: true }).setView(initialView.center, initialView.zoom);
    AppState.currentBaseLayer = initialView.baseLayer;
}

/**
 * Set up map event listeners for view state persistence.
 */
function setupMapEventListeners() {
    AppState.map.on('moveend', saveMapViewState);
    AppState.map.on('zoomend', saveMapViewState);
}

/**
 * Run the full initialization sequence.
 */
function initializeApplication() {
    // Initialize map instance
    initializeMap();

    // Initialize base layers (satellite/streets)
    initializeBaseLayers();

    // Initialize marker layer (clustered or simple)
    initializeMarkerLayer();

    // Set up map event listeners
    setupMapEventListeners();

    // Load jobs from server
    loadJobs();

    // Load POIs from server
    loadPois();
}

// Run initialization when script loads
initializeApplication();

// Provide a lightweight centerOnOffice fallback; Route Planner overrides when loaded.
const DEFAULT_OFFICE_LOCATION = {
    lat: 28.5039192,
    lng: -81.0773325,
    name: 'Office'
};

async function centerOnOfficeFallback() {
    const initialHandler = window.centerOnOffice;

    // If RoutePlanner has loaded, defer to its implementation.
    if (window.RoutePlannerLoader?.isLoaded() && window.centerOnOffice !== centerOnOfficeFallback) {
        return window.centerOnOffice();
    }

    // Try to load the route planner on demand.
    if (window.RoutePlannerLoader && typeof window.RoutePlannerLoader.load === 'function') {
        try {
            await window.RoutePlannerLoader.load();
        } catch (error) {
            console.error('Failed to load route planner for centering:', error);
        }
        if (window.centerOnOffice && window.centerOnOffice !== initialHandler) {
            return window.centerOnOffice();
        }
    }

    // Fallback: center on epicenter POI or default office.
    const pois = window.AppState?.pois || [];
    const epicenter = pois.find(poi =>
        poi.name && poi.name.toLowerCase().includes('epicenter')
    );
    const start = epicenter || DEFAULT_OFFICE_LOCATION;

    if (start && window.AppState?.map && Number.isFinite(start.lat) && Number.isFinite(start.lng)) {
        window.AppState.map.setView([start.lat, start.lng], 14);
        if (window.showNotification) {
            window.showNotification(`Centered on ${start.name || 'office'}`, 'info');
        }
    } else {
        console.warn('No office location available to center on.');
    }
}

window.centerOnOffice = centerOnOfficeFallback;

// Export AppState for debugging and external access
window.AppState = AppState;
