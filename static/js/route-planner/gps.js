/**
 * Route Planner GPS Module
 * Handles GPS location and start point options.
 */

const RoutePlannerGps = {
    /**
     * Toggle whether to start from Office or first job
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} updateUICallback - Callback to update start options UI
     * @param {Function} scheduleDrawCallback - Callback to schedule route redraw
     */
    toggleOfficeStart(state, updateUICallback, scheduleDrawCallback) {
        if (state.useGpsStart || state.gpsStartPending) {
            return;
        }
        state.useOfficeStart = !state.useOfficeStart;
        // Update toggle UI
        const toggle = document.getElementById('officeStartToggle');
        if (toggle) {
            toggle.checked = state.useOfficeStart;
        }
        if (updateUICallback) updateUICallback();
        if (scheduleDrawCallback) scheduleDrawCallback();
    },

    /**
     * Toggle whether to start from current GPS location
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} scheduleDrawCallback - Callback to schedule route redraw
     */
    toggleGpsStart(state, scheduleDrawCallback) {
        const nextState = !state.useGpsStart;
        const toggle = document.getElementById('gpsStartToggle');

        if (!nextState) {
            this.setGpsError('');
            this.disableGpsStart(state);
            if (toggle) toggle.checked = false;
            if (scheduleDrawCallback) scheduleDrawCallback();
            return;
        }

        if (toggle) toggle.checked = true;
        this.enableGpsStart(state, scheduleDrawCallback);
    },

    /**
     * Request current GPS location and enable GPS start when available
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} scheduleDrawCallback - Callback to schedule route redraw
     */
    enableGpsStart(state, scheduleDrawCallback) {
        if (!navigator.geolocation) {
            this.setGpsError('Location services not available');
            if (window.showNotification) {
                window.showNotification('Location services not available', 'error');
            }
            this.disableGpsStart(state);
            return;
        }

        state.previousOfficeStart = state.useOfficeStart;
        state.useGpsStart = true;
        state.useOfficeStart = false;
        state.gpsStartPending = true;
        state.gpsRequestId += 1;
        const requestId = state.gpsRequestId;
        this.setGpsError('');
        this.updateStartOptionsUI(state);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (requestId !== state.gpsRequestId) return;
                const { latitude, longitude, accuracy } = position.coords;
                if (window.AppState) {
                    window.AppState.currentLocation = {
                        lat: latitude,
                        lng: longitude,
                        accuracy,
                        timestamp: Date.now()
                    };
                }

                state.gpsStartPending = false;
                this.updateStartOptionsUI(state);
                if (scheduleDrawCallback) scheduleDrawCallback();
            },
            (error) => {
                if (requestId !== state.gpsRequestId) return;
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

                this.disableGpsStart(state);
                if (scheduleDrawCallback) scheduleDrawCallback();
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
     * @param {Object} state - RoutePlannerState reference
     */
    disableGpsStart(state) {
        state.useGpsStart = false;
        state.gpsStartPending = false;
        state.gpsRequestId += 1;
        if (state.previousOfficeStart !== null) {
            state.useOfficeStart = state.previousOfficeStart;
        }
        state.previousOfficeStart = null;
        this.updateStartOptionsUI(state);
    },

    /**
     * Update start option UI states
     * @param {Object} state - RoutePlannerState reference
     */
    updateStartOptionsUI(state) {
        const gpsToggle = document.getElementById('gpsStartToggle');
        if (gpsToggle) {
            gpsToggle.checked = state.useGpsStart || state.gpsStartPending;
        }

        const officeToggle = document.getElementById('officeStartToggle');
        if (officeToggle) {
            officeToggle.disabled = state.useGpsStart || state.gpsStartPending;
            officeToggle.checked = state.useOfficeStart && !state.useGpsStart && !state.gpsStartPending;
        }

        const startSection = document.getElementById('startLocationSection');
        if (startSection) {
            startSection.style.display = (state.useOfficeStart && !state.useGpsStart && !state.gpsStartPending)
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
     * Get active GPS start location if available
     * @param {Object} state - RoutePlannerState reference
     * @returns {Object|null}
     */
    getGpsStartLocation(state) {
        if (!state.useGpsStart) return null;
        const location = window.AppState?.currentLocation;
        if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
            return null;
        }
        return location;
    },

    /**
     * Determine the active start location info
     * @param {Object} state - RoutePlannerState reference
     * @returns {Object}
     */
    getStartInfo(state) {
        const gpsLocation = this.getGpsStartLocation(state);
        if (gpsLocation) {
            return {
                type: 'gps',
                location: gpsLocation,
                name: 'Current Location'
            };
        }

        if (state.useOfficeStart) {
            return {
                type: 'office',
                location: state.startLocation || state.defaultLocation
            };
        }

        return { type: 'first-stop', location: null };
    },

    /**
     * Toggle round trip mode (return to office)
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} drawCallback - Callback to draw route
     */
    toggleRoundTrip(state, drawCallback) {
        state.isRoundTrip = !state.isRoundTrip;
        // Update toggle UI
        const toggle = document.getElementById('roundTripToggle');
        if (toggle) {
            toggle.checked = state.isRoundTrip;
        }
        // Redraw route with or without return leg
        if (drawCallback) drawCallback();
    }
};

window.RoutePlannerGps = RoutePlannerGps;
