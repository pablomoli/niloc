/**
 * Route Planner State Module
 * Centralized state management for the route planner.
 */

const RoutePlannerState = {
    // Default fallback location (used if no POIs are available)
    defaultLocation: {
        lat: 28.5039192,
        lng: -81.0773325,
        name: "Office",
        address: "20306 Nettleton St, Orlando, FL"
    },

    // Runtime state
    startLocation: null,      // Current starting point (POI object or default)
    availableStarts: [],      // Cached POIs (used to resolve default start)
    stops: [],                // Ordered array of stop objects
    routeLayer: null,         // Leaflet layer group for route visualization
    isOpen: false,            // Panel visibility state
    isCollapsed: false,       // Panel collapsed state
    isRoundTrip: false,       // Include return to start
    useOfficeStart: true,     // Whether to start from Office POI (true) or first job (false)
    useGpsStart: false,       // Whether to start from current GPS location
    gpsStartPending: false,   // GPS location request in flight
    previousOfficeStart: null,// Store office toggle state when GPS is enabled
    gpsRequestId: 0,          // Incremental id to ignore stale GPS responses
    routeData: null,          // Cached route data from API (distance, duration, geometry)
    isLoadingRoute: false,    // Loading state for API calls
    selectionListener: null,  // Event listener reference for cleanup
    poisListener: null,       // POI loaded event listener
    routeRedrawTimer: null,   // Debounced route redraw timer
    initialized: false,       // Guard against double init

    /**
     * Reset runtime state to defaults (called when hiding panel)
     */
    reset() {
        this.isOpen = false;
        this.isCollapsed = false;
        this.isRoundTrip = false;
        this.useOfficeStart = true;
        this.useGpsStart = false;
        this.gpsStartPending = false;
        this.previousOfficeStart = null;
        this.stops = [];
        if (this.routeRedrawTimer) {
            clearTimeout(this.routeRedrawTimer);
            this.routeRedrawTimer = null;
        }
    }
};

window.RoutePlannerState = RoutePlannerState;
