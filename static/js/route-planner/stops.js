/**
 * Route Planner Stops Module
 * Handles stop building, management, and selection synchronization.
 */

const RoutePlannerStops = {
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
     * Add a stop to the route
     * @param {Object} job - Job object to add
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} renderCallback - Callback to render stops list
     * @param {Function} drawCallback - Callback to draw route
     */
    addStop(job, state, renderCallback, drawCallback) {
        const stop = job?.type ? job : this.buildStopFromJob(job);
        if (!stop) return;
        if (!state.stops.find(s => this.getStopKey(s) === this.getStopKey(stop))) {
            state.stops.push(stop);
            if (renderCallback) renderCallback();
            if (drawCallback) drawCallback();
        }
    },

    /**
     * Remove a stop from the route
     * @param {number} index - Index of stop to remove
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} renderCallback - Callback to render stops list
     * @param {Function} scheduleDrawCallback - Callback to schedule route redraw
     * @param {Function} updateSummaryCallback - Callback to update summary
     */
    removeStop(index, state, renderCallback, scheduleDrawCallback, updateSummaryCallback) {
        if (index >= 0 && index < state.stops.length) {
            const stop = state.stops[index];

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

            state.stops.splice(index, 1);
            if (renderCallback) renderCallback();
            if (scheduleDrawCallback) scheduleDrawCallback();
            if (updateSummaryCallback) updateSummaryCallback();
            this.dispatchSelectionChanged();
        }
    },

    /**
     * Reorder stops in the route
     * @param {number} fromIndex - Original index
     * @param {number} toIndex - New index
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} renderCallback - Callback to render stops list
     * @param {Function} drawCallback - Callback to draw route
     * @param {Function} updateSummaryCallback - Callback to update summary
     */
    reorderStops(fromIndex, toIndex, state, renderCallback, drawCallback, updateSummaryCallback) {
        if (fromIndex === toIndex) return;

        const [removed] = state.stops.splice(fromIndex, 1);
        state.stops.splice(toIndex, 0, removed);

        if (renderCallback) renderCallback();
        if (drawCallback) drawCallback();
        if (updateSummaryCallback) updateSummaryCallback();
    },

    /**
     * Clear all stops from the route
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} clearVisualizationCallback - Callback to clear visualization
     * @param {Function} renderCallback - Callback to render stops list
     * @param {Function} updateSummaryCallback - Callback to update summary
     */
    clearRoute(state, clearVisualizationCallback, renderCallback, updateSummaryCallback) {
        state.stops = [];
        if (clearVisualizationCallback) clearVisualizationCallback();
        if (renderCallback) renderCallback();
        if (updateSummaryCallback) updateSummaryCallback();
    },

    /**
     * Sync route stops with currently selected jobs
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} renderCallback - Callback to render stops list
     * @param {Function} updateHeaderCallback - Callback to update stops header
     * @param {Function} scheduleDrawCallback - Callback to schedule route redraw
     */
    syncWithSelectedJobs(state, renderCallback, updateHeaderCallback, scheduleDrawCallback) {
        if (!window.AppState) return;

        const selectedStops = this.buildStopsFromSelection();
        const selectedKeys = new Set(selectedStops.map(stop => this.getStopKey(stop)));

        let changed = false;

        // Remove stops that are no longer selected
        const filteredStops = state.stops.filter(stop => selectedKeys.has(this.getStopKey(stop)));
        if (filteredStops.length !== state.stops.length) {
            state.stops = filteredStops;
            changed = true;
        }

        // Add newly selected stops (preserve existing order, append new ones)
        const currentKeys = new Set(state.stops.map(stop => this.getStopKey(stop)));
        for (const stop of selectedStops) {
            if (!currentKeys.has(this.getStopKey(stop))) {
                state.stops.push(stop);
                currentKeys.add(this.getStopKey(stop));
                changed = true;
            }
        }

        if (changed) {
            if (renderCallback) renderCallback();
            if (updateHeaderCallback) updateHeaderCallback();
            if (scheduleDrawCallback) scheduleDrawCallback();
        }
    },

    /**
     * Load available starting points from POIs
     * @param {Object} state - RoutePlannerState reference
     */
    loadAvailableStarts(state) {
        if (window.AppState && window.AppState.pois) {
            state.availableStarts = [...window.AppState.pois];
        } else {
            state.availableStarts = [];
        }

        // Resolve default start location (prefer "epicenter", else fallback)
        const epicenterPoi = state.availableStarts.find(poi =>
            poi.name && poi.name.toLowerCase().includes('epicenter')
        );

        state.startLocation = epicenterPoi || { ...state.defaultLocation };
    }
};

window.RoutePlannerStops = RoutePlannerStops;
