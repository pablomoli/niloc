/**
 * Map State Module
 * Centralized state management and persistence for the map application.
 */

/**
 * Escape HTML special characters to prevent XSS.
 * Shared utility used across all map and modal modules.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

// Export escapeHtml globally for use in other modules
window.escapeHtml = escapeHtml;

// Map view state persistence (center, zoom, base layer)
const MapViewState = {
    STORAGE_KEY: 'epicmap_map_view',
    DEFAULT_CENTER: [28.5383, -81.3792],
    DEFAULT_ZOOM: 10,

    get() {
        try {
            const stored = window.localStorage?.getItem(this.STORAGE_KEY);
            if (!stored) return null;
            return JSON.parse(stored);
        } catch (error) {
            console.warn('Unable to read map view state:', error);
            return null;
        }
    },

    set(center, zoom, baseLayer) {
        try {
            window.localStorage?.setItem(this.STORAGE_KEY, JSON.stringify({
                center: center,
                zoom: zoom,
                baseLayer: baseLayer
            }));
        } catch (error) {
            console.warn('Unable to persist map view state:', error);
        }
    },

    getInitialView() {
        const stored = this.get();
        if (stored && stored.center && stored.zoom) {
            return {
                center: stored.center,
                zoom: stored.zoom,
                baseLayer: stored.baseLayer || 'streets'
            };
        }
        return {
            center: this.DEFAULT_CENTER,
            zoom: this.DEFAULT_ZOOM,
            baseLayer: 'streets'
        };
    }
};

// Application State
const AppState = {
    map: null,
    markerLayer: null,
    useClustering: true,
    allJobs: [],
    filteredJobs: [],
    selectedJobs: new Set(),
    markers: new Map(),
    userLocationMarker: null,
    userAccuracyCircle: null,
    watchPositionId: null,
    userLocation: null,
    currentLocation: null,
    baseLayers: {},
    overlayLayers: {},
    currentBaseLayer: 'streets',
    countiesVisible: false,
    // POI (Point of Interest) state
    pois: [],
    poiMarkers: new Map(),
    selectedPois: new Set(),
    poisVisible: true
};

// Load POI visibility preference from localStorage
try {
    const storedPoisVisible = localStorage.getItem('epicmap_pois_visible');
    if (storedPoisVisible !== null) {
        AppState.poisVisible = storedPoisVisible === 'true';
    }
} catch (e) {
    console.warn('Failed to load POI visibility preference:', e);
}

// Location permission localStorage helpers
const LocationPermission = {
    STORAGE_KEY: 'epicmap_location_permission',
    EXPIRY_DAYS: 30,

    get() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return null;

            const data = JSON.parse(stored);
            const now = Date.now();

            if (data.timestamp && (now - data.timestamp) > (this.EXPIRY_DAYS * 24 * 60 * 60 * 1000)) {
                this.clear();
                return null;
            }

            return data.status;
        } catch (e) {
            console.error('Error reading location permission:', e);
            return null;
        }
    },

    set(status) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                status: status,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.error('Error saving location permission:', e);
        }
    },

    clear() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.error('Error clearing location permission:', e);
        }
    }
};

// Marker clustering preference stored in localStorage
const ClusterPreference = {
    STORAGE_KEY: 'epicmap_use_clustering',

    get() {
        try {
            const stored = window.localStorage?.getItem(this.STORAGE_KEY);
            if (stored === null || typeof stored === 'undefined') {
                return null;
            }
            return stored === 'true';
        } catch (error) {
            console.warn('Unable to read clustering preference:', error);
            return null;
        }
    },

    set(value) {
        try {
            window.localStorage?.setItem(this.STORAGE_KEY, value ? 'true' : 'false');
        } catch (error) {
            console.warn('Unable to persist clustering preference:', error);
        }
    }
};

// Load clustering preference
const storedClusteringPreference = ClusterPreference.get();
if (typeof storedClusteringPreference === 'boolean') {
    AppState.useClustering = storedClusteringPreference;
}

// Filter storage keys
const FILTER_STORAGE_KEY = 'epicmap_status_filters';
const TAG_FILTER_STORAGE_KEY = 'epicmap_tag_filters';
const DEFAULT_STATUS_FILTER = ['Needs Fieldwork'];

// Export to window
window.MapViewState = MapViewState;
window.AppState = AppState;
window.LocationPermission = LocationPermission;
window.ClusterPreference = ClusterPreference;
window.FILTER_STORAGE_KEY = FILTER_STORAGE_KEY;
window.TAG_FILTER_STORAGE_KEY = TAG_FILTER_STORAGE_KEY;
window.DEFAULT_STATUS_FILTER = DEFAULT_STATUS_FILTER;
