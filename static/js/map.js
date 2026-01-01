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

    // Initialize user location after a short delay
    setTimeout(initUserLocation, 1000);
}

// Run initialization when script loads
initializeApplication();

// Export AppState for debugging and external access
window.AppState = AppState;

