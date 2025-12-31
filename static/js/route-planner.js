/**
 * Route Planner Module for Epic Map
 * Main entry point that coordinates extracted modules.
 *
 * Dependencies (must be loaded before this file):
 * - static/js/route-planner/state.js
 * - static/js/route-planner/stops.js
 * - static/js/route-planner/gps.js
 * - static/js/route-planner/calculation.js
 * - static/js/route-planner/visualization.js
 * - static/js/route-planner/ui.js
 */

window.RoutePlanner = {
  // Delegate state to state module
  get defaultLocation() { return RoutePlannerState.defaultLocation; },
  get startLocation() { return RoutePlannerState.startLocation; },
  set startLocation(val) { RoutePlannerState.startLocation = val; },
  get availableStarts() { return RoutePlannerState.availableStarts; },
  get stops() { return RoutePlannerState.stops; },
  set stops(val) { RoutePlannerState.stops = val; },
  get routeLayer() { return RoutePlannerState.routeLayer; },
  set routeLayer(val) { RoutePlannerState.routeLayer = val; },
  get isOpen() { return RoutePlannerState.isOpen; },
  set isOpen(val) { RoutePlannerState.isOpen = val; },
  get isCollapsed() { return RoutePlannerState.isCollapsed; },
  set isCollapsed(val) { RoutePlannerState.isCollapsed = val; },
  get isRoundTrip() { return RoutePlannerState.isRoundTrip; },
  set isRoundTrip(val) { RoutePlannerState.isRoundTrip = val; },
  get useOfficeStart() { return RoutePlannerState.useOfficeStart; },
  set useOfficeStart(val) { RoutePlannerState.useOfficeStart = val; },
  get useGpsStart() { return RoutePlannerState.useGpsStart; },
  set useGpsStart(val) { RoutePlannerState.useGpsStart = val; },
  get gpsStartPending() { return RoutePlannerState.gpsStartPending; },
  get routeData() { return RoutePlannerState.routeData; },
  get isLoadingRoute() { return RoutePlannerState.isLoadingRoute; },
  get initialized() { return RoutePlannerState.initialized; },
  set initialized(val) { RoutePlannerState.initialized = val; },

  /**
   * Initialize the route planner
   */
  init() {
    if (RoutePlannerState.initialized) return;
    RoutePlannerState.initialized = true;

    // Create a dedicated layer for route visualization
    if (window.AppState && window.AppState.map) {
      RoutePlannerState.routeLayer = L.layerGroup().addTo(window.AppState.map);
    }
    if (window.AppState && typeof window.AppState.currentLocation === 'undefined') {
      window.AppState.currentLocation = null;
    }

    // Load available starting points from POIs
    RoutePlannerStops.loadAvailableStarts(RoutePlannerState);

    // Listen for POIs loaded event to update available starts
    RoutePlannerState.poisListener = () => RoutePlannerStops.loadAvailableStarts(RoutePlannerState);
    document.addEventListener('poisLoaded', RoutePlannerState.poisListener);

    // Create the persistent collapse tab (always visible)
    RoutePlannerUI.createPersistentTab(() => this.handleTabClick());
  },

  /**
   * Handle click on the persistent tab
   */
  handleTabClick() {
    if (!RoutePlannerState.isOpen) {
      this.showPanel();
    } else if (RoutePlannerState.isCollapsed) {
      this.toggleCollapse();
    } else {
      this.toggleCollapse();
    }
  },

  /**
   * Show the panel (can be called with 0 stops)
   */
  showPanel() {
    RoutePlannerState.stops = RoutePlannerStops.buildStopsFromSelection() || [];
    RoutePlannerState.isOpen = true;
    RoutePlannerState.isCollapsed = false;
    this.renderModal();
    this.drawRoute();
    this.startListeningForSelectionChanges();
  },

  /**
   * Show the route planning modal with selected jobs
   * @param {Array} jobs - Array of job objects to include in route
   */
  show(jobs) {
    let selectionStops = RoutePlannerStops.buildStopsFromSelection();
    if ((!selectionStops || selectionStops.length === 0) && Array.isArray(jobs)) {
      selectionStops = jobs
        .map(job => RoutePlannerStops.buildStopFromJob(job))
        .filter(Boolean);
    }
    if (!selectionStops || selectionStops.length === 0) {
      if (window.showNotification) {
        window.showNotification('Select at least 1 stop to plan a route', 'warning');
      }
      return;
    }

    RoutePlannerState.stops = [...selectionStops];
    RoutePlannerState.isOpen = true;
    RoutePlannerState.isCollapsed = false;
    this.renderModal();
    this.drawRoute();
    this.startListeningForSelectionChanges();
  },

  /**
   * Hide the route planning panel
   */
  hide() {
    this.stopListeningForSelectionChanges();
    RoutePlannerVisualization.clearVisualization(RoutePlannerState);
    const panel = document.getElementById('routePlannerPanel');
    if (panel) {
      panel.classList.remove('open');
      setTimeout(() => { panel.remove(); }, 300);
    }
    RoutePlannerState.reset();
    RoutePlannerUI.updateTabCount();
  },

  /**
   * Start listening for job selection changes
   */
  startListeningForSelectionChanges() {
    this.stopListeningForSelectionChanges();
    RoutePlannerState.selectionListener = () => {
      if (!RoutePlannerState.isOpen) return;
      RoutePlannerStops.syncWithSelectedJobs(
        RoutePlannerState,
        () => this.renderStopsList(),
        () => RoutePlannerUI.updateStopsHeader(RoutePlannerState),
        () => this.scheduleDrawRoute()
      );
    };
    document.addEventListener('jobSelectionChanged', RoutePlannerState.selectionListener);
  },

  /**
   * Stop listening for job selection changes
   */
  stopListeningForSelectionChanges() {
    if (RoutePlannerState.selectionListener) {
      document.removeEventListener('jobSelectionChanged', RoutePlannerState.selectionListener);
      RoutePlannerState.selectionListener = null;
    }
  },

  /**
   * Toggle panel collapsed state
   */
  toggleCollapse() {
    RoutePlannerUI.toggleCollapse(RoutePlannerState);
  },

  /**
   * Toggle round trip mode
   */
  toggleRoundTrip() {
    RoutePlannerGps.toggleRoundTrip(RoutePlannerState, () => this.drawRoute());
  },

  /**
   * Toggle whether to start from Office
   */
  toggleOfficeStart() {
    RoutePlannerGps.toggleOfficeStart(
      RoutePlannerState,
      () => RoutePlannerGps.updateStartOptionsUI(RoutePlannerState),
      () => this.scheduleDrawRoute()
    );
  },

  /**
   * Toggle whether to start from GPS location
   */
  toggleGpsStart() {
    RoutePlannerGps.toggleGpsStart(RoutePlannerState, () => this.scheduleDrawRoute());
  },

  /**
   * Debounced route redraw helper
   */
  scheduleDrawRoute() {
    if (RoutePlannerState.routeRedrawTimer) {
      clearTimeout(RoutePlannerState.routeRedrawTimer);
    }
    RoutePlannerState.routeRedrawTimer = setTimeout(() => {
      this.drawRoute();
    }, 650);
  },

  /**
   * Add a stop to the route
   * @param {Object} job - Job object to add
   */
  addStop(job) {
    RoutePlannerStops.addStop(
      job,
      RoutePlannerState,
      () => this.renderStopsList(),
      () => this.drawRoute()
    );
  },

  /**
   * Remove a stop from the route
   * @param {number} index - Index of stop to remove
   */
  removeStop(index) {
    RoutePlannerStops.removeStop(
      index,
      RoutePlannerState,
      () => this.renderStopsList(),
      () => this.scheduleDrawRoute(),
      () => this.updateSummary()
    );
  },

  /**
   * Reorder stops in the route
   * @param {number} fromIndex - Original index
   * @param {number} toIndex - New index
   */
  reorderStops(fromIndex, toIndex) {
    RoutePlannerStops.reorderStops(
      fromIndex,
      toIndex,
      RoutePlannerState,
      () => this.renderStopsList(),
      () => this.drawRoute(),
      () => this.updateSummary()
    );
  },

  /**
   * Clear all stops from the route
   */
  clearRoute() {
    RoutePlannerStops.clearRoute(
      RoutePlannerState,
      () => RoutePlannerVisualization.clearVisualization(RoutePlannerState),
      () => this.renderStopsList(),
      () => this.updateSummary()
    );
  },

  /**
   * Optimize route using nearest neighbor algorithm
   */
  optimizeRoute() {
    RoutePlannerCalculation.optimizeRoute(
      RoutePlannerState,
      (state) => RoutePlannerGps.getStartInfo(state),
      () => this.renderStopsList(),
      () => this.drawRoute(),
      () => this.updateSummary()
    );
  },

  /**
   * Calculate distance between two points
   * @returns {number} Distance in miles
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    return RoutePlannerCalculation.calculateDistance(lat1, lng1, lat2, lng2);
  },

  /**
   * Get total route distance
   * @returns {number} Total distance in miles
   */
  getTotalDistance() {
    return RoutePlannerCalculation.getTotalDistance(
      RoutePlannerState,
      (state) => RoutePlannerGps.getStartInfo(state)
    );
  },

  /**
   * Draw the route on the map
   */
  async drawRoute() {
    await RoutePlannerVisualization.drawRoute(
      RoutePlannerState,
      (state) => RoutePlannerGps.getStartInfo(state),
      () => this.getTotalDistance(),
      () => this.updateSummary()
    );
  },

  /**
   * Export route to Google Maps
   */
  exportToGoogleMaps() {
    RoutePlannerVisualization.exportToGoogleMaps(
      RoutePlannerState,
      (state) => RoutePlannerGps.getStartInfo(state)
    );
  },

  /**
   * Render the route planning side panel
   */
  renderModal() {
    RoutePlannerUI.renderModal(
      RoutePlannerState,
      () => this.initDragAndDrop()
    );
  },

  /**
   * Re-render just the stops list
   */
  renderStopsList() {
    RoutePlannerUI.renderStopsList(
      RoutePlannerState,
      () => this.initDragAndDrop(),
      () => this.updateSummary()
    );
  },

  /**
   * Update the route summary display
   */
  updateSummary() {
    RoutePlannerUI.updateSummary(
      RoutePlannerState,
      () => this.getTotalDistance()
    );
  },

  /**
   * Initialize drag and drop for reordering stops
   */
  initDragAndDrop() {
    RoutePlannerUI.initDragAndDrop((fromIndex, toIndex) => this.reorderStops(fromIndex, toIndex));
  },

  // Legacy method aliases for backward compatibility
  escapeHtml(str) {
    return RoutePlannerVisualization.escapeHtml(str);
  },

  buildStopFromJob(job) {
    return RoutePlannerStops.buildStopFromJob(job);
  },

  buildStopFromPoi(poi) {
    return RoutePlannerStops.buildStopFromPoi(poi);
  },

  buildStopsFromSelection() {
    return RoutePlannerStops.buildStopsFromSelection();
  },

  getStopKey(stop) {
    return RoutePlannerStops.getStopKey(stop);
  },

  dispatchSelectionChanged() {
    return RoutePlannerStops.dispatchSelectionChanged();
  },

  loadAvailableStarts() {
    return RoutePlannerStops.loadAvailableStarts(RoutePlannerState);
  },

  formatDuration(seconds) {
    return RoutePlannerCalculation.formatDuration(seconds);
  },

  formatShortDuration(seconds) {
    return RoutePlannerCalculation.formatShortDuration(seconds);
  },

  updateTabCount() {
    return RoutePlannerUI.updateTabCount();
  },

  updateStopsHeader() {
    return RoutePlannerUI.updateStopsHeader(RoutePlannerState);
  },

  clearVisualization() {
    return RoutePlannerVisualization.clearVisualization(RoutePlannerState);
  },

  getStartInfo() {
    return RoutePlannerGps.getStartInfo(RoutePlannerState);
  },

  getGpsStartLocation() {
    return RoutePlannerGps.getGpsStartLocation(RoutePlannerState);
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  RoutePlanner.init();
});

// Global function to center map on default start location
window.centerOnOffice = function () {
  const pois = window.AppState?.pois || [];
  const epicenter = pois.find(poi =>
    poi.name && poi.name.toLowerCase().includes('epicenter')
  );
  const start = epicenter || window.RoutePlanner?.startLocation || window.RoutePlanner?.defaultLocation;
  if (start && window.AppState?.map && Number.isFinite(start.lat) && Number.isFinite(start.lng)) {
    window.AppState.map.setView([start.lat, start.lng], 14);
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
window.getSelectedJobsArray = function () {
  if (!window.AppState || !window.AppState.selectedJobs) return [];

  return Array.from(window.AppState.selectedJobs)
    .map(jobNum => (window.AppState.allJobs || []).find(j => j.job_number === jobNum))
    .filter(Boolean);
};
