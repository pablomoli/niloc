/**
 * Route Planner UI Module
 * Handles panel rendering, stops list, summary display, and drag/drop.
 */

const RoutePlannerUI = {
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
     * Create the persistent collapse tab that's always visible on the right side
     * @param {Function} tabClickHandler - Handler for tab click
     */
    createPersistentTab(tabClickHandler) {
        // Don't create if already exists
        if (document.getElementById('routePlannerCollapseTab')) return;

        const tab = document.createElement('div');
        tab.id = 'routePlannerCollapseTab';
        tab.className = 'route-panel-collapse-tab visible';
        tab.innerHTML = `
            <i class="bi bi-signpost-split"></i>
            <span class="collapse-tab-count">0</span>
        `;
        tab.onclick = tabClickHandler;
        document.body.appendChild(tab);

        // Listen for selection changes to update the count
        document.addEventListener('jobSelectionChanged', () => this.updateTabCount());
    },

    /**
     * Update the count shown on the persistent tab
     */
    updateTabCount() {
        const tabCount = document.querySelector('#routePlannerCollapseTab .collapse-tab-count');
        if (tabCount) {
            const jobCount = window.AppState?.selectedJobs?.size || 0;
            const poiCount = window.AppState?.selectedPois?.size || 0;
            tabCount.textContent = jobCount + poiCount;
        }
    },

    /**
     * Update the stops count in the header and collapse tab
     * @param {Object} state - RoutePlannerState reference
     */
    updateStopsHeader(state) {
        const header = document.querySelector('#routePlannerPanel .stops-header-count');
        if (header) {
            header.textContent = `Stops (${state.stops.length})`;
        }
        // Also update the collapse tab count (tab is outside panel)
        const tabCount = document.querySelector('#routePlannerCollapseTab .collapse-tab-count');
        if (tabCount) {
            tabCount.textContent = state.stops.length;
        }
    },

    /**
     * Toggle panel collapsed state
     * @param {Object} state - RoutePlannerState reference
     */
    toggleCollapse(state) {
        state.isCollapsed = !state.isCollapsed;
        const panel = document.getElementById('routePlannerPanel');
        const tab = document.getElementById('routePlannerCollapseTab');
        if (panel) {
            panel.classList.toggle('collapsed', state.isCollapsed);
        }
        if (tab) {
            tab.classList.toggle('visible', state.isCollapsed);
        }
        // Update collapse button icon
        const collapseBtn = document.getElementById('routePanelCollapseBtn');
        if (collapseBtn) {
            const icon = collapseBtn.querySelector('i');
            if (icon) {
                icon.className = state.isCollapsed ? 'bi bi-chevron-left' : 'bi bi-chevron-right';
            }
        }
    },

    /**
     * Generate HTML for the stops list
     * @param {Object} state - RoutePlannerState reference
     * @returns {string} HTML string
     */
    generateStopsListHTML(state) {
        if (state.stops.length === 0) {
            return `
                <div class="text-center py-8 text-gray-400">
                    <i class="bi bi-signpost-2 text-3xl mb-2"></i>
                    <p>No stops in route</p>
                </div>
            `;
        }

        return state.stops.map((stop, index) => `
            <div class="route-stop-item flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-sm transition-shadow"
                 data-index="${index}"
                 draggable="true">
                <div class="drag-handle text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                    <i class="bi bi-grip-vertical text-lg"></i>
                </div>
                <div class="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    ${index + 1}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-900 truncate flex items-center gap-2">
                        <span>${this.escapeHtml(stop.name)}</span>
                        <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            ${stop.type === 'poi' ? 'POI' : 'JOB'}
                        </span>
                    </div>
                    <div class="text-xs text-gray-500 truncate">${this.escapeHtml(stop.address || 'No address')}</div>
                </div>
                <button class="btn btn-xs btn-ghost text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                        onclick="event.stopPropagation(); RoutePlanner.removeStop(${index})">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `).join('');
    },

    /**
     * Re-render just the stops list
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} initDragAndDropCallback - Callback to init drag/drop
     * @param {Function} updateSummaryCallback - Callback to update summary
     */
    renderStopsList(state, initDragAndDropCallback, updateSummaryCallback) {
        const container = document.getElementById('route-stops-list');
        if (container) {
            container.innerHTML = this.generateStopsListHTML(state);
            if (initDragAndDropCallback) initDragAndDropCallback();
        }
        if (updateSummaryCallback) updateSummaryCallback();
    },

    /**
     * Update the route summary display
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} getTotalDistance - Function to get total distance
     */
    updateSummary(state, getTotalDistance) {
        const summary = document.getElementById('route-summary');
        if (!summary) return;

        const formatDuration = window.RoutePlannerCalculation?.formatDuration.bind(window.RoutePlannerCalculation);

        // Show loading state
        if (state.isLoadingRoute) {
            summary.innerHTML = `
                <div class="flex items-center justify-center text-sm text-gray-500">
                    <i class="bi bi-arrow-repeat animate-spin mr-2"></i>
                    Calculating route...
                </div>
            `;
            return;
        }

        // Use API route data if available
        if (state.routeData && state.routeData.usingDrivingRoute) {
            const distanceMiles = (state.routeData.distance / 1609.34).toFixed(1);
            const duration = formatDuration ? formatDuration(state.routeData.duration) : '--';
            const tripType = state.isRoundTrip ? 'Round Trip' : 'One Way';

            summary.innerHTML = `
                <div class="space-y-2 text-sm">
                    ${state.isRoundTrip ? `
                    <div class="text-xs text-primary font-medium text-center mb-1">
                        <i class="bi bi-arrow-repeat mr-1"></i>${tripType}
                    </div>
                    ` : ''}
                    <div class="flex items-center justify-between">
                        <span class="text-gray-600">Driving Distance:</span>
                        <span class="font-semibold text-gray-900">${distanceMiles} miles</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-gray-600">Estimated Time:</span>
                        <span class="font-semibold text-gray-900">${duration}</span>
                    </div>
                </div>
            `;
        } else {
            // Fallback to straight-line estimate
            const totalDist = getTotalDistance ? getTotalDistance() : 0;
            summary.innerHTML = `
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">Estimated Distance:</span>
                    <span class="font-semibold text-gray-900">~${totalDist.toFixed(1)} miles</span>
                </div>
                ${state.routeData && !state.routeData.usingDrivingRoute ? `
                <div class="text-xs text-gray-400 mt-1">
                    <i class="bi bi-info-circle mr-1"></i>
                    Straight-line estimate (route API unavailable)
                </div>
                ` : ''}
            `;
        }
    },

    /**
     * Render the route planning side panel
     * @param {Object} state - RoutePlannerState reference
     * @param {Function} initDragAndDropCallback - Callback to init drag/drop
     */
    renderModal(state, initDragAndDropCallback) {
        // Remove existing panel if present
        const existing = document.getElementById('routePlannerPanel');
        if (existing) {
            existing.remove();
        }

        // Reset route data when opening panel
        state.routeData = null;

        // Update the persistent tab count
        this.updateStopsHeader(state);

        const startLocation = state.startLocation || state.defaultLocation;

        const panelHTML = `
            <div id="routePlannerPanel" class="route-panel">
                <!-- Panel Header -->
                <div class="route-panel-header">
                    <div class="flex items-center gap-2">
                        <button id="routePanelCollapseBtn" class="btn btn-sm btn-circle btn-ghost hover:bg-gray-100" onclick="RoutePlanner.toggleCollapse()" title="Collapse panel">
                            <i class="bi bi-chevron-right"></i>
                        </button>
                        <h3 class="font-bold text-lg text-gray-900 flex items-center gap-2">
                            <i class="bi bi-signpost-split text-primary"></i>
                            Route Planner
                        </h3>
                    </div>
                    <button class="btn btn-sm btn-circle btn-ghost hover:bg-gray-100" onclick="RoutePlanner.hide()">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <!-- Panel Body (scrollable) -->
                <div class="route-panel-body">
                    <!-- Start from Office Toggle -->
                    <div class="flex items-center justify-between mb-3 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center gap-2">
                            <i class="bi bi-building text-gray-500"></i>
                            <span class="text-sm text-gray-700">Start from Office</span>
                        </div>
                        <input type="checkbox" id="officeStartToggle" class="toggle toggle-sm toggle-primary"
                            ${state.useOfficeStart ? 'checked' : ''}
                            ${state.useGpsStart || state.gpsStartPending ? 'disabled' : ''}
                            onchange="RoutePlanner.toggleOfficeStart()" />
                    </div>

                    <!-- Start from Current Location Toggle -->
                    <div class="flex items-center justify-between mb-2 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center gap-2">
                            <i class="bi bi-geo-alt text-gray-500"></i>
                            <span class="text-sm text-gray-700">Start from Current Location</span>
                        </div>
                        <input type="checkbox" id="gpsStartToggle" class="toggle toggle-sm toggle-primary"
                            ${(state.useGpsStart || state.gpsStartPending) ? 'checked' : ''}
                            onchange="RoutePlanner.toggleGpsStart()" />
                    </div>
                    <div id="gpsStartError" class="text-xs text-red-600 mb-3" style="display: none;"></div>

                    <!-- Start Location (only shown when useOfficeStart is true) -->
                    <div id="startLocationSection" class="bg-green-50 border border-green-200 rounded-lg p-3 mb-3" style="${(state.useOfficeStart && !state.useGpsStart && !state.gpsStartPending) ? '' : 'display: none;'}">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
                                <i class="bi bi-flag-fill text-base"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Start From</div>
                                <div class="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                                    <i class="bi ${this.escapeHtml(startLocation.icon || 'bi-building')} text-green-600"></i>
                                    ${this.escapeHtml(startLocation.name)}
                                </div>
                                <div class="text-xs text-gray-500 truncate">${this.escapeHtml(startLocation.address || '')}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Stops Header -->
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-semibold text-gray-600 uppercase tracking-wide stops-header-count">
                            Stops (${state.stops.length})
                        </h4>
                        <button class="btn btn-xs btn-ghost text-red-500 hover:bg-red-50" onclick="RoutePlanner.clearRoute()">
                            <i class="bi bi-trash mr-1"></i> Clear
                        </button>
                    </div>

                    <!-- Stops List -->
                    <div id="route-stops-list" class="space-y-2 mb-4">
                        ${this.generateStopsListHTML(state)}
                    </div>

                    <!-- Route Summary -->
                    <div id="route-summary" class="bg-gray-50 rounded-lg p-3">
                        <div class="flex items-center justify-center text-sm text-gray-500">
                            <i class="bi bi-arrow-repeat animate-spin mr-2"></i>
                            Calculating route...
                        </div>
                    </div>

                    <!-- Round Trip Toggle -->
                    <div class="flex items-center justify-between mt-3 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center gap-2">
                            <i class="bi bi-arrow-repeat text-gray-500"></i>
                            <span class="text-sm text-gray-700">Round trip</span>
                        </div>
                        <input type="checkbox" id="roundTripToggle" class="toggle toggle-sm toggle-primary"
                            ${state.isRoundTrip ? 'checked' : ''}
                            onchange="RoutePlanner.toggleRoundTrip()" />
                    </div>
                </div>

                <!-- Panel Footer (sticky actions) -->
                <div class="route-panel-footer">
                    <button class="btn btn-outline btn-sm flex-1" onclick="RoutePlanner.optimizeRoute()">
                        <i class="bi bi-lightning mr-1"></i> Optimize
                    </button>
                    <button class="btn btn-primary btn-sm flex-1" onclick="RoutePlanner.exportToGoogleMaps()">
                        <i class="bi bi-google mr-1"></i> Open in Maps
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', panelHTML);

        // Update start options UI
        if (window.RoutePlannerGps) {
            window.RoutePlannerGps.updateStartOptionsUI(state);
        }

        // Trigger slide-in animation
        requestAnimationFrame(() => {
            const panel = document.getElementById('routePlannerPanel');
            if (panel) panel.classList.add('open');
        });

        // Initialize drag and drop
        if (initDragAndDropCallback) initDragAndDropCallback();
    },

    /**
     * Initialize drag and drop for reordering stops
     * @param {Function} reorderCallback - Callback when stops are reordered
     */
    initDragAndDrop(reorderCallback) {
        const container = document.getElementById('route-stops-list');
        if (!container) return;

        const items = container.querySelectorAll('.route-stop-item');
        let draggedItem = null;
        let draggedIndex = -1;

        items.forEach((item, index) => {
            // Desktop drag events
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                draggedIndex = index;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
            });

            item.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('dragging');
                }
                draggedItem = null;
                draggedIndex = -1;

                // Remove all drop indicators
                container.querySelectorAll('.route-stop-item').forEach(el => {
                    el.classList.remove('drop-above', 'drop-below');
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                if (!draggedItem || draggedItem === item) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                // Show drop indicator
                container.querySelectorAll('.route-stop-item').forEach(el => {
                    el.classList.remove('drop-above', 'drop-below');
                });

                if (e.clientY < midY) {
                    item.classList.add('drop-above');
                } else {
                    item.classList.add('drop-below');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drop-above', 'drop-below');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();

                if (!draggedItem || draggedItem === item) return;

                const fromIndex = draggedIndex;
                let toIndex = parseInt(item.dataset.index);

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (e.clientY > midY && toIndex < fromIndex) {
                    toIndex++;
                } else if (e.clientY < midY && toIndex > fromIndex) {
                    toIndex--;
                }

                if (reorderCallback) reorderCallback(fromIndex, toIndex);
            });
        });

        // Touch support for mobile
        this.initTouchDragAndDrop(container, reorderCallback);
    },

    /**
     * Initialize touch-based drag and drop for mobile
     * @param {HTMLElement} container - Container element
     * @param {Function} reorderCallback - Callback when stops are reordered
     */
    initTouchDragAndDrop(container, reorderCallback) {
        let touchedItem = null;
        let touchStartY = 0;
        let initialTop = 0;
        let placeholder = null;
        let items = [];

        container.addEventListener('touchstart', (e) => {
            const handle = e.target.closest('.drag-handle');
            if (!handle) return;

            touchedItem = handle.closest('.route-stop-item');
            if (!touchedItem) return;

            touchStartY = e.touches[0].clientY;
            initialTop = touchedItem.offsetTop;

            touchedItem.classList.add('dragging');

            // Create placeholder
            placeholder = document.createElement('div');
            placeholder.className = 'route-stop-placeholder';
            placeholder.style.height = touchedItem.offsetHeight + 'px';

            items = Array.from(container.querySelectorAll('.route-stop-item:not(.dragging)'));
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!touchedItem) return;
            e.preventDefault();

            const currentY = e.touches[0].clientY;
            const deltaY = currentY - touchStartY;

            // Move the touched item visually
            touchedItem.style.transform = `translateY(${deltaY}px)`;
            touchedItem.style.zIndex = '100';

            // Find insertion point
            for (const item of items) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (currentY < midY) {
                    if (placeholder.nextSibling !== item) {
                        container.insertBefore(placeholder, item);
                    }
                    return;
                }
            }

            // If past all items, append at end
            if (items.length > 0) {
                const lastItem = items[items.length - 1];
                if (placeholder !== lastItem.nextSibling) {
                    container.insertBefore(placeholder, lastItem.nextSibling);
                }
            }
        }, { passive: false });

        container.addEventListener('touchend', () => {
            if (!touchedItem) return;

            const fromIndex = parseInt(touchedItem.dataset.index);

            // Determine new index based on placeholder position
            let toIndex = 0;
            const allItems = container.querySelectorAll('.route-stop-item, .route-stop-placeholder');
            allItems.forEach((item, idx) => {
                if (item === placeholder) {
                    toIndex = idx;
                }
            });

            // Clean up
            touchedItem.classList.remove('dragging');
            touchedItem.style.transform = '';
            touchedItem.style.zIndex = '';

            if (placeholder && placeholder.parentNode) {
                placeholder.remove();
            }

            // Perform reorder if positions changed
            if (fromIndex !== toIndex) {
                // Account for the placeholder taking a slot
                if (toIndex > fromIndex) toIndex--;
                if (reorderCallback) reorderCallback(fromIndex, toIndex);
            }

            touchedItem = null;
            placeholder = null;
        }, { passive: true });
    }
};

window.RoutePlannerUI = RoutePlannerUI;
