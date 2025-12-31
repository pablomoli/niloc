/**
 * Route Planner Calculation Module
 * Handles distance calculations and route optimization.
 */

const RoutePlannerCalculation = {
    /**
     * Calculate distance between two points using Haversine formula
     * @param {number} lat1 - Latitude of first point
     * @param {number} lng1 - Longitude of first point
     * @param {number} lat2 - Latitude of second point
     * @param {number} lng2 - Longitude of second point
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
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} getStartInfo - Function to get start info
     * @returns {number} Total distance in miles
     */
    getTotalDistance(state, getStartInfo) {
        if (state.stops.length === 0) return 0;

        const startInfo = getStartInfo(state);
        let total = 0;
        let prevLat, prevLng;

        // Start from GPS, Office, or first job based on setting
        if (startInfo.type === 'gps' || startInfo.type === 'office') {
            prevLat = startInfo.location.lat;
            prevLng = startInfo.location.lng;
        } else {
            const firstStop = state.stops[0];
            prevLat = firstStop.lat;
            prevLng = firstStop.lng;
            if (!Number.isFinite(prevLat) || !Number.isFinite(prevLng)) return 0;
        }

        // Calculate distances between stops
        const stopsToProcess = startInfo.type === 'first-stop' ? state.stops.slice(1) : state.stops;
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
     * Optimize route using nearest neighbor algorithm
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} getStartInfo - Function to get start info
     * @param {Function} renderCallback - Callback to render stops list
     * @param {Function} drawCallback - Callback to draw route
     * @param {Function} updateSummaryCallback - Callback to update summary
     * @returns {boolean} True if optimization was performed
     */
    optimizeRoute(state, getStartInfo, renderCallback, drawCallback, updateSummaryCallback) {
        if (state.stops.length < 2) {
            if (window.showNotification) {
                window.showNotification('Need at least 2 stops to optimize', 'warning');
            }
            return false;
        }

        const gpsLocation = window.RoutePlannerGps?.getGpsStartLocation(state);
        if (state.gpsStartPending && !gpsLocation) {
            if (window.showNotification) {
                window.showNotification('Waiting for current location...', 'info');
            }
            return false;
        }

        const validStops = state.stops.filter(stop =>
            Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
        );
        const invalidStops = state.stops.filter(stop =>
            !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)
        );

        if (validStops.length < 2) {
            if (window.showNotification) {
                window.showNotification('Need at least 2 stops with valid coordinates', 'warning');
            }
            return false;
        }

        const unvisited = [...validStops];
        const optimized = [];

        // Start from GPS, Office, or first job based on setting
        let current;
        const startInfo = getStartInfo(state);
        if (startInfo.type === 'gps' || startInfo.type === 'office') {
            current = startInfo.location;
        } else {
            // Start from first job when not using office start
            const firstStop = unvisited.shift();
            if (!firstStop) {
                if (window.showNotification) {
                    window.showNotification('No valid stops available to optimize', 'warning');
                }
                return false;
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

        state.stops = [...optimized, ...invalidStops];
        if (renderCallback) renderCallback();
        if (drawCallback) drawCallback();
        if (updateSummaryCallback) updateSummaryCallback();

        if (window.showNotification) {
            window.showNotification('Route optimized', 'success');
        }

        return true;
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
    }
};

window.RoutePlannerCalculation = RoutePlannerCalculation;
