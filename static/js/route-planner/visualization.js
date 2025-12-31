/**
 * Route Planner Visualization Module
 * Handles route drawing, segment labels, and map visualization.
 */

const RoutePlannerVisualization = {
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
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} getStartInfo - Function to get start info
     * @param {Function} getTotalDistance - Function to get total distance
     * @param {Function} updateSummaryCallback - Callback to update summary
     */
    async drawRoute(state, getStartInfo, getTotalDistance, updateSummaryCallback) {
        const gpsLocation = window.RoutePlannerGps?.getGpsStartLocation(state);
        if (state.gpsStartPending && !gpsLocation) {
            return;
        }

        this.clearVisualization(state);

        if (!state.routeLayer || state.stops.length === 0) return;

        const startInfo = getStartInfo(state);
        const startLocation = startInfo.location;

        // Build coordinates array in [lng, lat] format for OpenRouteService
        const coordinates = [];

        // Only add start location if GPS or Office start is enabled
        if (startInfo.type !== 'first-stop' && startLocation) {
            coordinates.push([startLocation.lng, startLocation.lat]);
        }

        for (const stop of state.stops) {
            const lat = stop.lat;
            const lng = stop.lng;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                coordinates.push([lng, lat]);
            }
        }

        // Need at least 2 coordinates for a route
        if (coordinates.length < 2) {
            state.routeData = null;
            if (updateSummaryCallback) updateSummaryCallback();
            return;
        }

        // Add return to start if round trip is enabled and we have a start location
        if (state.isRoundTrip && startInfo.type !== 'first-stop' && coordinates.length > 1) {
            coordinates.push([startLocation.lng, startLocation.lat]);
        }

        // Show loading state
        state.isLoadingRoute = true;
        if (updateSummaryCallback) updateSummaryCallback();

        // Try to fetch driving route from API
        const routeResponse = await this.fetchDrivingRoute(coordinates);

        state.isLoadingRoute = false;

        if (routeResponse && routeResponse.features && routeResponse.features.length > 0) {
            // Use actual road geometry from API
            const feature = routeResponse.features[0];
            const geometry = feature.geometry;
            const summary = feature.properties?.summary || {};
            const segments = feature.properties?.segments || [];

            // Store route data for display
            state.routeData = {
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
            state.routeLayer.addLayer(polyline);

            // Add segment duration labels at midpoints along actual route
            this.addSegmentLabels(state, segments, geometry.coordinates);
            this.centerMapOnRoute(routeCoords);
        } else {
            // Fallback to straight lines
            state.routeData = {
                distance: getTotalDistance() * 1609.34, // Convert miles to meters
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
            state.routeLayer.addLayer(polyline);
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
            startMarker.bindPopup(`<strong>Start:</strong> ${this.escapeHtml(startLocation.name)}${startLocation.address ? '<br>' + this.escapeHtml(startLocation.address) : ''}`);
            state.routeLayer.addLayer(startMarker);
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
            state.routeLayer.addLayer(gpsMarker);
        }

        // Add numbered markers for each stop
        state.stops.forEach((stop, index) => {
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
                marker.bindPopup(`<strong>Stop ${index + 1}:</strong> ${this.escapeHtml(stop.name)}<br>${this.escapeHtml(stop.address || 'No address')}`);
                state.routeLayer.addLayer(marker);
            }
        });

        // Update summary with actual route data
        if (updateSummaryCallback) updateSummaryCallback();
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
     * @param {Object} state - RoutePlannerState reference
     */
    clearVisualization(state) {
        if (state.routeLayer) {
            state.routeLayer.clearLayers();
        }
    },

    /**
     * Add duration labels at the midpoint of each route segment along the actual path
     * @param {Object} state - RoutePlannerState reference
     * @param {Array} segments - Segments array from ORS response
     * @param {Array} routeCoords - Full route geometry coordinates [lng, lat] from ORS
     */
    addSegmentLabels(state, segments, routeCoords) {
        if (!segments || segments.length === 0 || !routeCoords || routeCoords.length < 2) return;

        const formatShortDuration = window.RoutePlannerCalculation?.formatShortDuration.bind(window.RoutePlannerCalculation);

        segments.forEach((segment) => {
            const duration = segment.duration;
            if (!duration || duration <= 0) return;

            // Get the start and end indices in the route geometry from the segment's steps
            const steps = segment.steps || [];
            if (steps.length === 0) return;

            const startIdx = steps[0]?.way_points?.[0] ?? 0;
            const endIdx = steps[steps.length - 1]?.way_points?.[1] ?? (routeCoords.length - 1);

            // Find the midpoint index along the actual route path for this segment
            const midIdx = Math.floor((startIdx + endIdx) / 2);
            const midCoord = routeCoords[midIdx];

            if (!midCoord) return;

            // Format duration and distance
            const durationText = formatShortDuration ? formatShortDuration(duration) : '';
            const distanceMi = Math.round(segment.distance / 1609.34);

            // Create label marker at the actual route midpoint [lat, lng] from [lng, lat]
            const label = L.marker([midCoord[1], midCoord[0]], {
                icon: L.divIcon({
                    className: 'route-segment-label',
                    html: `<div class="segment-duration">${durationText} - ${distanceMi}mi</div>`,
                    iconSize: [80, 24],
                    iconAnchor: [40, 12]
                }),
                interactive: false,
                zIndexOffset: 500
            });

            state.routeLayer.addLayer(label);
        });
    },

    /**
     * Export route to Google Maps
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} getStartInfo - Function to get start info
     */
    exportToGoogleMaps(state, getStartInfo) {
        if (state.stops.length === 0) {
            if (window.showNotification) {
                window.showNotification('No stops in route', 'error');
            }
            return;
        }

        const gpsLocation = window.RoutePlannerGps?.getGpsStartLocation(state);
        if (state.gpsStartPending && !gpsLocation) {
            if (window.showNotification) {
                window.showNotification('Waiting for current location...', 'info');
            }
            return;
        }

        // Google Maps limits to 10 waypoints
        if (state.stops.length > 10) {
            if (window.showNotification) {
                window.showNotification('Google Maps limited to 10 waypoints. Route truncated.', 'warning');
            }
        }

        const startInfo = getStartInfo(state);
        let origin;
        let stopsForRoute = [...state.stops];

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
    }
};

window.RoutePlannerVisualization = RoutePlannerVisualization;
