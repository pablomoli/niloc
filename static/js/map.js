/**
 * Display a transient toast-style notification in the page's #notification-container.
 *
 * Appends a notification element with an icon determined by `type`, auto-dismisses after 3 seconds,
 * and supports manual dismissal via click or vertical swipe.
 * @param {string} message - The text content to show inside the notification.
 * @param {('info'|'success'|'error'|'warning')} [type='info'] - Visual style and icon for the notification.
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Icon based on type
    const icons = {
        success: '<i class="bi bi-check-circle-fill"></i>',
        error: '<i class="bi bi-exclamation-triangle-fill"></i>',
        info: '<i class="bi bi-info-circle-fill"></i>',
        warning: '<i class="bi bi-exclamation-triangle-fill"></i>'
    };
    
    notification.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    // Add to container
    container.appendChild(notification);
    
    // Remove notification after delay
    const removeNotification = () => {
        notification.classList.add('hiding');
        setTimeout(() => {
            notification.remove();
        }, 300);
    };
    
    // Auto-dismiss after 3 seconds
    const timeout = setTimeout(removeNotification, 3000);
    
    // Click/tap to dismiss
    notification.addEventListener('click', () => {
        clearTimeout(timeout);
        removeNotification();
    });
    
    // Touch swipe to dismiss
    let startY = 0;
    notification.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
    });
    
    notification.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            notification.style.transform = `translateY(${diff}px)`;
            notification.style.opacity = 1 - (diff / 100);
        }
    });
    
    notification.addEventListener('touchend', (e) => {
        const currentY = e.changedTouches[0].clientY;
        const diff = currentY - startY;
        if (diff > 50) {
            clearTimeout(timeout);
            removeNotification();
        } else {
            notification.style.transform = '';
            notification.style.opacity = '';
        }
    });
}

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
    markers: new Map(), // Store marker references by job_number
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
    poiMarkers: new Map(), // Store POI marker references by id
    selectedPois: new Set() // Track selected POI ids
};

// Initialize map with persisted or default view
const initialView = MapViewState.getInitialView();
AppState.map = L.map('map', { preferCanvas: true }).setView(initialView.center, initialView.zoom);
AppState.currentBaseLayer = initialView.baseLayer;

const BASE_TILE_OPTIONS = {
    tileSize: 256,
    maxNativeZoom: 19,
    updateWhenIdle: true,
    crossOrigin: true,
    subdomains: ['server', 'services'],
};

// Create base layers
AppState.baseLayers = {
    satellite: L.tileLayer('https://{s}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        ...BASE_TILE_OPTIONS,
        attribution: 'Tiles © Esri'
    }),
    streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        ...BASE_TILE_OPTIONS,
        subdomains: ['a', 'b', 'c'],
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    })
};

// Add the persisted or default base layer (streets is default)
if (!AppState.baseLayers[AppState.currentBaseLayer]) {
    AppState.currentBaseLayer = 'streets';
}
AppState.baseLayers[AppState.currentBaseLayer].addTo(AppState.map);

// Save map view state when it changes (debounced)
let mapViewSaveTimer = null;
/**
 * Persist the map's current center, zoom level, and active base layer to storage,
 * scheduling the write after a short debounce to avoid excessive writes.
 *
 * Cancels any previously scheduled save and schedules a new save to run after 500ms.
 */
function saveMapViewState() {
    if (mapViewSaveTimer) clearTimeout(mapViewSaveTimer);
    mapViewSaveTimer = setTimeout(() => {
        const center = AppState.map.getCenter();
        const zoom = AppState.map.getZoom();
        MapViewState.set([center.lat, center.lng], zoom, AppState.currentBaseLayer);
    }, 500);
}

AppState.map.on('moveend', saveMapViewState);
AppState.map.on('zoomend', saveMapViewState);

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
            
            // Check if expired (30 days)
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

const storedClusteringPreference = ClusterPreference.get();
if (typeof storedClusteringPreference === 'boolean') {
    AppState.useClustering = storedClusteringPreference;
}

/**
 * Initialize and request the user's geolocation, update application state, and reflect results in the UI.
 *
 * Checks stored location permission and, if not previously denied, requests the current position. On success:
 * - marks permission as `granted`,
 * - stores the user's location in AppState.userLocation,
 * - centers the map only if no saved map view exists,
 * - creates/updates the user location marker,
 * - starts continuous position watching,
 * - shows a success notification.
 *
 * On error, maps geolocation error codes to user-facing messages and shows an error notification. If the error is
 * a permission denial, records the denial via LocationPermission.set('denied') and schedules a gentle re-enable prompt.
 */
