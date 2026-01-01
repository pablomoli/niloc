/**
 * Map Selection Module
 * Job and POI selection management and events.
 */

/**
 * Toggle job selection state.
 */
function toggleJobSelection(job) {
    if (AppState.selectedJobs.has(job.job_number)) {
        AppState.selectedJobs.delete(job.job_number);
    } else {
        AppState.selectedJobs.add(job.job_number);
    }

    const marker = AppState.markers.get(job.job_number);
    if (marker && window.MarkerUtils) {
        const isSelected = AppState.selectedJobs.has(job.job_number);
        marker.setIcon(MarkerUtils.getStatusIcon(job.status, isSelected));
    }

    updateSelectedJobsInfo();
    dispatchSelectionChangedEvent();
}

/**
 * Update the UI with selected jobs count.
 */
function updateSelectedJobsInfo() {
    console.log(`Selected jobs: ${AppState.selectedJobs.size}`);
    const selectedCountElement = document.getElementById('selectedCount');
    if (selectedCountElement) {
        selectedCountElement.textContent = `Selected: ${AppState.selectedJobs.size} jobs`;
    }
}

/**
 * Clear all selected jobs and POIs.
 */
function clearSelection() {
    AppState.selectedJobs.clear();
    AppState.selectedPois.clear();
    updateMapMarkers();
    renderPoiMarkers();
    updateSelectedJobsInfo();
    dispatchSelectionChangedEvent();
}

/**
 * Dispatch unified selection changed event.
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

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        if (AppState.selectedJobs.size > 0 || AppState.selectedPois.size > 0) {
            clearSelection();
        }
    }
});

// Export to window
window.toggleJobSelection = toggleJobSelection;
window.updateSelectedJobsInfo = updateSelectedJobsInfo;
window.clearSelection = clearSelection;
window.dispatchSelectionChangedEvent = dispatchSelectionChangedEvent;
