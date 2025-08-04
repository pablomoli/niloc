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
    markerCluster: null,
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
AppState.map = L.map('map').setView([28.5383, -81.3792], 10); // Orlando, FL

// Create base layers
AppState.baseLayers = {
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    }),
    streets: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
    })
};

// Add default satellite layer
AppState.baseLayers.satellite.addTo(AppState.map);

// Initialize user location tracking
function initUserLocation() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'error');
        return;
    }
    
    // Request initial position
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
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
        showNotification('Location not available', 'error');
        initUserLocation(); // Try to get location again
    }
}

// Load Florida Counties GeoJSON layer
async function loadFloridaCounties() {
    try {
        const response = await fetch('/static/data/florida_counties.geojson');
        const countiesData = await response.json();
        
        AppState.overlayLayers.counties = L.geoJSON(countiesData, {
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
                    
                    // Store label reference on the layer
                    layer.countyLabel = label;
                }
            }
        });
        
        console.log('Florida counties loaded');
    } catch (error) {
        console.error('Failed to load Florida counties:', error);
        showNotification('Failed to load county boundaries', 'error');
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
function toggleCounties() {
    if (!AppState.overlayLayers.counties) {
        showNotification('Counties not loaded yet', 'error');
        return;
    }
    
    if (AppState.countiesVisible) {
        // Hide counties and labels
        AppState.map.removeLayer(AppState.overlayLayers.counties);
        AppState.overlayLayers.counties.eachLayer(function(layer) {
            if (layer.countyLabel) {
                AppState.map.removeLayer(layer.countyLabel);
            }
        });
        AppState.countiesVisible = false;
        showNotification('County boundaries hidden', 'info');
    } else {
        // Show counties and labels
        AppState.overlayLayers.counties.addTo(AppState.map);
        AppState.overlayLayers.counties.eachLayer(function(layer) {
            if (layer.countyLabel) {
                layer.countyLabel.addTo(AppState.map);
            }
        });
        AppState.countiesVisible = true;
        showNotification('County boundaries shown', 'info');
    }
}

// Initialize layers
loadFloridaCounties();

// Initialize user location after map loads
setTimeout(initUserLocation, 1000);

// Remove legend - we're using the control panel instead
// if (window.MarkerUtils) {
//     MarkerUtils.createStatusLegend().addTo(AppState.map);
// }

// Initialize marker cluster group
AppState.markerCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
});
AppState.map.addLayer(AppState.markerCluster);

// Load and display jobs
async function loadJobs() {
    try {
        const response = await fetch('/api/jobs');
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

// Update markers on the map
function updateMapMarkers() {
    // Clear existing markers
    AppState.markerCluster.clearLayers();
    AppState.markers.clear();
    
    AppState.filteredJobs.forEach(job => {
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
            
            // Add to cluster
            AppState.markerCluster.addLayer(marker);
        }
    });
}

// Handle marker click for selection
function handleMarkerClick(e, job) {
    // Check if it's a multi-select click
    const isMultiSelect = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
    
    if (isMultiSelect) {
        // Multi-select mode
        toggleJobSelection(job);
    } else {
        // Single select mode - open modal
        AppState.selectedJobs.clear();
        AppState.selectedJobs.add(job.job_number);
        updateMapMarkers();
        
        // Use simple modal instead of Alpine
        if (window.SimpleModal) {
            window.SimpleModal.show(job);
        } else {
            // Fallback
            console.error('SimpleModal not available');
            // Use SimpleModal instead of alert for better UX
            if (window.SimpleModal) {
                window.SimpleModal.show(job);
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

// Check if Leaflet.markercluster is available, if not, use regular markers
if (typeof L.markerClusterGroup === 'undefined') {
    console.warn('Leaflet.markercluster not loaded. Using regular markers instead.');
    
    // Override cluster methods to use regular layer group
    AppState.markerCluster = {
        clearLayers: function() {
            AppState.markers.forEach(marker => AppState.map.removeLayer(marker));
        },
        addLayer: function(marker) {
            marker.addTo(AppState.map);
        }
    };
}

// Load jobs when page loads
loadJobs();

// Export AppState for debugging
window.AppState = AppState;

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

// Job search function
function searchJobs() {
    const searchInput = document.querySelector('.search-box input[placeholder*="Job"]');
    searchTerm = searchInput.value.trim();
    applyFilters();
}

// Address search function
async function searchAddress(address) {
    // Accept address as parameter or get from input
    const searchQuery = address || document.querySelector('.search-box input[placeholder*="address"]')?.value?.trim();
    
    if (!searchQuery) return;
    
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
            searchTerm = this.jobSearch;
            applyFilters();
        },
        searchAddress() {
            window.searchAddress();
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