function initUserLocation() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'error');
        return;
    }
    
    // Check stored permission preference
    const storedPermission = LocationPermission.get();
    
    if (storedPermission === 'denied') {
        // User previously denied, show gentle reminder instead of forcing request
        showLocationPrompt();
        return;
    }
    
    // If granted or no stored preference, try to get location
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;

            // Store successful permission grant
            LocationPermission.set('granted');

            // Store user location
            AppState.userLocation = { lat: latitude, lng: longitude, accuracy };

            // Only center on user location if no saved map state exists
            const hasSavedState = MapViewState.get() !== null;
            if (!hasSavedState) {
                AppState.map.setView([latitude, longitude], 15);
            }

            // Create or update user location marker
            updateUserLocationMarker(latitude, longitude, accuracy);

            // Start watching position
            startWatchingPosition();

            showNotification('Location found', 'success');
        },
        (error) => {
            console.error('Geolocation error:', error);
            let message = 'Unable to get your location';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    message = 'Location permission denied';
                    // Store denial to avoid repeated prompts
                    LocationPermission.set('denied');
                    // Show prompt for re-enabling
                    setTimeout(() => showLocationPrompt(), 2000);
                    break;
                case error.POSITION_UNAVAILABLE:
                    message = 'Location information unavailable';
                    break;
                case error.TIMEOUT:
                    message = 'Location request timed out';
                    break;
            }
            
            showNotification(message, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Show gentle prompt for users who denied location
function showLocationPrompt() {
    // Create a non-intrusive prompt
    const prompt = document.createElement('div');
    prompt.className = 'location-prompt';
    prompt.innerHTML = `
        <div style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); 
                    background: white; padding: 15px 20px; border-radius: 8px; 
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000; 
                    display: flex; align-items: center; gap: 10px; max-width: 90%; width: auto;">
            <i class="bi bi-geo-alt" style="color: #0066cc;"></i>
            <span>Enable location to see your position on the map</span>
            <button onclick="retryLocation()" style="background: #0066cc; color: white; 
                    border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">
                Enable
            </button>
            <button onclick="this.parentElement.remove()" style="background: #f0f0f0; 
                    border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">
                Dismiss
            </button>
        </div>
    `;
    document.body.appendChild(prompt);
    
    // Auto-remove after 10 seconds
    setTimeout(() => prompt.remove(), 10000);
}

// Retry location access (clear stored denial and try again)
function retryLocation() {
    LocationPermission.clear();
    document.querySelector('.location-prompt')?.remove();
    initUserLocation();
}

// Update user location marker and accuracy circle
function updateUserLocationMarker(lat, lng, accuracy) {
    // Remove existing marker and circle
    if (AppState.userLocationMarker) {
        AppState.map.removeLayer(AppState.userLocationMarker);
    }
    if (AppState.userAccuracyCircle) {
        AppState.map.removeLayer(AppState.userAccuracyCircle);
    }
    
    // Create accuracy circle
    AppState.userAccuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        className: 'user-accuracy-circle',
        interactive: false
    }).addTo(AppState.map);
    
    // Create user location marker
    if (window.MarkerUtils) {
        AppState.userLocationMarker = MarkerUtils.createUserLocationMarker(lat, lng);
    } else {
        // Fallback marker
        AppState.userLocationMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: '<div style="width: 12px; height: 12px; background: #4285F4; border: 2px solid white; border-radius: 50%;"></div>',
                className: 'user-location-fallback',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        });
    }
    
    AppState.userLocationMarker.addTo(AppState.map);
}

// Start watching user position
function startWatchingPosition() {
    if (!navigator.geolocation) return;
    
    // Clear any existing watch
    if (AppState.watchPositionId) {
        navigator.geolocation.clearWatch(AppState.watchPositionId);
    }
    
    AppState.watchPositionId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            // Update stored location
            AppState.userLocation = { lat: latitude, lng: longitude, accuracy };
            
            // Update marker position
            updateUserLocationMarker(latitude, longitude, accuracy);
        },
        (error) => {
            console.error('Watch position error:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 1000
        }
    );
}

// Center map on user location
function centerOnUserLocation() {
    if (AppState.userLocation) {
        AppState.map.setView([AppState.userLocation.lat, AppState.userLocation.lng], 16);
        showNotification('Centered on your location', 'info');
    } else {
        // Check if location was previously denied
        const storedPermission = LocationPermission.get();
        if (storedPermission === 'denied') {
            showLocationPrompt();
        } else {
            showNotification('Getting your location...', 'info');
            initUserLocation(); // Try to get location again
        }
    }
}

