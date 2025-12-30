/**
 * Route Planner Module for Epic Map
 * Allows field crews to plan routes between multiple job locations
 */

window.RoutePlanner = {
    // Default fallback location (used if no POIs are available)
    defaultLocation: {
        lat: 28.5039192,
        lng: -81.0773325,
        name: "Office",
        address: "20306 Nettleton St, Orlando, FL"
    },

    // State
    startLocation: null, // Current starting point (POI object or default)
    availableStarts: [], // Cached POIs (used to resolve default start)
    stops: [],           // Ordered array of job objects
    routeLayer: null,    // Leaflet layer group for route visualization
    isOpen: false,       // Panel visibility state
    isCollapsed: false,  // Panel collapsed state
    isRoundTrip: false,  // Include return to start
    useOfficeStart: true, // Whether to start from Office POI (true) or first job (false)
    useGpsStart: false,  // Whether to start from current GPS location
    gpsStartPending: false, // GPS location request in flight
    previousOfficeStart: null, // Store office toggle state when GPS is enabled
    gpsRequestId: 0, // Incremental id to ignore stale GPS responses
    routeData: null,     // Cached route data from API (distance, duration, geometry)
    isLoadingRoute: false, // Loading state for API calls
    selectionListener: null, // Event listener reference for cleanup
    poisListener: null,  // POI loaded event listener
    routeRedrawTimer: null, // Debounced route redraw timer
    initialized: false,  // Guard against double init

    /**
     * Escape HTML special characters to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        if (typeof str !== 'string') return str;
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Build a normalized stop from a job object
     * @param {Object} job - Job object
     * @returns {Object|null}
     */
    buildStopFromJob(job) {
        if (!job) return null;
        const lat = parseFloat(job.latitude || job.lat);
        const lng = parseFloat(job.longitude || job.long);
        return {
            type: 'job',
            id: job.job_number,
            name: job.client ? `${job.job_number} - ${job.client}` : `${job.job_number}`,
            address: job.address || 'No address',
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null
        };
    },

    /**
     * Build a normalized stop from a POI object
     * @param {Object} poi - POI object
     * @returns {Object|null}
     */
    buildStopFromPoi(poi) {
        if (!poi) return null;
        const lat = parseFloat(poi.lat);
        const lng = parseFloat(poi.lng);
        return {
            type: 'poi',
            id: poi.id,
            name: poi.name || 'POI',
            address: poi.address || poi.description || '',
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null
        };
    },

    /**
     * Build normalized stops from current selection (jobs + POIs)
     * @returns {Array}
     */
    buildStopsFromSelection() {
        if (!window.AppState) return [];
        const stops = [];

        if (window.AppState.selectedJobs && window.AppState.allJobs) {
            window.AppState.selectedJobs.forEach((jobNum) => {
                const job = window.AppState.allJobs.find(j => j.job_number === jobNum);
                const stop = this.buildStopFromJob(job);
                if (stop) stops.push(stop);
            });
        }

        if (window.AppState.selectedPois && window.AppState.pois) {
            window.AppState.selectedPois.forEach((poiId) => {
                const poi = window.AppState.pois.find(p => p.id === poiId);
                const stop = this.buildStopFromPoi(poi);
                if (stop) stops.push(stop);
            });
        }

        return stops;
    },

    /**
     * Unique key for a stop
     * @param {Object} stop - Stop object
     * @returns {string}
     */
    getStopKey(stop) {
        return `${stop.type}:${stop.id}`;
    },

    /**
     * Dispatch selection changed event (fallback if global helper missing)
     */
    dispatchSelectionChanged() {
        if (window.dispatchSelectionChangedEvent) {
            window.dispatchSelectionChangedEvent();
            return;
        }

        const jobCount = window.AppState?.selectedJobs?.size || 0;
        const poiCount = window.AppState?.selectedPois?.size || 0;
        document.dispatchEvent(new CustomEvent('jobSelectionChanged', {
            detail: {
                count: jobCount + poiCount,
                jobCount: jobCount,
                poiCount: poiCount,
                selectedJobs: Array.from(window.AppState?.selectedJobs || []),
                selectedPois: Array.from(window.AppState?.selectedPois || [])
            }
        }));
    },

    /**
     * Initialize the route planner
     */
    init() {
        if (this.initialized) return;
        this.initialized = true;

        // Create a dedicated layer for route visualization
        if (window.AppState && window.AppState.map) {
            this.routeLayer = L.layerGroup().addTo(window.AppState.map);
        }
        if (window.AppState && typeof window.AppState.currentLocation === 'undefined') {
            window.AppState.currentLocation = null;
        }

        // Load available starting points from POIs
        this.loadAvailableStarts();

        // Listen for POIs loaded event to update available starts
        this.poisListener = () => this.loadAvailableStarts();
        document.addEventListener('poisLoaded', this.poisListener);
    },

    /**
     * Load available starting points from POIs
     */
    loadAvailableStarts() {
        if (window.AppState && window.AppState.pois) {
            this.availableStarts = [...window.AppState.pois];
        } else {
            this.availableStarts = [];
        }

        // Resolve default start location (prefer "epicenter", else fallback)
        const epicenterPoi = this.availableStarts.find(poi =>
            poi.name && poi.name.toLowerCase().includes('epicenter')
        );

        this.startLocation = epicenterPoi || { ...this.defaultLocation };
    },

    /**
     * Show the route planning modal with selected jobs
     * @param {Array} jobs - Array of job objects to include in route
     */
    show(jobs) {
        let selectionStops = this.buildStopsFromSelection();
        if ((!selectionStops || selectionStops.length === 0) && Array.isArray(jobs)) {
            selectionStops = jobs
                .map(job => this.buildStopFromJob(job))
                .filter(Boolean);
        }
        if (!selectionStops || selectionStops.length === 0) {
            if (window.showNotification) {
                window.showNotification('Select at least 1 stop to plan a route', 'warning');
            }
            return;
        }

        this.stops = [...selectionStops];
        this.isOpen = true;
        this.isCollapsed = false;
        this.renderModal();
        this.drawRoute();
        this.startListeningForSelectionChanges();
    },

    /**
     * Start listening for job selection changes to reactively update stops
     */
    startListeningForSelectionChanges() {
        // Remove existing listener if any
        this.stopListeningForSelectionChanges();

        // Create new listener
        this.selectionListener = (e) => {
            if (!this.isOpen) return;
            this.syncWithSelectedJobs();
        };

        document.addEventListener('jobSelectionChanged', this.selectionListener);
    },

    /**
     * Stop listening for job selection changes
     */
    stopListeningForSelectionChanges() {
        if (this.selectionListener) {
            document.removeEventListener('jobSelectionChanged', this.selectionListener);
            this.selectionListener = null;
        }
    },

    /**
     * Sync route stops with currently selected jobs
     */
    syncWithSelectedJobs() {
        if (!window.AppState) return;

        const selectedStops = this.buildStopsFromSelection();
        const selectedKeys = new Set(selectedStops.map(stop => this.getStopKey(stop)));

        let changed = false;

        // Remove stops that are no longer selected
        const filteredStops = this.stops.filter(stop => selectedKeys.has(this.getStopKey(stop)));
        if (filteredStops.length !== this.stops.length) {
            this.stops = filteredStops;
            changed = true;
        }

        // Add newly selected stops (preserve existing order, append new ones)
        const currentKeys = new Set(this.stops.map(stop => this.getStopKey(stop)));
        for (const stop of selectedStops) {
            if (!currentKeys.has(this.getStopKey(stop))) {
                this.stops.push(stop);
                currentKeys.add(this.getStopKey(stop));
                changed = true;
            }
        }

        if (changed) {
            this.renderStopsList();
            this.updateStopsHeader();
            this.scheduleDrawRoute();
        }
    },

    /**
     * Update the stops count in the header and collapse tab
     */
    updateStopsHeader() {
        const header = document.querySelector('#routePlannerPanel .stops-header-count');
        if (header) {
            header.textContent = `Stops (${this.stops.length})`;
        }
        // Also update the collapse tab count (tab is outside panel)
        const tabCount = document.querySelector('#routePlannerCollapseTab .collapse-tab-count');
        if (tabCount) {
            tabCount.textContent = this.stops.length;
        }
    },

    /**
     * Hide the route planning panel
     */
    hide() {
        this.stopListeningForSelectionChanges();
        const panel = document.getElementById('routePlannerPanel');
        const tab = document.getElementById('routePlannerCollapseTab');
        if (panel) {
            panel.classList.remove('open');
            // Remove after animation completes
            setTimeout(() => {
                panel.remove();
                if (tab) tab.remove();
            }, 300);
        }
        this.isOpen = false;
        this.isCollapsed = false;
        this.isRoundTrip = false;
        this.useOfficeStart = true;
        this.useGpsStart = false;
        this.gpsStartPending = false;
        this.previousOfficeStart = null;
        if (this.routeRedrawTimer) {
            clearTimeout(this.routeRedrawTimer);
            this.routeRedrawTimer = null;
        }
    },

    /**
     * Toggle panel collapsed state
     */
    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        const panel = document.getElementById('routePlannerPanel');
        const tab = document.getElementById('routePlannerCollapseTab');
        if (panel) {
            panel.classList.toggle('collapsed', this.isCollapsed);
        }
        if (tab) {
            tab.classList.toggle('visible', this.isCollapsed);
        }
        // Update collapse button icon
        const collapseBtn = document.getElementById('routePanelCollapseBtn');
        if (collapseBtn) {
            const icon = collapseBtn.querySelector('i');
            if (icon) {
                icon.className = this.isCollapsed ? 'bi bi-chevron-left' : 'bi bi-chevron-right';
            }
        }
    },

    /**
     * Toggle round trip mode (return to office)
     */
    toggleRoundTrip() {
        this.isRoundTrip = !this.isRoundTrip;
        // Update toggle UI
        const toggle = document.getElementById('roundTripToggle');
        if (toggle) {
            toggle.checked = this.isRoundTrip;
        }
        // Redraw route with or without return leg
        this.drawRoute();
    },

    /**
     * Toggle whether to start from Office or first job
     */
    toggleOfficeStart() {
        if (this.useGpsStart || this.gpsStartPending) {
            return;
        }
        this.useOfficeStart = !this.useOfficeStart;
        // Update toggle UI
        const toggle = document.getElementById('officeStartToggle');
        if (toggle) {
            toggle.checked = this.useOfficeStart;
        }
        this.updateStartOptionsUI();
        this.scheduleDrawRoute();
    },

    /**
     * Toggle whether to start from current GPS location
     */
    toggleGpsStart() {
        const nextState = !this.useGpsStart;
        const toggle = document.getElementById('gpsStartToggle');

        if (!nextState) {
            this.setGpsError('');
            this.disableGpsStart();
            if (toggle) toggle.checked = false;
            this.scheduleDrawRoute();
            return;
        }

        if (toggle) toggle.checked = true;
        this.enableGpsStart();
    },

    /**
     * Request current GPS location and enable GPS start when available
     */
    enableGpsStart() {
        if (!navigator.geolocation) {
            this.setGpsError('Location services not available');
            if (window.showNotification) {
                window.showNotification('Location services not available', 'error');
            }
            this.disableGpsStart();
            return;
        }

        this.previousOfficeStart = this.useOfficeStart;
        this.useGpsStart = true;
        this.useOfficeStart = false;
        this.gpsStartPending = true;
        this.gpsRequestId += 1;
        const requestId = this.gpsRequestId;
        this.setGpsError('');
        this.updateStartOptionsUI();

        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (requestId !== this.gpsRequestId) return;
                const { latitude, longitude, accuracy } = position.coords;
                if (window.AppState) {
                    window.AppState.currentLocation = {
                        lat: latitude,
                        lng: longitude,
                        accuracy,
                        timestamp: Date.now()
                    };
                }

                this.gpsStartPending = false;
                this.updateStartOptionsUI();
                this.scheduleDrawRoute();
            },
            (error) => {
                if (requestId !== this.gpsRequestId) return;
                let message = 'Location access denied';
                if (error) {
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            message = 'Location access denied';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            message = 'Location unavailable';
                            break;
                        case error.TIMEOUT:
                            message = 'Location request timed out';
                            break;
                        default:
                            message = 'Unable to get location';
                            break;
                    }
                }

                this.setGpsError(message);
                if (window.showNotification) {
                    window.showNotification(message, 'error');
                }

                this.disableGpsStart();
                this.scheduleDrawRoute();
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    },

    /**
     * Disable GPS start and restore office toggle state
     */
    disableGpsStart() {
        this.useGpsStart = false;
        this.gpsStartPending = false;
        this.gpsRequestId += 1;
        if (this.previousOfficeStart !== null) {
            this.useOfficeStart = this.previousOfficeStart;
        }
        this.previousOfficeStart = null;
        this.updateStartOptionsUI();
    },

    /**
     * Update start option UI states
     */
    updateStartOptionsUI() {
        const gpsToggle = document.getElementById('gpsStartToggle');
        if (gpsToggle) {
            gpsToggle.checked = this.useGpsStart || this.gpsStartPending;
        }

        const officeToggle = document.getElementById('officeStartToggle');
        if (officeToggle) {
            officeToggle.disabled = this.useGpsStart || this.gpsStartPending;
            officeToggle.checked = this.useOfficeStart && !this.useGpsStart && !this.gpsStartPending;
        }

        const startSection = document.getElementById('startLocationSection');
        if (startSection) {
            startSection.style.display = (this.useOfficeStart && !this.useGpsStart && !this.gpsStartPending)
                ? 'block'
                : 'none';
        }
    },

    /**
     * Update GPS error text in the sidebar
     * @param {string} message - Error message to display
     */
    setGpsError(message) {
        const errorEl = document.getElementById('gpsStartError');
        if (!errorEl) return;
        if (message) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        } else {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    },

    /**
     * Debounced route redraw helper
     */
    scheduleDrawRoute() {
        if (this.routeRedrawTimer) {
            clearTimeout(this.routeRedrawTimer);
        }
        this.routeRedrawTimer = setTimeout(() => {
            this.drawRoute();
        }, 650);
    },

    /**
     * Get active GPS start location if available
     * @returns {Object|null}
     */
    getGpsStartLocation() {
        if (!this.useGpsStart) return null;
        const location = window.AppState?.currentLocation;
        if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
            return null;
        }
        return location;
    },

    /**
     * Determine the active start location info
     * @returns {Object}
     */
    getStartInfo() {
        const gpsLocation = this.getGpsStartLocation();
        if (gpsLocation) {
            return {
                type: 'gps',
                location: gpsLocation,
                name: 'Current Location'
            };
        }

        if (this.useOfficeStart) {
            return {
                type: 'office',
                location: this.startLocation || this.defaultLocation
            };
        }

        return { type: 'first-stop', location: null };
    },

    /**
     * Add a stop to the route
     * @param {Object} job - Job object to add
     */
    addStop(job) {
        const stop = job?.type ? job : this.buildStopFromJob(job);
        if (!stop) return;
        if (!this.stops.find(s => this.getStopKey(s) === this.getStopKey(stop))) {
            this.stops.push(stop);
            this.renderStopsList();
            this.drawRoute();
        }
    },

    /**
     * Remove a stop from the route
     * @param {number} index - Index of stop to remove
     */
    removeStop(index) {
        if (index >= 0 && index < this.stops.length) {
            const stop = this.stops[index];

            if (stop.type === 'job' && window.AppState?.selectedJobs) {
                window.AppState.selectedJobs.delete(stop.id);
                const job = window.AppState.allJobs?.find(j => j.job_number === stop.id);
                const marker = window.AppState.markers?.get(stop.id);
                if (marker && window.MarkerUtils && job) {
                    marker.setIcon(MarkerUtils.getStatusIcon(job.status, false));
                }
            }

            if (stop.type === 'poi' && window.AppState?.selectedPois) {
                window.AppState.selectedPois.delete(stop.id);
                const poi = window.AppState.pois?.find(p => p.id === stop.id);
                const marker = window.AppState.poiMarkers?.get(stop.id);
                if (marker && window.MarkerUtils && poi) {
                    marker.setIcon(MarkerUtils.getPoiIcon(poi.icon, poi.color, false));
                }
            }

            this.stops.splice(index, 1);
            this.renderStopsList();
            this.scheduleDrawRoute();
            this.updateSummary();
            this.dispatchSelectionChanged();
        }
    },

    /**
     * Reorder stops in the route
     * @param {number} fromIndex - Original index
     * @param {number} toIndex - New index
     */
    reorderStops(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;

        const [removed] = this.stops.splice(fromIndex, 1);
        this.stops.splice(toIndex, 0, removed);

        this.renderStopsList();
        this.drawRoute();
        this.updateSummary();
    },

    /**
     * Clear all stops from the route
     */
    clearRoute() {
        this.stops = [];
        this.clearVisualization();
        this.renderStopsList();
        this.updateSummary();
    },

    /**
     * Optimize route using nearest neighbor algorithm
     */
    optimizeRoute() {
        if (this.stops.length < 2) {
            if (window.showNotification) {
                window.showNotification('Need at least 2 stops to optimize', 'warning');
            }
            return;
        }
        if (this.gpsStartPending && !this.getGpsStartLocation()) {
            if (window.showNotification) {
                window.showNotification('Waiting for current location...', 'info');
            }
            return;
        }

        const validStops = this.stops.filter(stop =>
            Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
        );
        const invalidStops = this.stops.filter(stop =>
            !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)
        );

        if (validStops.length < 2) {
            if (window.showNotification) {
                window.showNotification('Need at least 2 stops with valid coordinates', 'warning');
            }
            return;
        }

        const unvisited = [...validStops];
        const optimized = [];

        // Start from GPS, Office, or first job based on setting
        let current;
        const startInfo = this.getStartInfo();
        if (startInfo.type === 'gps' || startInfo.type === 'office') {
            current = startInfo.location;
        } else {
            // Start from first job when not using office start
            const firstStop = unvisited.shift();
            if (!firstStop) {
                if (window.showNotification) {
                    window.showNotification('No valid stops available to optimize', 'warning');
                }
                return;
            }
            optimized.push(firstStop);
            const lat = firstStop.lat;
            const lng = firstStop.lng;
            current = { lat, lng };
        }

        while (unvisited.length > 0) {
            let nearestIndex = 0;
            let nearestDist = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                const stop = unvisited[i];
                const lat = stop.lat;
                const lng = stop.lng;

                if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

                const dist = this.calculateDistance(
                    current.lat, current.lng,
                    lat, lng
                );

                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIndex = i;
                }
            }

            const nearest = unvisited.splice(nearestIndex, 1)[0];
            optimized.push(nearest);

            const lat = nearest.lat;
            const lng = nearest.lng;
            current = { lat, lng };
        }

        this.stops = [...optimized, ...invalidStops];
        this.renderStopsList();
        this.drawRoute();
        this.updateSummary();

        if (window.showNotification) {
            window.showNotification('Route optimized', 'success');
        }
    },

    /**
     * Calculate distance between two points using Haversine formula
     * @returns {number} Distance in miles
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 3959; // Earth radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    /**
     * Calculate total route distance
     * @returns {number} Total distance in miles
     */
    getTotalDistance() {
        if (this.stops.length === 0) return 0;

        const startInfo = this.getStartInfo();
        let total = 0;
        let prevLat, prevLng;

        // Start from GPS, Office, or first job based on setting
        if (startInfo.type === 'gps' || startInfo.type === 'office') {
            prevLat = startInfo.location.lat;
            prevLng = startInfo.location.lng;
        } else {
            const firstStop = this.stops[0];
            prevLat = firstStop.lat;
            prevLng = firstStop.lng;
            if (!Number.isFinite(prevLat) || !Number.isFinite(prevLng)) return 0;
        }

        // Calculate distances between stops
        const stopsToProcess = startInfo.type === 'first-stop' ? this.stops.slice(1) : this.stops;
        for (const stop of stopsToProcess) {
            const lat = stop.lat;
            const lng = stop.lng;

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                total += this.calculateDistance(prevLat, prevLng, lat, lng);
                prevLat = lat;
                prevLng = lng;
            }
        }

        return total;
    },

    /**
     * Fetch driving route from OpenRouteService via backend proxy
     * @param {Array} coordinates - Array of [lng, lat] coordinate pairs
     * @returns {Object|null} Route data with geometry and summary
     */
    async fetchDrivingRoute(coordinates) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch('/api/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.warn('Route API error:', errorData.error || response.statusText);
                return null;
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Route API request timed out');
            } else {
                console.warn('Failed to fetch driving route:', error);
            }
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    /**
     * Draw the route on the map (async - fetches driving directions)
     */
    async drawRoute() {
        if (this.gpsStartPending && !this.getGpsStartLocation()) {
            return;
        }

        this.clearVisualization();

        if (!this.routeLayer || this.stops.length === 0) return;

        const startInfo = this.getStartInfo();
        const startLocation = startInfo.location;

        // Build coordinates array in [lng, lat] format for OpenRouteService
        const coordinates = [];

        // Only add start location if GPS or Office start is enabled
        if (startInfo.type !== 'first-stop' && startLocation) {
            coordinates.push([startLocation.lng, startLocation.lat]);
        }

        for (const stop of this.stops) {
            const lat = stop.lat;
            const lng = stop.lng;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                coordinates.push([lng, lat]);
            }
        }

        // Need at least 2 coordinates for a route
        if (coordinates.length < 2) {
            this.routeData = null;
            this.updateSummary();
            return;
        }

        // Add return to start if round trip is enabled and we have a start location
        if (this.isRoundTrip && startInfo.type !== 'first-stop' && coordinates.length > 1) {
            coordinates.push([startLocation.lng, startLocation.lat]);
        }

        // Show loading state
        this.isLoadingRoute = true;
        this.updateSummary();

        // Try to fetch driving route from API
        const routeResponse = await this.fetchDrivingRoute(coordinates);

        this.isLoadingRoute = false;

        if (routeResponse && routeResponse.features && routeResponse.features.length > 0) {
            // Use actual road geometry from API
            const feature = routeResponse.features[0];
            const geometry = feature.geometry;
            const summary = feature.properties?.summary || {};
            const segments = feature.properties?.segments || [];

            // Store route data for display
            this.routeData = {
                distance: summary.distance || 0, // meters
                duration: summary.duration || 0, // seconds
                usingDrivingRoute: true
            };

            // Convert GeoJSON coordinates [lng, lat] to Leaflet [lat, lng]
            const routeCoords = geometry.coordinates.map(coord => [coord[1], coord[0]]);

            // Draw the actual road-following polyline
            const polyline = L.polyline(routeCoords, {
                color: '#d8197f',
                weight: 5,
                opacity: 0.85
            });
            this.routeLayer.addLayer(polyline);

            // Add segment duration labels at midpoints
            this.addSegmentLabels(segments, coordinates);
            this.centerMapOnRoute(routeCoords);
        } else {
            // Fallback to straight lines
            this.routeData = {
                distance: this.getTotalDistance() * 1609.34, // Convert miles to meters
                duration: null,
                usingDrivingRoute: false
            };

            const straightCoords = coordinates.map(coord => [coord[1], coord[0]]); // [lat, lng]
            const polyline = L.polyline(straightCoords, {
                color: '#d8197f',
                weight: 4,
                opacity: 0.8,
                dashArray: '10, 10'
            });
            this.routeLayer.addLayer(polyline);
            this.centerMapOnRoute(straightCoords);
        }

        // Add start location marker when a start location is enabled
        if (startInfo.type === 'office' && startLocation) {
            const startIcon = startLocation.icon || 'bi-building';
            const startColor = startLocation.color || '#22c55e';
            const startMarker = L.marker([startLocation.lat, startLocation.lng], {
                icon: L.divIcon({
                    className: 'route-start-marker',
                    html: `<div class="route-stop-number start" style="background-color: ${startColor};"><i class="bi ${startIcon}"></i></div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                }),
                zIndexOffset: 1000
            });
            startMarker.bindPopup(`<strong>Start:</strong> ${startLocation.name}${startLocation.address ? '<br>' + startLocation.address : ''}`);
            this.routeLayer.addLayer(startMarker);
        } else if (startInfo.type === 'gps' && startLocation) {
            const gpsMarker = L.marker([startLocation.lat, startLocation.lng], {
                icon: L.divIcon({
                    className: 'route-gps-marker',
                    html: '<div class="route-gps-dot"><i class="bi bi-geo-alt-fill"></i></div>',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                }),
                zIndexOffset: 1000
            });
            gpsMarker.bindPopup('<strong>Start:</strong> Current Location');
            this.routeLayer.addLayer(gpsMarker);
        }

        // Add numbered markers for each stop
        this.stops.forEach((stop, index) => {
            const lat = stop.lat;
            const lng = stop.lng;

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'route-stop-marker',
                        html: `<div class="route-stop-number">${index + 1}</div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                    }),
                    zIndexOffset: 1000 + index
                });
                marker.bindPopup(`<strong>Stop ${index + 1}:</strong> ${stop.name}<br>${stop.address || 'No address'}`);
                this.routeLayer.addLayer(marker);
            }
        });

        // Update summary with actual route data
        this.updateSummary();
    },

    /**
     * Center map on the route bounds
     * @param {Array} routeCoords - Array of [lat, lng] coordinates
     */
    centerMapOnRoute(routeCoords) {
        if (!window.AppState?.map || !Array.isArray(routeCoords) || routeCoords.length === 0) return;
        const validCoords = routeCoords.filter(coord =>
            Array.isArray(coord) &&
            coord.length >= 2 &&
            Number.isFinite(coord[0]) &&
            Number.isFinite(coord[1])
        );
        if (validCoords.length === 0) return;
        if (validCoords.length === 1) {
            window.AppState.map.setView(validCoords[0], Math.max(window.AppState.map.getZoom(), 15));
            return;
        }
        const bounds = L.latLngBounds(validCoords);
        window.AppState.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    },

    /**
     * Clear route visualization from map
     */
    clearVisualization() {
        if (this.routeLayer) {
            this.routeLayer.clearLayers();
        }
    },

    /**
     * Export route to Google Maps
     */
    exportToGoogleMaps() {
        if (this.stops.length === 0) {
            if (window.showNotification) {
                window.showNotification('No stops in route', 'error');
            }
            return;
        }
        if (this.gpsStartPending && !this.getGpsStartLocation()) {
            if (window.showNotification) {
                window.showNotification('Waiting for current location...', 'info');
            }
            return;
        }

        // Google Maps limits to 10 waypoints
        if (this.stops.length > 10) {
            if (window.showNotification) {
                window.showNotification('Google Maps limited to 10 waypoints. Route truncated.', 'warning');
            }
        }

        const startInfo = this.getStartInfo();
        let origin;
        let stopsForRoute = [...this.stops];

        if (startInfo.type === 'gps' && startInfo.location) {
            origin = `${startInfo.location.lat},${startInfo.location.lng}`;
        } else if (startInfo.type === 'office' && startInfo.location) {
            origin = `${startInfo.location.lat},${startInfo.location.lng}`;
        } else {
            // First stop becomes the origin
            const firstStop = stopsForRoute.shift();
            if (!firstStop || !Number.isFinite(firstStop.lat) || !Number.isFinite(firstStop.lng)) {
                if (window.showNotification) {
                    window.showNotification('Origin is missing coordinates', 'error');
                }
                return;
            }
            origin = `${firstStop.lat},${firstStop.lng}`;
        }

        // Last stop is the destination
        const lastStop = stopsForRoute[stopsForRoute.length - 1];
        if (!lastStop || !Number.isFinite(lastStop.lat) || !Number.isFinite(lastStop.lng)) {
            if (window.showNotification) {
                window.showNotification('Destination is missing coordinates', 'error');
            }
            return;
        }
        const destination = `${lastStop.lat},${lastStop.lng}`;

        // Intermediate stops are waypoints (max 9 due to Google limits)
        const intermediateStops = stopsForRoute.slice(0, -1).slice(0, 9);
        const waypoints = intermediateStops
            .map(s => {
                const lat = s.lat;
                const lng = s.lng;
                return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : null;
            })
            .filter(Boolean)
            .join('|');

        let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
        if (waypoints) {
            url += `&waypoints=${encodeURIComponent(waypoints)}`;
        }
        url += '&travelmode=driving';

        window.open(url, '_blank');
    },

    /**
     * Render the route planning side panel
     */
    renderModal() {
        // Remove existing panel if present
        const existing = document.getElementById('routePlannerPanel');
        if (existing) {
            existing.remove();
        }

        // Reset route data when opening panel
        this.routeData = null;

        const panelHTML = `
            <!-- Collapse Tab (separate from panel for proper fixed positioning) -->
            <div id="routePlannerCollapseTab" class="route-panel-collapse-tab" onclick="RoutePlanner.toggleCollapse()">
                <i class="bi bi-signpost-split"></i>
                <span class="collapse-tab-count">${this.stops.length}</span>
            </div>
            <div id="routePlannerPanel" class="route-panel">
                <!-- Panel Header -->
                <div class="route-panel-header">
                    <div class="flex items-center gap-2">
                        <button id="routePanelCollapseBtn" class="btn btn-sm btn-circle btn-ghost hover:bg-gray-100" onclick="RoutePlanner.toggleCollapse()" title="Collapse panel">
                            <i class="bi bi-chevron-right"></i>
                        </button>
                        <h3 class="font-bold text-lg text-gray-900 flex items-center gap-2">
                            <i class="bi bi-signpost-split text-primary"></i>
                            Route Planner
                        </h3>
                    </div>
                    <button class="btn btn-sm btn-circle btn-ghost hover:bg-gray-100" onclick="RoutePlanner.hide()">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <!-- Panel Body (scrollable) -->
                <div class="route-panel-body">
                    <!-- Start from Office Toggle -->
                    <div class="flex items-center justify-between mb-3 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center gap-2">
                            <i class="bi bi-building text-gray-500"></i>
                            <span class="text-sm text-gray-700">Start from Office</span>
                        </div>
                        <input type="checkbox" id="officeStartToggle" class="toggle toggle-sm toggle-primary"
                            ${this.useOfficeStart ? 'checked' : ''}
                            ${this.useGpsStart || this.gpsStartPending ? 'disabled' : ''}
                            onchange="RoutePlanner.toggleOfficeStart()" />
                    </div>

                    <!-- Start from Current Location Toggle -->
                    <div class="flex items-center justify-between mb-2 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center gap-2">
                            <i class="bi bi-geo-alt text-gray-500"></i>
                            <span class="text-sm text-gray-700">Start from Current Location</span>
                        </div>
                        <input type="checkbox" id="gpsStartToggle" class="toggle toggle-sm toggle-primary"
                            ${(this.useGpsStart || this.gpsStartPending) ? 'checked' : ''}
                            onchange="RoutePlanner.toggleGpsStart()" />
                    </div>
                    <div id="gpsStartError" class="text-xs text-red-600 mb-3" style="display: none;"></div>

                    <!-- Start Location (only shown when useOfficeStart is true) -->
                    <div id="startLocationSection" class="bg-green-50 border border-green-200 rounded-lg p-3 mb-3" style="${(this.useOfficeStart && !this.useGpsStart && !this.gpsStartPending) ? '' : 'display: none;'}">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
                                <i class="bi bi-flag-fill text-base"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Start From</div>
                                <div class="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                                    <i class="bi ${this.escapeHtml((this.startLocation || this.defaultLocation).icon || 'bi-building')} text-green-600"></i>
                                    ${this.escapeHtml((this.startLocation || this.defaultLocation).name)}
                                </div>
                                <div class="text-xs text-gray-500 truncate">${this.escapeHtml((this.startLocation || this.defaultLocation).address || '')}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Stops Header -->
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-semibold text-gray-600 uppercase tracking-wide stops-header-count">
                            Stops (${this.stops.length})
                        </h4>
                        <button class="btn btn-xs btn-ghost text-red-500 hover:bg-red-50" onclick="RoutePlanner.clearRoute()">
                            <i class="bi bi-trash mr-1"></i> Clear
                        </button>
                    </div>

                    <!-- Stops List -->
                    <div id="route-stops-list" class="space-y-2 mb-4">
                        ${this.generateStopsListHTML()}
                    </div>

                    <!-- Route Summary -->
                    <div id="route-summary" class="bg-gray-50 rounded-lg p-3">
                        <div class="flex items-center justify-center text-sm text-gray-500">
                            <i class="bi bi-arrow-repeat animate-spin mr-2"></i>
                            Calculating route...
                        </div>
                    </div>

                    <!-- Round Trip Toggle -->
                    <div class="flex items-center justify-between mt-3 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center gap-2">
                            <i class="bi bi-arrow-repeat text-gray-500"></i>
                            <span class="text-sm text-gray-700">Round trip</span>
                        </div>
                        <input type="checkbox" id="roundTripToggle" class="toggle toggle-sm toggle-primary"
                            ${this.isRoundTrip ? 'checked' : ''}
                            onchange="RoutePlanner.toggleRoundTrip()" />
                    </div>
                </div>

                <!-- Panel Footer (sticky actions) -->
                <div class="route-panel-footer">
                    <button class="btn btn-outline btn-sm flex-1" onclick="RoutePlanner.optimizeRoute()">
                        <i class="bi bi-lightning mr-1"></i> Optimize
                    </button>
                    <button class="btn btn-primary btn-sm flex-1" onclick="RoutePlanner.exportToGoogleMaps()">
                        <i class="bi bi-google mr-1"></i> Open in Maps
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', panelHTML);
        this.updateStartOptionsUI();

        // Trigger slide-in animation
        requestAnimationFrame(() => {
            const panel = document.getElementById('routePlannerPanel');
            if (panel) panel.classList.add('open');
        });

        // Initialize drag and drop
        this.initDragAndDrop();
    },

    /**
     * Generate HTML for the stops list
     */
    generateStopsListHTML() {
        if (this.stops.length === 0) {
            return `
                <div class="text-center py-8 text-gray-400">
                    <i class="bi bi-signpost-2 text-3xl mb-2"></i>
                    <p>No stops in route</p>
                </div>
            `;
        }

        return this.stops.map((stop, index) => `
            <div class="route-stop-item flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-sm transition-shadow"
                 data-index="${index}"
                 draggable="true">
                <div class="drag-handle text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                    <i class="bi bi-grip-vertical text-lg"></i>
                </div>
                <div class="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    ${index + 1}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-900 truncate flex items-center gap-2">
                        <span>${this.escapeHtml(stop.name)}</span>
                        <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            ${stop.type === 'poi' ? 'POI' : 'JOB'}
                        </span>
                    </div>
                    <div class="text-xs text-gray-500 truncate">${this.escapeHtml(stop.address || 'No address')}</div>
                </div>
                <button class="btn btn-xs btn-ghost text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                        onclick="event.stopPropagation(); RoutePlanner.removeStop(${index})">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `).join('');
    },

    /**
     * Re-render just the stops list
     */
    renderStopsList() {
        const container = document.getElementById('route-stops-list');
        if (container) {
            container.innerHTML = this.generateStopsListHTML();
            this.initDragAndDrop();
        }
        this.updateSummary();
    },

    /**
     * Format duration in seconds to human-readable string
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration string
     */
    formatDuration(seconds) {
        if (!seconds || seconds <= 0) return '--';

        const totalMinutes = Math.round(seconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes} min`;
    },

    /**
     * Format short duration for segment labels
     * @param {number} seconds - Duration in seconds
     * @returns {string} Short formatted duration
     */
    formatShortDuration(seconds) {
        if (!seconds || seconds <= 0) return '';

        const totalMinutes = Math.round(seconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) {
            return `${hours}h${minutes > 0 ? minutes : ''}`;
        }
        return `${minutes}m`;
    },

    /**
     * Add duration labels at the midpoint of each route segment
     * @param {Array} segments - Segments array from ORS response
     * @param {Array} coordinates - Array of [lng, lat] waypoint coordinates
     */
    addSegmentLabels(segments, coordinates) {
        if (!segments || segments.length === 0 || coordinates.length < 2) return;

        // Each segment corresponds to travel between consecutive waypoints
        segments.forEach((segment, index) => {
            if (index >= coordinates.length - 1) return;

            const duration = segment.duration; // seconds
            if (!duration || duration <= 0) return;

            // Get start and end coordinates for this segment
            const start = coordinates[index];     // [lng, lat]
            const end = coordinates[index + 1];   // [lng, lat]

            // Calculate midpoint
            const midLat = (start[1] + end[1]) / 2;
            const midLng = (start[0] + end[0]) / 2;

            // Format duration and distance
            const durationText = this.formatShortDuration(duration);
            const distanceMi = Math.round(segment.distance / 1609.34);

            // Create label marker
            const label = L.marker([midLat, midLng], {
                icon: L.divIcon({
                    className: 'route-segment-label',
                    html: `<div class="segment-duration">${durationText} - ${distanceMi}mi</div>`,
                    iconSize: [80, 24],
                    iconAnchor: [40, 12]
                }),
                interactive: false,
                zIndexOffset: 500
            });

            this.routeLayer.addLayer(label);
        });
    },

    /**
     * Update the route summary display
     */
    updateSummary() {
        const summary = document.getElementById('route-summary');
        if (!summary) return;

        // Show loading state
        if (this.isLoadingRoute) {
            summary.innerHTML = `
                <div class="flex items-center justify-center text-sm text-gray-500">
                    <i class="bi bi-arrow-repeat animate-spin mr-2"></i>
                    Calculating route...
                </div>
            `;
            return;
        }

        // Use API route data if available
        if (this.routeData && this.routeData.usingDrivingRoute) {
            const distanceMiles = (this.routeData.distance / 1609.34).toFixed(1);
            const duration = this.formatDuration(this.routeData.duration);
            const tripType = this.isRoundTrip ? 'Round Trip' : 'One Way';

            summary.innerHTML = `
                <div class="space-y-2 text-sm">
                    ${this.isRoundTrip ? `
                    <div class="text-xs text-primary font-medium text-center mb-1">
                        <i class="bi bi-arrow-repeat mr-1"></i>${tripType}
                    </div>
                    ` : ''}
                    <div class="flex items-center justify-between">
                        <span class="text-gray-600">Driving Distance:</span>
                        <span class="font-semibold text-gray-900">${distanceMiles} miles</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-gray-600">Estimated Time:</span>
                        <span class="font-semibold text-gray-900">${duration}</span>
                    </div>
                </div>
            `;
        } else {
            // Fallback to straight-line estimate
            const totalDist = this.getTotalDistance();
            summary.innerHTML = `
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">Estimated Distance:</span>
                    <span class="font-semibold text-gray-900">~${totalDist.toFixed(1)} miles</span>
                </div>
                ${this.routeData && !this.routeData.usingDrivingRoute ? `
                <div class="text-xs text-gray-400 mt-1">
                    <i class="bi bi-info-circle mr-1"></i>
                    Straight-line estimate (route API unavailable)
                </div>
                ` : ''}
            `;
        }
    },

    /**
     * Initialize drag and drop for reordering stops
     */
    initDragAndDrop() {
        const container = document.getElementById('route-stops-list');
        if (!container) return;

        const items = container.querySelectorAll('.route-stop-item');
        let draggedItem = null;
        let draggedIndex = -1;

        items.forEach((item, index) => {
            // Desktop drag events
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                draggedIndex = index;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
            });

            item.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('dragging');
                }
                draggedItem = null;
                draggedIndex = -1;

                // Remove all drop indicators
                container.querySelectorAll('.route-stop-item').forEach(el => {
                    el.classList.remove('drop-above', 'drop-below');
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                if (!draggedItem || draggedItem === item) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                // Show drop indicator
                container.querySelectorAll('.route-stop-item').forEach(el => {
                    el.classList.remove('drop-above', 'drop-below');
                });

                if (e.clientY < midY) {
                    item.classList.add('drop-above');
                } else {
                    item.classList.add('drop-below');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drop-above', 'drop-below');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();

                if (!draggedItem || draggedItem === item) return;

                const fromIndex = draggedIndex;
                let toIndex = parseInt(item.dataset.index);

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (e.clientY > midY && toIndex < fromIndex) {
                    toIndex++;
                } else if (e.clientY < midY && toIndex > fromIndex) {
                    toIndex--;
                }

                this.reorderStops(fromIndex, toIndex);
            });
        });

        // Touch support for mobile
        this.initTouchDragAndDrop(container);
    },

    /**
     * Initialize touch-based drag and drop for mobile
     */
    initTouchDragAndDrop(container) {
        let touchedItem = null;
        let touchStartY = 0;
        let initialTop = 0;
        let placeholder = null;
        let items = [];

        container.addEventListener('touchstart', (e) => {
            const handle = e.target.closest('.drag-handle');
            if (!handle) return;

            touchedItem = handle.closest('.route-stop-item');
            if (!touchedItem) return;

            touchStartY = e.touches[0].clientY;
            initialTop = touchedItem.offsetTop;

            touchedItem.classList.add('dragging');

            // Create placeholder
            placeholder = document.createElement('div');
            placeholder.className = 'route-stop-placeholder';
            placeholder.style.height = touchedItem.offsetHeight + 'px';

            items = Array.from(container.querySelectorAll('.route-stop-item:not(.dragging)'));
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!touchedItem) return;
            e.preventDefault();

            const currentY = e.touches[0].clientY;
            const deltaY = currentY - touchStartY;

            // Move the touched item visually
            touchedItem.style.transform = `translateY(${deltaY}px)`;
            touchedItem.style.zIndex = '100';

            // Find insertion point
            for (const item of items) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (currentY < midY) {
                    if (placeholder.nextSibling !== item) {
                        container.insertBefore(placeholder, item);
                    }
                    return;
                }
            }

            // If past all items, append at end
            if (items.length > 0) {
                const lastItem = items[items.length - 1];
                if (placeholder !== lastItem.nextSibling) {
                    container.insertBefore(placeholder, lastItem.nextSibling);
                }
            }
        }, { passive: false });

        container.addEventListener('touchend', () => {
            if (!touchedItem) return;

            const fromIndex = parseInt(touchedItem.dataset.index);

            // Determine new index based on placeholder position
            let toIndex = 0;
            const allItems = container.querySelectorAll('.route-stop-item, .route-stop-placeholder');
            allItems.forEach((item, idx) => {
                if (item === placeholder) {
                    toIndex = idx;
                }
            });

            // Clean up
            touchedItem.classList.remove('dragging');
            touchedItem.style.transform = '';
            touchedItem.style.zIndex = '';

            if (placeholder && placeholder.parentNode) {
                placeholder.remove();
            }

            // Perform reorder if positions changed
            if (fromIndex !== toIndex) {
                // Account for the placeholder taking a slot
                if (toIndex > fromIndex) toIndex--;
                this.reorderStops(fromIndex, toIndex);
            }

            touchedItem = null;
            placeholder = null;
        }, { passive: true });
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    RoutePlanner.init();
});

// Global function to center map on default start location
window.centerOnOffice = function() {
    const pois = window.AppState?.pois || [];
    const epicenter = pois.find(poi =>
        poi.name && poi.name.toLowerCase().includes('epicenter')
    );
    const start = epicenter || window.RoutePlanner?.startLocation || window.RoutePlanner?.defaultLocation;
    if (start && window.AppState?.map && Number.isFinite(start.lat) && Number.isFinite(start.lng)) {
        window.AppState.map.setView([start.lat, start.lng], 17);
        if (window.showNotification) {
            window.showNotification(`Centered on ${start.name || 'office'}`, 'info');
        }
    }
};

// Also try to initialize if map is already loaded
if (window.AppState && window.AppState.map) {
    RoutePlanner.init();
}

// Helper function to get selected jobs as array
window.getSelectedJobsArray = function() {
    if (!window.AppState || !window.AppState.selectedJobs) return [];

    return Array.from(window.AppState.selectedJobs)
        .map(jobNum => (window.AppState.allJobs || []).find(j => j.job_number === jobNum))
        .filter(Boolean);
};
