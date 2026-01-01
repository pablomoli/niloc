# JavaScript Architecture

This document describes the modular JavaScript architecture used in Epic Map.

## Overview

The frontend JavaScript is organized into focused modules using a **traditional script loading pattern** (not ES6 modules). Each module exposes its functionality via `window.*` globals, allowing flexible loading order and easy debugging.

## Module Pattern

All modules follow this pattern:

```javascript
/**
 * Module Name
 * Brief description of what this module does.
 */

// Private state (module-scoped)
let _privateVar = null;

// Public API attached to window or a namespace object
window.ModuleName = {
    property: 'value',

    method: function() {
        // Implementation
    }
};

// Or extending an existing namespace:
SimpleModal.methodName = function() {
    // Implementation
};
```

## Directory Structure

```
static/js/
├── admin/                  # Admin dashboard modules
│   ├── app.js              # Main Alpine.js adminApp component
│   ├── utils.js            # Utility functions (formatting, helpers)
│   ├── poi-icon-picker.js  # POI icon picker Alpine component
│   └── notifications.js    # Toast notification Alpine store
│
├── map/                    # Map interface modules
│   ├── state.js            # Global state (AppState, MapViewState)
│   ├── notifications.js    # Toast notification system
│   ├── location.js         # User geolocation handling
│   ├── layers.js           # Map base layers and overlays
│   ├── markers.js          # Job marker creation and clustering
│   ├── pois.js             # POI loading and rendering
│   ├── selection.js        # Multi-select job management
│   └── filters.js          # Job filtering and search
│
├── modal/                  # Job detail modal modules
│   ├── state.js            # Modal state (SimpleModal, TagCache)
│   ├── utils.js            # Formatting and helper functions
│   ├── field-editing.js    # Inline field editing
│   ├── tags.js             # Tag management UI
│   ├── fieldwork.js        # Time tracking CRUD
│   ├── promotion.js        # Job promotion (parcel to address)
│   └── render.js           # Modal HTML rendering
│
├── route-planner/          # Route planning modules
│   ├── state.js            # Route planner state management
│   ├── stops.js            # Stop management (add, remove, reorder)
│   ├── gps.js              # GPS tracking and navigation
│   ├── calculation.js      # Route optimization algorithms
│   ├── visualization.js    # Map polylines and markers
│   └── ui.js               # Panel UI and interactions
│
├── jobs/                   # Job-related utilities
│   └── parcel-geocoding.js # Parcel lookup for job creation
│
├── map.js                  # Main map entry point
├── simple-modal.js         # Modal documentation entry point
├── route-planner.js        # Route planner entry point
├── fab-menu.js             # Floating action button menu
├── create-job-modal.js     # Job creation modal
├── marker-utils.js         # Marker styling utilities
└── cached-fetch.js         # API response caching
```

## Module Dependencies

### Map Interface (`templates/map.html`)

Load order matters. Scripts are loaded in this sequence:

```
1. Third-party libraries (Leaflet, Alpine.js)
2. Utility modules (cached-fetch.js, marker-utils.js)
3. Map modules (state -> notifications -> location -> layers -> markers -> pois -> selection -> filters)
4. Modal modules (state -> utils -> field-editing -> tags -> fieldwork -> promotion -> render)
5. Route planner modules (state -> stops -> gps -> calculation -> visualization -> ui)
6. Entry points (map.js, route-planner.js)
7. UI modules (fab-menu.js, create-job-modal.js)
```

### Admin Dashboard (`templates/admin_spa.html`)

```
1. Third-party libraries (Alpine.js)
2. Admin modules (utils.js, poi-icon-picker.js, notifications.js)
3. Shared modules (parcel-geocoding.js, create-job-modal.js)
4. Main app (app.js)
5. Alpine.data registration
```

## Key Global Objects

### `window.AppState`
Central state for the map interface. Contains:
- `allJobs` - Array of all loaded jobs
- `map` - Leaflet map instance
- `markers` - Marker cluster group
- `currentFilters` - Active filter state

### `window.SimpleModal`
Job detail modal controller. Methods include:
- `open(jobNumber)` - Open modal for a job
- `close()` - Close the modal
- `renderModal(job, femaLink)` - Render modal content

### `window.RoutePlanner`
Route planning controller. Methods include:
- `init()` - Initialize the route planner
- `addStop(job)` - Add a job to the route
- `calculateRoute()` - Optimize the route

