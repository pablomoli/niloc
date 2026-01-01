/**
 * Map POIs Module
 * Point of Interest loading, rendering, and selection.
 */

/**
 * Load POIs from the server.
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

        document.dispatchEvent(new CustomEvent('poisLoaded', {
            detail: { pois: AppState.pois }
        }));
    } catch (error) {
        console.error('Failed to load POIs:', error);
    }
}

/**
 * Render all POI markers on the map.
 */
function renderPoiMarkers() {
    AppState.poiMarkers.forEach(marker => {
        AppState.map.removeLayer(marker);
    });
    AppState.poiMarkers.clear();

    if (!AppState.poisVisible) {
        return;
    }

    AppState.pois.forEach(poi => {
        if (poi.lat && poi.lng) {
            const isSelected = AppState.selectedPois.has(poi.id);

            let marker;
            if (window.MarkerUtils && window.MarkerUtils.createPoiMarker) {
                marker = MarkerUtils.createPoiMarker(poi, isSelected);
            } else {
                marker = L.marker([poi.lat, poi.lng], {
                    title: poi.name
                });
            }

            marker.bindTooltip(poi.name, {
                permanent: false,
                direction: 'top',
                offset: [0, -12],
                className: 'poi-tooltip'
            });

            marker.on('click', function (e) {
                handlePoiClick(e, poi);
            });

            AppState.poiMarkers.set(poi.id, marker);
            marker.addTo(AppState.map);
        }
    });
}

/**
 * Set the visibility of POI markers.
 * @param {boolean} visible - Whether POIs should be visible.
 */
function setPoisVisible(visible) {
    AppState.poisVisible = visible;
    renderPoiMarkers();
}

/**
 * Handle a click on a POI marker.
 */
function handlePoiClick(e, poi) {
    const isMultiSelect = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);

    if (isMultiSelect) {
        togglePoiSelection(poi);
    }
}

/**
 * Toggle POI selection state.
 */
function togglePoiSelection(poi) {
    if (AppState.selectedPois.has(poi.id)) {
        AppState.selectedPois.delete(poi.id);
    } else {
        AppState.selectedPois.add(poi.id);
    }

    const marker = AppState.poiMarkers.get(poi.id);
    if (marker && window.MarkerUtils && window.MarkerUtils.getPoiIcon) {
        const isSelected = AppState.selectedPois.has(poi.id);
        marker.setIcon(MarkerUtils.getPoiIcon(poi.icon, poi.color, isSelected));
    }

    dispatchSelectionChangedEvent();
}

/**
 * Update a POI marker.
 */
function updatePoiMarker(poiId, updatedPoi) {
    const idx = AppState.pois.findIndex(p => p.id === poiId);
    if (idx !== -1) {
        AppState.pois[idx] = { ...AppState.pois[idx], ...updatedPoi };
    }

    const marker = AppState.poiMarkers.get(poiId);
    if (marker) {
        if (updatedPoi.lat && updatedPoi.lng) {
            marker.setLatLng([updatedPoi.lat, updatedPoi.lng]);
        }

        if (window.MarkerUtils && window.MarkerUtils.getPoiIcon) {
            const isSelected = AppState.selectedPois.has(poiId);
            marker.setIcon(MarkerUtils.getPoiIcon(updatedPoi.icon, updatedPoi.color, isSelected));
        }

        marker.setTooltipContent(updatedPoi.name);
    }
}

/**
 * Get the default starting POI for route planning.
 */
function getDefaultStartPoi() {
    const epicenter = AppState.pois.find(poi =>
        poi.name && poi.name.toLowerCase().includes('epicenter')
    );
    return epicenter || AppState.pois[0] || null;
}

/**
 * Get currently selected POIs.
 */
function getSelectedPois() {
    return AppState.pois.filter(poi => AppState.selectedPois.has(poi.id));
}

// Export to window
window.loadPois = loadPois;
window.renderPoiMarkers = renderPoiMarkers;
window.setPoisVisible = setPoisVisible;
window.handlePoiClick = handlePoiClick;
window.togglePoiSelection = togglePoiSelection;
window.updatePoiMarker = updatePoiMarker;
window.getDefaultStartPoi = getDefaultStartPoi;
window.getSelectedPois = getSelectedPois;
