// DaisyUI Alert Notification System
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
    baseLayers: {},
    overlayLayers: {},
    currentBaseLayer: 'satellite',
    countiesVisible: false
};

// Initialize map
AppState.map = L.map('map', { preferCanvas: true }).setView([28.5383, -81.3792], 10); // Orlando, FL

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

// Add default satellite layer
AppState.baseLayers.satellite.addTo(AppState.map);

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

// Initialize user location tracking with localStorage support
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
            
            // Center map on user location
            AppState.map.setView([latitude, longitude], 15);
            
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

// Toggle base layer (satellite/streets)
function switchBaseLayer(layerName) {
    if (AppState.baseLayers[layerName] && layerName !== AppState.currentBaseLayer) {
        // Remove current base layer
        AppState.map.removeLayer(AppState.baseLayers[AppState.currentBaseLayer]);
        
        // Add new base layer
        AppState.baseLayers[layerName].addTo(AppState.map);
        
        // Update state
        AppState.currentBaseLayer = layerName;
        
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

// Toggle job selection
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
}

// Update selected jobs info (if you have a UI element for this)
function updateSelectedJobsInfo() {
    console.log(`Selected jobs: ${AppState.selectedJobs.size}`);
    // Update UI elements that show selected jobs count (only if element exists)
    const selectedCountElement = document.getElementById('selectedCount');
    if (selectedCountElement) {
        selectedCountElement.textContent = `Selected: ${AppState.selectedJobs.size} jobs`;
    }
}

// Clear all selections
function clearSelection() {
    AppState.selectedJobs.clear();
    updateMapMarkers();
    updateSelectedJobsInfo();
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Escape key to clear selection
    if (e.key === 'Escape') {
        if (AppState.selectedJobs.size > 0) {
            clearSelection();
        }
    }
});

// Load jobs when page loads
loadJobs();

// Export AppState for debugging
window.AppState = AppState;
window.setMarkerClusteringEnabled = setMarkerClusteringEnabled;
window.isMarkerClusteringSupported = function() {
    return typeof L.markerClusterGroup === 'function';
};

// Filter and Search Functions
window.activeStatusFilters = new Set(['all']);
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