### `window.MapViewState`
Persisted map view state (localStorage). Properties:
- `center` - Map center coordinates
- `zoom` - Zoom level
- `activeFilters` - Persisted filter state

### `window.adminAppComponent`
Alpine.js component factory for the admin dashboard.

## Communication Patterns

### Event Dispatching
Modules communicate via custom DOM events:

```javascript
// Dispatch
document.dispatchEvent(new CustomEvent('jobCreated', {
    detail: { job: newJob }
}));

// Listen
document.addEventListener('jobCreated', (e) => {
    console.log('New job:', e.detail.job);
});
```

### Callback Pattern
Some modules accept callbacks for inter-module communication:

```javascript
// In filters.js
window.JobFilters = {
    onFilterChange: null,  // Set by map.js

    applyFilters: function() {
        // ... filter logic
        if (this.onFilterChange) {
            this.onFilterChange(filteredJobs);
        }
    }
};

// In map.js
window.JobFilters.onFilterChange = function(jobs) {
    updateMarkers(jobs);
};
```

### Direct Method Calls
For tightly coupled modules, direct calls are acceptable:

```javascript
// In fieldwork.js
SimpleModal.showNotification('Entry saved', 'success');
```

## Adding New Modules

1. **Create the module file** in the appropriate directory
2. **Follow the module pattern** (see above)
3. **Add script tag** to the relevant template in correct load order
4. **Update this README** with the new module
5. **Document public API** with JSDoc comments

Example new module:

```javascript
/**
 * Map Bookmarks Module
 * Save and restore map locations.
 */

window.MapBookmarks = {
    bookmarks: [],

    /**
     * Save current map view as a bookmark.
     * @param {string} name - Bookmark name
     */
    save: function(name) {
        const center = window.AppState.map.getCenter();
        const zoom = window.AppState.map.getZoom();
        this.bookmarks.push({ name, center, zoom });
        this._persist();
    },

    /**
     * Restore a saved bookmark.
     * @param {number} index - Bookmark index
     */
    restore: function(index) {
        const bookmark = this.bookmarks[index];
        if (bookmark) {
            window.AppState.map.setView(bookmark.center, bookmark.zoom);
        }
    },

    _persist: function() {
        localStorage.setItem('map_bookmarks', JSON.stringify(this.bookmarks));
    }
};
```

## State Management

### Local State
Module-scoped variables for internal state:

```javascript
let _isLoading = false;
let _cache = new Map();
```

### Shared State
Use `window.AppState` for cross-module state:

```javascript
// Read
const jobs = window.AppState.allJobs;

// Write
window.AppState.selectedJobs = new Set();
```

### Persisted State
Use localStorage for state that survives page reloads:

```javascript
// Save
localStorage.setItem('key', JSON.stringify(value));

// Load
const value = JSON.parse(localStorage.getItem('key') || '{}');
```

## Alpine.js Integration

### Admin Dashboard
The admin uses Alpine.js for reactive UI. The main component is defined in `app.js`:

```javascript
window.adminAppComponent = function() {
    return {
        // Reactive data
        jobs: [],
        activeTab: 'dashboard',

        // Lifecycle
        init() {
            this.loadJobs();
        },

        // Methods
        async loadJobs() {
            // ...
        }
    };
};
```

Registered in the template:
```javascript
Alpine.data("adminApp", window.adminAppComponent);
```

### Alpine Stores
Shared state across components uses Alpine stores:

```javascript
// Define (in notifications.js)
Alpine.store('notifications', {
    items: [],
    add(message, type) { /* ... */ }
});

// Use (anywhere)
Alpine.store('notifications').add('Saved!', 'success');
```

## Testing Modules

Each module can be tested in the browser console:

```javascript
// Test marker creation
window.JobMarkers.createMarker({ job_number: 'TEST-001', lat: 28.5, long: -81.3 });

// Test filtering
window.JobFilters.applyStatusFilter(['Needs Fieldwork']);

// Test notifications
window.showNotification('Test message', 'success');
```

## Performance Considerations

1. **Debounce frequent operations** (search input, filter changes)
2. **Use marker clustering** for large job sets
3. **Lazy load data** per tab in admin dashboard
4. **Cache API responses** via `cached-fetch.js`

## Troubleshooting

### Module not found
Check script load order in the template. Dependencies must load first.

### State not updating
Verify you're modifying `window.AppState` directly, not a local copy.

### Events not firing
Ensure event listeners are registered before events are dispatched.

### Alpine reactivity issues
Use `this.$nextTick()` for DOM updates after state changes.
