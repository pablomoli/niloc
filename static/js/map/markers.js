/**
 * Map Markers Module
 * Job marker creation, clustering, and updates.
 */

/**
 * Create a marker cluster layer.
 */
function createClusterLayer() {
    return L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 18,
        chunkedLoading: true,
        chunkDelay: 50,
        chunkInterval: 200,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });
}

/**
 * Initialize the marker layer (clustered or simple).
 */
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

/**
 * Enable or disable marker clustering.
 * @param {boolean} enable - Whether to enable clustering.
 * @returns {boolean} The resulting clustering state.
 */
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

// Throttle marker updates
let markerUpdateTimer = null;

/**
 * Update markers on the map (throttled).
 */
function updateMapMarkers() {
    if (!AppState.markerLayer) {
        console.warn('Marker layer not initialized yet');
        return;
    }

    if (markerUpdateTimer) clearTimeout(markerUpdateTimer);
    markerUpdateTimer = setTimeout(() => {
        performMarkerUpdate();
    }, 100);
}

/**
 * Perform the actual marker update.
 */
function performMarkerUpdate() {
    AppState.markerLayer.clearLayers();
    AppState.markers.clear();

    const bounds = AppState.map.getBounds();
    const visibleJobs = AppState.filteredJobs.filter(job => {
        const lat = parseFloat(job.latitude || job.lat);
        const lng = parseFloat(job.longitude || job.long);
        if (!lat || !lng) return false;
        return bounds.contains([lat, lng]);
    });

    const jobsToRender = visibleJobs.length > 1000 ? visibleJobs : AppState.filteredJobs;

    jobsToRender.forEach(job => {
        const lat = job.latitude || job.lat;
        const lng = job.longitude || job.long;

        if (lat && lng) {
            const isSelected = AppState.selectedJobs.has(job.job_number);

            let marker;
            if (window.MarkerUtils) {
                marker = MarkerUtils.createJobMarker(lat, lng, job, isSelected);
            } else {
                marker = L.marker([lat, lng])
                    .bindPopup(`
                        <strong>${escapeHtml(job.job_number)}</strong><br>
                        ${escapeHtml(job.client)}<br>
                        ${escapeHtml(job.address)}
                    `);
            }

            marker.on('click', function (e) {
                handleMarkerClick(e, job);
            });

            AppState.markers.set(job.job_number, marker);
            AppState.markerLayer.addLayer(marker);
        }
    });

    if (AppState.useClustering && AppState.markerLayer.refreshClusters) {
        AppState.markerLayer.refreshClusters();
    }
}

/**
 * Handle marker click for selection.
 */
function handleMarkerClick(e, job) {
    const latestJob = AppState.allJobs.find(j => j.job_number === job.job_number) || job;
    const isMultiSelect = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);

    if (isMultiSelect) {
        toggleJobSelection(latestJob);
    } else {
        AppState.selectedJobs.clear();
        AppState.selectedJobs.add(latestJob.job_number);
        updateMapMarkers();

        if (window.SimpleModal && typeof window.SimpleModal.show === 'function') {
            window.SimpleModal.show(latestJob);
        } else {
            console.error('SimpleModal not available');
        }
    }
}

/**
 * Update a job marker after status change.
 */
function updateJobMarker(jobNumber, updatedJob) {
    let marker = AppState.markers.get(jobNumber);
    const hasMarkerUtils = Boolean(window.MarkerUtils);

    const mergeIntoCache = (arr) => {
        const idx = arr.findIndex(j => j.job_number === jobNumber);
        if (idx !== -1) arr[idx] = { ...arr[idx], ...updatedJob };
    };
    if (Array.isArray(AppState.allJobs)) mergeIntoCache(AppState.allJobs);
    if (Array.isArray(AppState.filteredJobs)) mergeIntoCache(AppState.filteredJobs);

    const isSelected = AppState.selectedJobs.has(jobNumber);
    const lat = updatedJob.latitude || updatedJob.lat;
    const lng = updatedJob.longitude || updatedJob.long;

    if (!marker && lat && lng) {
        const icon = hasMarkerUtils ? MarkerUtils.getStatusIcon(updatedJob.status, isSelected) : undefined;
        marker = L.marker([lat, lng], icon ? { icon } : undefined);
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
        if (hasMarkerUtils) {
            marker.setIcon(MarkerUtils.getStatusIcon(updatedJob.status, isSelected));
        }

        if (lat && lng && marker.setLatLng) {
            marker.setLatLng([lat, lng]);
            if (AppState.useClustering && AppState.markerLayer && typeof AppState.markerLayer.refreshClusters === 'function') {
                try { AppState.markerLayer.refreshClusters(marker); } catch (_) { }
            }
        }

        marker.off('click');
        marker.on('click', function (e) {
            const j = (AppState.allJobs || []).find(x => x.job_number === jobNumber) || updatedJob;
            handleMarkerClick(e, j);
        });

        if (marker.getPopup) {
            const popup = marker.getPopup();
            if (popup) {
                popup.setContent(`
                    <strong>${escapeHtml(updatedJob.job_number)}</strong><br>
                    Client: ${escapeHtml(updatedJob.client)}<br>
                    Status: ${escapeHtml(updatedJob.status)}
                `);
            }
        }
    }
}

/**
 * Check if marker clustering is supported.
 */
function isMarkerClusteringSupported() {
    return typeof L.markerClusterGroup === 'function';
}

// Export to window
window.createClusterLayer = createClusterLayer;
window.initializeMarkerLayer = initializeMarkerLayer;
window.setMarkerClusteringEnabled = setMarkerClusteringEnabled;
window.updateMapMarkers = updateMapMarkers;
window.performMarkerUpdate = performMarkerUpdate;
window.handleMarkerClick = handleMarkerClick;
window.updateJobMarker = updateJobMarker;
window.isMarkerClusteringSupported = isMarkerClusteringSupported;