let countiesLayerPromise = null;

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
            onEachFeature: function(feature, layer) {
                if (feature.properties && feature.properties.NAME) {
                    // Create county label
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
 * Switches the map's base layer to the specified layer and persists the selection.
 *
 * If the specified layer is unknown or already active, no change is made.
 *
 * @param {string} layerName - The base layer identifier to switch to. Expected values: `'satellite'` or `'streets'`.
 */
function switchBaseLayer(layerName) {
    if (AppState.baseLayers[layerName] && layerName !== AppState.currentBaseLayer) {
        // Remove current base layer
        AppState.map.removeLayer(AppState.baseLayers[AppState.currentBaseLayer]);

        // Add new base layer
        AppState.baseLayers[layerName].addTo(AppState.map);

        // Update state
        AppState.currentBaseLayer = layerName;

        // Persist the change
        saveMapViewState();

        const layerNames = {
            satellite: 'Satellite',
            streets: 'Street Map'
        };

        showNotification(`Switched to ${layerNames[layerName]}`, 'info');
    }
}

// Toggle Florida counties overlay
async function toggleCounties() {
    try {
        const countiesLayer = await loadFloridaCounties();

        if (AppState.countiesVisible) {
            AppState.map.removeLayer(countiesLayer);
            countiesLayer.eachLayer(function(layer) {
                if (layer.countyLabel) {
                    AppState.map.removeLayer(layer.countyLabel);
                }
            });
            AppState.countiesVisible = false;
            showNotification('County boundaries hidden', 'info');
        } else {
            countiesLayer.addTo(AppState.map);
            countiesLayer.eachLayer(function(layer) {
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

// Initialize user location after map loads
setTimeout(initUserLocation, 1000);

// Remove legend - we're using the control panel instead
// if (window.MarkerUtils) {
//     MarkerUtils.createStatusLegend().addTo(AppState.map);
// }

function createClusterLayer() {
    return L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 18, // Disable clustering at high zoom for better performance
        chunkedLoading: true, // Load markers in chunks for better performance
        chunkDelay: 50, // Delay between chunks (ms)
        chunkInterval: 200, // Interval between chunks (ms)
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });
}

function initializeMarkerLayer() {
    if (AppState.markerLayer) {
        try {
            AppState.markerLayer.clearLayers();
        } catch (error) {
            console.warn('Failed to clear existing marker layer:', error);
        }
        AppState.map.removeLayer(AppState.markerLayer);
    }
    
    const clusteringAvailable = typeof L.markerClusterGroup === 'function';
    const shouldUseClustering = Boolean(AppState.useClustering && clusteringAvailable);
    
    if (shouldUseClustering) {
        AppState.markerLayer = createClusterLayer();
    } else {
        if (AppState.useClustering && !clusteringAvailable) {
            console.warn('Leaflet.markercluster not loaded. Falling back to regular markers.');
            ClusterPreference.set(false);
        }
        AppState.useClustering = false;
        AppState.markerLayer = L.layerGroup();
    }
    
    AppState.map.addLayer(AppState.markerLayer);
}

function setMarkerClusteringEnabled(enable) {
    const clusteringAvailable = typeof L.markerClusterGroup === 'function';
    if (enable && !clusteringAvailable) {
        if (typeof showNotification === 'function') {
            showNotification('Marker grouping is unavailable in this environment', 'warning');
        } else {
            console.warn('Marker clustering requested but plugin is not available.');
        }
        AppState.useClustering = false;
        return false;
    }
    
    const nextState = Boolean(enable && clusteringAvailable);
    if (AppState.useClustering === nextState && AppState.markerLayer) {
        return AppState.useClustering;
    }
    
    AppState.useClustering = nextState;
    ClusterPreference.set(AppState.useClustering);
    initializeMarkerLayer();
    updateMapMarkers();
    
    if (typeof showNotification === 'function') {
        showNotification(AppState.useClustering ? 'Grouped markers enabled' : 'Showing individual markers', 'info');
    }
    
    return AppState.useClustering;
}

initializeMarkerLayer();

// Load and display jobs
async function loadJobs(force = false) {
    try {
        const fetcher = window.cachedFetch || window.fetch;
        // Request all jobs (default is 1000, which is fine for ~1000 entry datasets)
        // Skip tags for map view to improve performance (tags not displayed on map markers)
        const response = await fetcher('/api/jobs?include_tags=false', {}, { ttl: 30_000, force });
        const data = await response.json();
        AppState.allJobs = Array.isArray(data) ? data : data.jobs || [];
        AppState.filteredJobs = [...AppState.allJobs];
        
        updateMapMarkers();
        updateCounts();
        
        // Initialize status filters (only if container exists)
        if (window.MarkerUtils) {
            const filterContainer = document.getElementById('status-filters');
            if (filterContainer) {
                createStatusFilters(AppState.allJobs, filterContainer);
            }
        }
        
        // Emit event for FAB menu to update statuses
        document.dispatchEvent(new CustomEvent('jobsLoaded'));
        
        console.log(`Loaded ${AppState.allJobs.length} jobs`);
    } catch (error) {
        console.error('Failed to load jobs:', error);
    }
}

// Update markers on the map (optimized with throttling)
let markerUpdateTimer = null;
function updateMapMarkers() {
    if (!AppState.markerLayer) {
        console.warn('Marker layer not initialized yet');
        return;
    }
    
    // Throttle marker updates to prevent excessive redraws
    if (markerUpdateTimer) clearTimeout(markerUpdateTimer);
    markerUpdateTimer = setTimeout(() => {
        performMarkerUpdate();
    }, 100); // 100ms throttle
}

function performMarkerUpdate() {
    // Clear existing markers
    AppState.markerLayer.clearLayers();
    AppState.markers.clear();
    
    // Get visible bounds for viewport-based filtering (performance optimization)
    const bounds = AppState.map.getBounds();
    const visibleJobs = AppState.filteredJobs.filter(job => {
        const lat = parseFloat(job.latitude || job.lat);
        const lng = parseFloat(job.longitude || job.long);
        if (!lat || !lng) return false;
        return bounds.contains([lat, lng]);
    });
    
    // If too many markers, only show visible ones; otherwise show all filtered
    const jobsToRender = visibleJobs.length > 1000 ? visibleJobs : AppState.filteredJobs;
    
    jobsToRender.forEach(job => {
        const lat = job.latitude || job.lat;
        const lng = job.longitude || job.long;
        
        if (lat && lng) {
            const isSelected = AppState.selectedJobs.has(job.job_number);
            
            // Use custom marker if MarkerUtils is available
            let marker;
            if (window.MarkerUtils) {
                marker = MarkerUtils.createJobMarker(lat, lng, job, isSelected);
            } else {
                // Fallback to default marker
                marker = L.marker([lat, lng])
                    .bindPopup(`
                        <strong>${job.job_number}</strong><br>
                        ${job.client}<br>
                        ${job.address}
                    `);
            }
            
            // Add click handler for selection (works for both click and touch)
            marker.on('click', function(e) {
                handleMarkerClick(e, job);
            });
            
            // Store marker reference
            AppState.markers.set(job.job_number, marker);
            
            // Add to marker layer (cluster or simple layer group)
            AppState.markerLayer.addLayer(marker);
        }
    });
    
    // Refresh clusters if using clustering
    if (AppState.useClustering && AppState.markerLayer.refreshClusters) {
        AppState.markerLayer.refreshClusters();
    }
}

// Handle marker click for selection
function handleMarkerClick(e, job) {
    // Always get the latest job data from cache
    const latestJob = AppState.allJobs.find(j => j.job_number === job.job_number) || job;
    
    // Check if it's a multi-select click
    const isMultiSelect = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
    
    if (isMultiSelect) {
        // Multi-select mode
        toggleJobSelection(latestJob);
    } else {
        // Single select mode - open modal
        AppState.selectedJobs.clear();
        AppState.selectedJobs.add(latestJob.job_number);
        updateMapMarkers();

        // Open details modal (no fallback)
        if (window.SimpleModal && typeof window.SimpleModal.show === 'function') {
            window.SimpleModal.show(latestJob);
        } else {
            console.error('SimpleModal not available');
        }
    }
}

// Update a job marker (e.g., after status change)
function updateJobMarker(jobNumber, updatedJob) {
    let marker = AppState.markers.get(jobNumber);
    const hasMarkerUtils = Boolean(window.MarkerUtils);

    // Update cached job data so future operations use fresh values
    const mergeIntoCache = (arr) => {
        const idx = arr.findIndex(j => j.job_number === jobNumber);
        if (idx !== -1) arr[idx] = { ...arr[idx], ...updatedJob };
    };
    if (Array.isArray(AppState.allJobs)) mergeIntoCache(AppState.allJobs);
    if (Array.isArray(AppState.filteredJobs)) mergeIntoCache(AppState.filteredJobs);

    const isSelected = AppState.selectedJobs.has(jobNumber);
    const lat = updatedJob.latitude || updatedJob.lat;
    const lng = updatedJob.longitude || updatedJob.long;

    // Ensure a marker exists; create one if missing and we have coords
    if (!marker && lat && lng) {
        const icon = hasMarkerUtils ? MarkerUtils.getStatusIcon(updatedJob.status, isSelected) : undefined;
        marker = L.marker([lat, lng], icon ? { icon } : undefined);
        // Click handler uses the latest cached job
        marker.on('click', function (e) {
            const j = (AppState.allJobs || []).find(x => x.job_number === jobNumber) || updatedJob;
            handleMarkerClick(e, j);
        });
        AppState.markers.set(jobNumber, marker);
        if (AppState.markerLayer && typeof AppState.markerLayer.addLayer === 'function') {
            AppState.markerLayer.addLayer(marker);
        } else if (AppState.map && typeof marker.addTo === 'function') {
            marker.addTo(AppState.map);
        }
    }

    if (marker) {
        // Update icon to reflect new status/selection
        if (hasMarkerUtils) {
            marker.setIcon(MarkerUtils.getStatusIcon(updatedJob.status, isSelected));
        }

        // Move marker if coordinates changed
        if (lat && lng && marker.setLatLng) {
            marker.setLatLng([lat, lng]);
            // Refresh clusters if available
            if (AppState.useClustering && AppState.markerLayer && typeof AppState.markerLayer.refreshClusters === 'function') {
                try { AppState.markerLayer.refreshClusters(marker); } catch (_) {}
            }
        }

        // Re-bind click to latest job data
        marker.off('click');
        marker.on('click', function (e) {
            const j = (AppState.allJobs || []).find(x => x.job_number === jobNumber) || updatedJob;
            handleMarkerClick(e, j);
        });

        // Update popup content if exists
        if (marker.getPopup) {
            const popup = marker.getPopup();
            if (popup) {
                popup.setContent(`
                    <strong>${updatedJob.job_number}</strong><br>
                    Client: ${updatedJob.client}<br>
                    Status: ${updatedJob.status}
                `);
            }
        }
    }
}

/**
 * Toggle the selection state of a job and update its marker and selection state observers.
 * @param {Object} job - The job object; must include `job_number` (used as the selection key) and `status` (used to update the marker icon).
 */
function toggleJobSelection(job) {
    if (AppState.selectedJobs.has(job.job_number)) {
        AppState.selectedJobs.delete(job.job_number);
    } else {
        AppState.selectedJobs.add(job.job_number);
    }

    // Update just this marker
    const marker = AppState.markers.get(job.job_number);
    if (marker && window.MarkerUtils) {
        const isSelected = AppState.selectedJobs.has(job.job_number);
        marker.setIcon(MarkerUtils.getStatusIcon(job.status, isSelected));
    }

    updateSelectedJobsInfo();

    // Dispatch unified selection changed event
    dispatchSelectionChangedEvent();
}

/**
 * Update the UI and console with the current number of selected jobs.
 *
 * If an element with id "selectedCount" exists, its text is set to "Selected: X jobs".
 * Always logs the selected jobs count to the console.
 */
function updateSelectedJobsInfo() {
    console.log(`Selected jobs: ${AppState.selectedJobs.size}`);
    // Update UI elements that show selected jobs count (only if element exists)
    const selectedCountElement = document.getElementById('selectedCount');
    if (selectedCountElement) {
        selectedCountElement.textContent = `Selected: ${AppState.selectedJobs.size} jobs`;
    }
}

/**
 * Clear all selected jobs and POIs, refresh map and POI markers, update selection UI, and emit a unified selection-changed event.
 *
 * This removes all IDs from the application's selectedJobs and selectedPois sets, refreshes map markers and POI markers so selection visuals are cleared, updates selection count information in the UI, and dispatches the consolidated selection changed event consumed by other parts of the app.
 */
function clearSelection() {
    AppState.selectedJobs.clear();
    AppState.selectedPois.clear();
    updateMapMarkers();
    renderPoiMarkers(); // Re-render POI markers to clear selection state
    updateSelectedJobsInfo();

    // Dispatch unified selection changed event
    dispatchSelectionChangedEvent();
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Escape key to clear selection
    if (e.key === 'Escape') {
        if (AppState.selectedJobs.size > 0 || AppState.selectedPois.size > 0) {
            clearSelection();
        }
    }
});

// =============================================================================
// POI (Point of Interest) Functions
// =============================================================================

/**
 * Fetches POIs from the server, stores them in application state, renders their markers, and notifies listeners.
 *
 * On success, replaces AppState.pois with the fetched array (or an empty array if the response is not an array),
 * calls renderPoiMarkers() to update map markers, logs the loaded count, and dispatches a 'poisLoaded' CustomEvent
 * with { pois: AppState.pois } in the event detail.
 *
 * Errors are caught and logged to the console; no exception is propagated.
 */
async function loadPois() {
    try {
        const response = await fetch('/api/pois');
        if (!response.ok) {
            throw new Error(`Failed to load POIs: ${response.status}`);
        }
        const data = await response.json();
        AppState.pois = Array.isArray(data) ? data : [];

        renderPoiMarkers();

        console.log(`Loaded ${AppState.pois.length} POIs`);

        // Emit event for route planner to know POIs are available
        document.dispatchEvent(new CustomEvent('poisLoaded', {
            detail: { pois: AppState.pois }
        }));
    } catch (error) {
        console.error('Failed to load POIs:', error);
    }
}

/**
 * Render all points of interest (POIs) as markers on the map, replacing any existing POI markers.
 *
 * Creates a marker for each POI that has coordinates, binds a tooltip and click handler, adds the marker
 * directly to the map, and updates AppState.poiMarkers. Uses MarkerUtils.createPoiMarker when available;
 * otherwise falls back to a simple Leaflet marker. Selected POIs are rendered using the selection state.
 */
function renderPoiMarkers() {
    // Remove existing POI markers
    AppState.poiMarkers.forEach(marker => {
        AppState.map.removeLayer(marker);
    });
    AppState.poiMarkers.clear();

    // Create markers for each POI
    AppState.pois.forEach(poi => {
        if (poi.lat && poi.lng) {
            const isSelected = AppState.selectedPois.has(poi.id);

            let marker;
            if (window.MarkerUtils && window.MarkerUtils.createPoiMarker) {
                marker = MarkerUtils.createPoiMarker(poi, isSelected);
            } else {
                // Fallback marker
                marker = L.marker([poi.lat, poi.lng], {
                    title: poi.name
                });
            }

            // Bind tooltip (shows on hover)
            marker.bindTooltip(poi.name, {
                permanent: false,
                direction: 'top',
                offset: [0, -12],
                className: 'poi-tooltip'
            });

            // Add click handler
            marker.on('click', function(e) {
                handlePoiClick(e, poi);
            });

            // Store marker reference
            AppState.poiMarkers.set(poi.id, marker);

            // Add directly to map (not to cluster layer)
            marker.addTo(AppState.map);
        }
    });
}

/**
 * Handle a click on a POI marker, toggling selection when a multi-select modifier is used.
 * @param {Object} e - Leaflet click event; if present, `e.originalEvent.ctrlKey` or `e.originalEvent.metaKey` indicate multi-select intent.
 * @param {Object} poi - The POI object associated with the clicked marker.
 */
function handlePoiClick(e, poi) {
    const isMultiSelect = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);

    if (isMultiSelect) {
        // Toggle POI selection
        togglePoiSelection(poi);
    } else {
        // Single click - just show popup (popup is already bound to marker)
        // The popup will open automatically via Leaflet's default behavior
    }
}

/**
 * Toggle the selection state of the given POI, update its marker icon if present, and emit a unified selection-changed event.
 * @param {Object} poi - POI object containing the POI's `id` and optional `icon` and `color` used to update the marker. 
 */
function togglePoiSelection(poi) {
    if (AppState.selectedPois.has(poi.id)) {
        AppState.selectedPois.delete(poi.id);
    } else {
        AppState.selectedPois.add(poi.id);
    }

    // Update this marker's icon
    const marker = AppState.poiMarkers.get(poi.id);
    if (marker && window.MarkerUtils && window.MarkerUtils.getPoiIcon) {
        const isSelected = AppState.selectedPois.has(poi.id);
        marker.setIcon(MarkerUtils.getPoiIcon(poi.icon, poi.color, isSelected));
    }

    // Dispatch unified selection changed event
    dispatchSelectionChangedEvent();
}

/**
 * Update the cached POI with new fields and synchronize its marker's position, icon, and tooltip if a marker exists.
 * @param {string|number} poiId - The POI's identifier.
 * @param {Object} updatedPoi - Partial POI object containing updated fields. May include `lat`, `lng`, `name`, `icon`, and `color`.
 */
function updatePoiMarker(poiId, updatedPoi) {
    // Update cache
    const idx = AppState.pois.findIndex(p => p.id === poiId);
    if (idx !== -1) {
        AppState.pois[idx] = { ...AppState.pois[idx], ...updatedPoi };
    }

    const marker = AppState.poiMarkers.get(poiId);
    if (marker) {
        // Update position if changed
        if (updatedPoi.lat && updatedPoi.lng) {
            marker.setLatLng([updatedPoi.lat, updatedPoi.lng]);
        }

        // Update icon
        if (window.MarkerUtils && window.MarkerUtils.getPoiIcon) {
            const isSelected = AppState.selectedPois.has(poiId);
            marker.setIcon(MarkerUtils.getPoiIcon(updatedPoi.icon, updatedPoi.color, isSelected));
        }

        // Update tooltip
        marker.setTooltipContent(updatedPoi.name);
    }
}

/**
 * Selects a sensible default starting POI for route planning.
 *
 * Prefers a POI whose name contains "epicenter" (case-insensitive); if none exists, returns the first POI in the list; returns `null` if no POIs are available.
 * @returns {Object|null} The chosen POI object or `null` when no POIs exist.
 */
function getDefaultStartPoi() {
    const epicenter = AppState.pois.find(poi =>
        poi.name && poi.name.toLowerCase().includes('epicenter')
    );
    return epicenter || AppState.pois[0] || null;
}

/**
 * Retrieve the list of POI objects that are currently selected.
 * @returns {Array<Object>} An array of POI objects whose `id` values are present in `AppState.selectedPois`.
 */
function getSelectedPois() {
    return AppState.pois.filter(poi => AppState.selectedPois.has(poi.id));
}

/**
 * Dispatches a unified selection event reflecting currently selected jobs and POIs.
 *
 * The function emits a `jobSelectionChanged` CustomEvent on `document` with a `detail`
 * object containing selection counts and arrays of selected IDs:
 * - `count`: total selected items (jobs + POIs)
 * - `jobCount`: number of selected jobs
 * - `poiCount`: number of selected POIs
 * - `selectedJobs`: array of selected job IDs
 * - `selectedPois`: array of selected POI IDs
 */
function dispatchSelectionChangedEvent() {
    const jobCount = AppState.selectedJobs.size;
    const poiCount = AppState.selectedPois.size;
    const totalCount = jobCount + poiCount;

    document.dispatchEvent(new CustomEvent('jobSelectionChanged', {
        detail: {
            count: totalCount,
            jobCount: jobCount,
            poiCount: poiCount,
            selectedJobs: Array.from(AppState.selectedJobs),
            selectedPois: Array.from(AppState.selectedPois)
        }
    }));
}

// Load jobs when page loads
loadJobs();

// Load POIs when page loads
loadPois();

// Export AppState for debugging
window.AppState = AppState;
window.setMarkerClusteringEnabled = setMarkerClusteringEnabled;
window.isMarkerClusteringSupported = function() {
    return typeof L.markerClusterGroup === 'function';
};

// Filter and Search Functions
// Load saved filters from localStorage or use defaults
const FILTER_STORAGE_KEY = 'epicmap_status_filters';
const TAG_FILTER_STORAGE_KEY = 'epicmap_tag_filters';
const DEFAULT_STATUS_FILTER = ['Needs Fieldwork'];

let initialStatusFilters = DEFAULT_STATUS_FILTER;
let initialTagFilters = [];
try {
    const storedStatuses = localStorage.getItem(FILTER_STORAGE_KEY);
    if (storedStatuses) {
        initialStatusFilters = JSON.parse(storedStatuses);
    }
    const storedTags = localStorage.getItem(TAG_FILTER_STORAGE_KEY);
    if (storedTags) {
        initialTagFilters = JSON.parse(storedTags);
    }
} catch (e) {
    console.warn('Failed to load saved filters from localStorage:', e);
}

window.activeStatusFilters = new Set(initialStatusFilters);
window.activeTagFilters = new Set(initialTagFilters);
let searchTerm = '';

// Update visible/total counts
function updateCounts() {
    const totalCountEl = document.getElementById('totalCount');
    const visibleCountEl = document.getElementById('visibleCount');
    
    if (totalCountEl) {
        totalCountEl.textContent = AppState.allJobs.length;
    }
    if (visibleCountEl) {
        visibleCountEl.textContent = AppState.filteredJobs.length;
    }
}

// Create status filter buttons
function createStatusFilters(jobs, container) {
    container.innerHTML = '';
    
    // Add 'All' filter
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-pill active';
    allBtn.dataset.status = 'all';
    allBtn.innerHTML = '<span>All</span>';
    allBtn.onclick = () => toggleStatusFilter('all');
    container.appendChild(allBtn);
    
    // Get unique statuses
    const statuses = [...new Set(jobs.map(job => job.status).filter(Boolean))];
    
    statuses.forEach(status => {
        const btn = document.createElement('button');
        btn.className = 'filter-pill';
        btn.dataset.status = status;
        
        const color = window.MarkerUtils?.EPIC_COLORS[status] || '#999';
        const name = window.MarkerUtils?.STATUS_NAMES[status] || status;
        
        btn.innerHTML = `
            <span class="status-dot" style="background-color: ${color}"></span>
            <span>${name}</span>
        `;
        btn.onclick = () => toggleStatusFilter(status);
        container.appendChild(btn);
    });
}

// Toggle status filter
function toggleStatusFilter(status) {
    if (status === 'all') {
        window.activeStatusFilters.clear();
        window.activeStatusFilters.add('all');
    } else {
        window.activeStatusFilters.delete('all');
        if (window.activeStatusFilters.has(status)) {
            window.activeStatusFilters.delete(status);
            if (window.activeStatusFilters.size === 0) {
                window.activeStatusFilters.add('all');
            }
        } else {
            window.activeStatusFilters.add(status);
        }
    }
    
    // Update button states (only if they exist)
    const filterPills = document.querySelectorAll('.filter-pill');
    if (filterPills.length > 0) {
        filterPills.forEach(btn => {
            btn.classList.toggle('active', window.activeStatusFilters.has(btn.dataset.status));
        });
    }
    
    applyFilters();
}

// Apply all filters
function applyFilters() {
    AppState.filteredJobs = AppState.allJobs.filter(job => {
        // Status filter
        if (!window.activeStatusFilters.has('all') && !window.activeStatusFilters.has(job.status)) {
            return false;
        }
        
        // Tag filter
        if (window.activeTagFilters.size > 0) {
            if (!Array.isArray(job.tags) || job.tags.length === 0) {
                return false;
            }
            const hasMatchingTag = job.tags.some(tag => window.activeTagFilters.has(tag.id));
            if (!hasMatchingTag) {
                return false;
            }
        }
        
        // Search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            const jobNumber = (job.job_number || '').toLowerCase();
            const client = (job.client || '').toLowerCase();
            const address = (job.address || '').toLowerCase();
            
            if (!jobNumber.includes(search) && 
                !client.includes(search) && 
                !address.includes(search)) {
                return false;
            }
        }
        
        return true;
    });
    
    updateMapMarkers();
    updateCounts();
}

// Job search function with debouncing
let jobSearchTimer = null;
function searchJobs() {
    const searchInput = document.querySelector('.search-box input[placeholder*="Job"]');
    const newSearchTerm = searchInput.value.trim();
    
    // Debounce search to reduce filter operations
    if (jobSearchTimer) clearTimeout(jobSearchTimer);
    jobSearchTimer = setTimeout(() => {
        searchTerm = newSearchTerm;
        applyFilters();
    }, 300); // 300ms debounce
}

// Address search function with debouncing
let addressSearchTimer = null;
async function searchAddress(address) {
    // Accept address as parameter or get from input
    const searchQuery = address || document.querySelector('.search-box input[placeholder*="address"]')?.value?.trim();
    
    if (!searchQuery) return;
    
    // Debounce address search to reduce API calls
    if (addressSearchTimer) clearTimeout(addressSearchTimer);
    addressSearchTimer = setTimeout(async () => {
        await performAddressSearch(searchQuery);
    }, 500); // 500ms debounce for address search (longer due to API call)
}

// Separate function for actual address search
async function performAddressSearch(searchQuery) {
    
    try {
        // Use the same geocoding API that job creation uses (append Florida for better accuracy)
        const response = await fetch(`/api/geocode?address=${encodeURIComponent(searchQuery + ', Florida')}`);
        const result = await response.json();
        
        if (response.ok && result.lat && result.lng) {
            const lat = parseFloat(result.lat);
            const lng = parseFloat(result.lng);
            const displayName = result.formatted_address || searchQuery;
            
            // Remove any existing search markers
            if (window.currentSearchMarker) {
                AppState.map.removeLayer(window.currentSearchMarker);
            }
            
            // Create a custom popup with "Create Job Here" button
            const popupContent = `
                <div style="text-align: center; min-width: 200px;">
                    <strong>Search Result</strong><br>
                    <p style="margin: 10px 0; font-size: 12px;">${displayName}</p>
                    <button 
                        class="btn btn-primary btn-sm" 
                        style="margin-top: 10px;"
                        onclick="createJobAtLocation(${lat}, ${lng}, '${displayName.replace(/'/g, "\\'")}')"
                    >
                        <i class="bi bi-plus-circle"></i> Create Job Here
                    </button>
                </div>
            `;
            
            // Add a search marker
            if (window.MarkerUtils) {
                window.currentSearchMarker = MarkerUtils.createSearchMarker(lat, lng)
                    .bindPopup(popupContent)
                    .addTo(AppState.map)
                    .openPopup();
            } else {
                // Fallback marker
                window.currentSearchMarker = L.marker([lat, lng])
                    .bindPopup(popupContent)
                    .addTo(AppState.map)
                    .openPopup();
            }
            
            // Pan and zoom to location
            AppState.map.setView([lat, lng], 15);
        } else {
            // Use notification for error
            showNotification('Address not found', 'error');
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        // Use notification for error
        showNotification('Error searching for address', 'error');
    }
}

// Wire up Alpine data for search inputs
document.addEventListener('alpine:init', () => {
    Alpine.data('searchControls', () => ({
        jobSearch: '',
        addressSearch: '',
        searchJobs() {
            // Use the debounced searchJobs function
            const searchInput = document.querySelector('.search-box input[placeholder*="Job"]');
            if (searchInput) {
                searchInput.value = this.jobSearch;
                window.searchJobs();
            }
        },
        searchAddress() {
            // Use the debounced searchAddress function
            window.searchAddress(this.addressSearch);
        }
    }));
});

// New function for status filtering from FAB menu
function applyStatusFilter(statuses) {
    if (statuses.includes('all')) {
        window.activeStatusFilters.clear();
        window.activeStatusFilters.add('all');
    } else {
        window.activeStatusFilters.clear();
        statuses.forEach(status => window.activeStatusFilters.add(status));
    }
    
    // Update filter pill button states to sync with FAB menu (only if they exist)
    const filterPills = document.querySelectorAll('.filter-pill');
    if (filterPills.length > 0) {
        filterPills.forEach(btn => {
            btn.classList.toggle('active', window.activeStatusFilters.has(btn.dataset.status));
        });
    }
    
    applyFilters();
}

// Export functions for global access
window.searchJobs = searchJobs;
window.searchAddress = searchAddress;
window.toggleStatusFilter = toggleStatusFilter;
window.applyStatusFilter = applyStatusFilter;
window.loadJobs = loadJobs; // Export loadJobs for create job modal
window.centerOnUserLocation = centerOnUserLocation; // Export for FAB menu
window.switchBaseLayer = switchBaseLayer; // Export for layer controls
window.toggleCounties = toggleCounties; // Export for layer controls
window.updateJobMarker = updateJobMarker; // Export for job modal updates

// POI exports
window.loadPois = loadPois;
window.getDefaultStartPoi = getDefaultStartPoi;
window.getSelectedPois = getSelectedPois;
window.updatePoiMarker = updatePoiMarker;
window.togglePoiSelection = togglePoiSelection;

// Create job at location function
window.createJobAtLocation = function(lat, lng, address) {
    console.log('Creating job at:', lat, lng, address);
    
    // Show create job modal
    if (window.CreateJobModal) {
        window.CreateJobModal.show(lat, lng, address);
    } else {
        // Use notification for error
        showNotification('Create job functionality not available', 'error');
    }
};