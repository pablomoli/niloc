/**
 * FAB Menu Component for Epic Map
 * Handles the floating action button with arc menu pattern
 */

// localStorage keys for persisting filter preferences (defined in map.js, referenced here)
// Uses window globals to avoid redeclaration when both scripts are loaded

/**
 * Create the Alpine.js FAB menu component that manages FAB state, enhanced search, filters, map layer controls, and route-planning helpers for the Epic Map UI.
 *
 * The returned object contains reactive properties (menu and sub-menu flags, search inputs, filter selections, layer state, tag/status lists, and selected job count) and methods to operate on them (initialization, tag/status toggles, search actions, layer controls, and route planner integration). The `selectedJobCount` includes both selected jobs and POIs and is kept in sync via events and polling.
 *
 * @returns {Object} An Alpine.js component object exposing state and methods for the FAB menu UI, enhanced search, filters, map layer controls, and route-planning actions.
 */
function fabMenu() {
    return {
        menuOpen: false,
        searchOpen: false,
        statusOpen: false,
        layerOpen: false,
        
        // Enhanced Search Properties
        searchTab: 'address',
        addressSearch: '',
        parcelSearch: '',
        clientSearch: '',
        clientSearchTimer: null,
        selectedCounty: '',
        brevardSearchType: 'tax-account',
        clientSuggestions: [],
        
        // Filter Tab
        filterTab: 'status',
        
        // Existing properties
        availableStatuses: [],
        selectedStatuses: new Set(['all']), // Local reactive state for UI
        availableTags: [],
        selectedTags: new Set(), // Local reactive state for tag filters
        tagsLoaded: false,
        tagsLoadingPromise: null,
        currentBaseLayer: 'satellite',
        countiesVisible: false,
        poisVisible: true, // POI visibility toggle (default: visible)
        useClustering: true,
        clusteringSupported: true,
        selectedJobCount: 0, // Track selected jobs for route planning button (includes POIs)
        routePlannerPrefetched: false,

        init() {
            // Update selected job count periodically and on events (includes both jobs and POIs)
            const updateSelectedCount = () => {
                const jobCount = window.AppState?.selectedJobs?.size || 0;
                const poiCount = window.AppState?.selectedPois?.size || 0;
                const total = jobCount + poiCount;
                this.selectedJobCount = total;

                // Preload route planner after the user has something selected.
                if (total > 0) {
                    this.prefetchRoutePlanner();
                }
            };

            // Initial update
            updateSelectedCount();

            // Listen for selection changes
            document.addEventListener('jobSelectionChanged', updateSelectedCount);

            // Also poll periodically as fallback (every 500ms)
            setInterval(updateSelectedCount, 500);
            // Store reference to this component for event handlers
            const self = this;

            // Filters are initialized in map.js which loads first
            // Just sync local state with global state here
            if (!window.activeStatusFilters) {
                window.activeStatusFilters = new Set(['Needs Fieldwork']);
            }
            if (!window.activeTagFilters) {
                window.activeTagFilters = new Set();
            }

            // Sync local reactive state with global state
            this.selectedStatuses = new Set(window.activeStatusFilters);
            this.selectedTags = new Set(window.activeTagFilters);
            
            // Sync map layer state
            this.clusteringSupported = typeof window.isMarkerClusteringSupported === 'function'
                ? window.isMarkerClusteringSupported()
                : (typeof L !== 'undefined' && typeof L.markerClusterGroup === 'function');
            this.useClustering = window.AppState?.useClustering ?? this.useClustering;

            // Load POI visibility preference from localStorage
            try {
                const storedPoisVisible = localStorage.getItem('epicmap_pois_visible');
                if (storedPoisVisible !== null) {
                    this.poisVisible = storedPoisVisible === 'true';
                }
            } catch (e) {
                console.warn('Failed to load POI visibility preference:', e);
            }

            // Apply initial POI visibility state
            if (window.setPoisVisible) {
                window.setPoisVisible(this.poisVisible);
            }

            // Get available statuses from jobs
            this.updateAvailableStatuses();
            
            // Listen for jobs loaded event to update statuses
            document.addEventListener('jobsLoaded', () => {
                self.updateAvailableStatuses();
            });
        },
        
        async ensureTagsLoaded() {
            if (this.tagsLoaded && this.availableTags.length > 0) return this.availableTags;
            if (this.tagsLoadingPromise) return this.tagsLoadingPromise;

            this.tagsLoadingPromise = (async () => {
                try {
                    if (window.TagCache && typeof window.TagCache.loadOnce === 'function') {
                        const tags = await window.TagCache.loadOnce();
                        this.availableTags = Array.isArray(tags) ? tags : [];
                    } else {
                        const response = await fetch('/api/tags');
                        if (response.ok) {
                            const tags = await response.json();
                            this.availableTags = Array.isArray(tags) ? tags : [];
                        } else {
                            this.availableTags = [];
                        }
                    }
                } catch (error) {
                    console.error('Failed to load tags:', error);
                    this.availableTags = [];
                } finally {
                    this.tagsLoaded = true;
                    this.tagsLoadingPromise = null;
                }
                return this.availableTags;
            })();

            return this.tagsLoadingPromise;
        },

        switchToTags() {
            this.filterTab = 'tags';
            this.ensureTagsLoaded();
        },
        
        updateAvailableStatuses() {
            if (window.AppState && window.AppState.allJobs && window.AppState.allJobs.length > 0) {
                const newStatuses = [...new Set(window.AppState.allJobs
                    .map(job => job.status)
                    .filter(Boolean))];
                
                // Force Alpine reactivity by replacing the array
                this.availableStatuses.splice(0, this.availableStatuses.length, ...newStatuses);
            }
        },
        
        toggleMenu() {
            this.menuOpen = !this.menuOpen;
            if (!this.menuOpen) {
                this.searchOpen = false;
                this.statusOpen = false;
                this.layerOpen = false;
            }
        },
        
        // Enhanced Search Methods
        openAdvancedSearch() {
            this.searchOpen = true;
            this.menuOpen = false;
            this.searchTab = 'address'; // Default to address tab
            this.$nextTick(() => {
                this.$refs.searchInput?.focus();
            });
            this.ensureTagsLoaded();
        },
        
        closeAdvancedSearch() {
            this.searchOpen = false;
            this.addressSearch = '';
            this.parcelSearch = '';
            this.clientSearch = '';
            this.selectedCounty = '';
            this.clientSuggestions = [];
        },
        
        clearClientFilter() {
            // Clear any active client filter and show all jobs
            window.activeClientFilter = null;
            
            if (window.clearAllFilters) {
                window.clearAllFilters();
            } else if (window.loadAllJobs) {
                window.loadAllJobs();
            } else if (window.AppState?.allJobs) {
                // Fallback: reload all job markers
                if (window.clearAllMarkers) {
                    window.clearAllMarkers();
                }
                
                if (window.addJobMarkers) {
                    window.addJobMarkers(window.AppState.allJobs);
                } else if (window.loadJobMarkers) {
                    window.loadJobMarkers(window.AppState.allJobs);
                }
            }
            
            if (window.showNotification) {
                window.showNotification('Showing all jobs', 'info');
            }
        },
        
        updateParcelFields() {
            this.parcelSearch = '';
            if (this.selectedCounty === 'brevard') {
                this.brevardSearchType = 'tax-account';
            }
        },
        
        // Legacy methods for backward compatibility
        openSearch() {
            this.openAdvancedSearch();
        },
        
        closeSearch() {
            this.closeAdvancedSearch();
        },
        
        performAddressSearch() {
            if (this.addressSearch.trim()) {
                window.searchAddress(this.addressSearch);
                this.closeAdvancedSearch();
            }
        },
        
        async performParcelSearch() {
            if (this.selectedCounty && this.parcelSearch.trim()) {
                try {
                    let response;
                    const value = this.parcelSearch.trim();

                    if (this.selectedCounty === 'brevard') {
                        response = await fetch(`/api/geocode/brevard-parcel?tax_account=${encodeURIComponent(value)}`);
                    } else if (this.selectedCounty === 'orange') {
                        response = await fetch(`/api/geocode/orange-parcel?parcel_id=${encodeURIComponent(value)}`);
                    }

                    if (!response?.ok) {
                        const error = await response.json().catch(() => ({}));
                        throw new Error(error.error || 'Parcel not found');
                    }

                    const result = await response.json();

                    if (window.showParcelSearchResult) {
                        window.showParcelSearchResult(result, this.selectedCounty);
                    } else {
                        const lat = result.lat || result.latitude;
                        const lng = result.lng || result.longitude || result.lon;
                        const address = result.address || result.formatted_address || 'Parcel Location';

                        const map = window.AppState?.map || window.map;
                        if (lat && lng && map && typeof map.setView === 'function') {
                            map.setView([lat, lng], 18);
                            if (window.searchMarker && typeof map.removeLayer === 'function') map.removeLayer(window.searchMarker);
                            window.searchMarker = L.marker([lat, lng], {
                                icon: L.divIcon({
                                    className: 'parcel-search-marker',
                                    html: `<div class="pulse-marker"><div class="pulse-marker-dot"></div></div>`,
                                    iconSize: [30, 30],
                                    iconAnchor: [15, 15]
                                })
                            }).addTo(map);
                            const safeAddress = String(address).replace(/'/g, "\\'");
                            const popupContent = `
                                <div class="parcel-popup" style="min-width:220px;">
                                    <h5>${this.selectedCounty === 'brevard' ? 'Brevard' : 'Orange'} County Parcel</h5>
                                    <p><strong>${this.selectedCounty === 'brevard' ? 'Tax Account' : 'Parcel ID'}:</strong> ${value}</p>
                                    <div style="margin-top:10px; text-align:center;">
                                        <button class="btn btn-primary btn-sm" onclick="createJobFromParcel('${this.selectedCounty}', '${value}', ${lat}, ${lng}, '${safeAddress}')">
                                            <i class="bi bi-plus-circle"></i> Create Job Here
                                        </button>
                                    </div>
                                </div>
                            `;
                            window.searchMarker.bindPopup(popupContent).openPopup();
                        }
                    }

                    this.closeAdvancedSearch();
                } catch (error) {
                    console.error('Parcel search error:', error);
                    if (window.showNotification) {
                        window.showNotification(error.message || 'Failed to search parcel', 'error');
                    }
                }
            }
        },
        
        async searchClients() {
            // Debounce to reduce network chatter
            if (this.clientSearchTimer) clearTimeout(this.clientSearchTimer);
            const term = (this.clientSearch || '').trim();
            if (term.length < 2) {
                this.clientSuggestions = [];
                return;
            }
            this.clientSearchTimer = setTimeout(async () => {
                try {
                    // Cancel any in-flight request
                    if (this._clientSearchAbort) this._clientSearchAbort.abort();
                    this._clientSearchAbort = new AbortController();
                    const resp = await fetch(`/api/jobs/search/autocomplete?q=${encodeURIComponent(term)}&limit=8`, { signal: this._clientSearchAbort.signal });
                    const data = await resp.json();
                    // Prefer server suggestions for clients, fall back to local if empty
                    let suggestions = (data.suggestions || [])
                        .filter(s => s.type === 'client')
                        .map(s => s.value);
                    if (suggestions.length === 0 && window.AppState?.allJobs) {
                        const searchTerm = term.toLowerCase();
                        suggestions = [...new Set(
                            window.AppState.allJobs
                                .map(j => j.client)
                                .filter(c => c && c.toLowerCase().includes(searchTerm))
                        )];
                    }
                    // Dedupe and trim list
                    const unique = [];
                    for (const c of suggestions) if (c && !unique.includes(c)) unique.push(c);
                    this.clientSuggestions = unique.slice(0, 8);
                } catch (error) {
                    console.error('Error searching clients:', error);
                    this.clientSuggestions = [];
                }
            }, 300);
        },
        
        selectClient(client) {
            this.clientSearch = client;
            this.clientSuggestions = [];
        },
        
        performClientSearch() {
            if (this.clientSearch.trim()) {
                const searchTerm = this.clientSearch.trim();
                console.log(`Performing client search for: ${searchTerm}`);
                
                if (window.searchByClient) {
                    window.searchByClient(searchTerm);
                } else if (window.AppState?.allJobs) {
                    // Filter jobs by client - this acts as a filter, not single job focus
                    const clientJobs = window.AppState.allJobs.filter(job => 
                        job.client && job.client.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                    
                    console.log(`Found ${clientJobs.length} jobs for client: ${searchTerm}`);
                    
                    if (clientJobs.length > 0) {
                        // Apply client filter to show only these jobs
                        if (window.filterJobsByClient) {
                            window.filterJobsByClient(searchTerm);
                        } else if (window.applyJobFilter) {
                            // Use generic job filter
                            window.applyJobFilter(clientJobs);
                        } else {
                            // Fallback: Store client filter globally and trigger map update
                            window.activeClientFilter = searchTerm;
                            
                            // Clear existing markers and show only client jobs
                            if (window.clearAllMarkers) {
                                window.clearAllMarkers();
                            }
                            
                            // Add markers for client jobs only
                            if (window.addJobMarkers) {
                                window.addJobMarkers(clientJobs);
                            } else if (window.loadJobMarkers) {
                                window.loadJobMarkers(clientJobs);
                            }
                            
                            // Focus map on first job
                            const firstJob = clientJobs[0];
                            if (firstJob.latitude && firstJob.longitude && window.AppState?.map) {
                                window.AppState.map.setView([firstJob.latitude, firstJob.longitude], 18);
                            }
                        }
                        
                        // Show success notification
                        if (window.showNotification) {
                            window.showNotification(`Filtered to ${clientJobs.length} job(s) for ${searchTerm}`, 'success');
                        } else {
                            console.log(`Client filter applied: ${clientJobs.length} jobs shown for ${searchTerm}`);
                        }
                    } else {
                        // Show no results notification
                        if (window.showNotification) {
                            window.showNotification(`No jobs found for client: ${searchTerm}`, 'warning');
                        } else {
                            console.log(`No jobs found for client: ${searchTerm}`);
                        }
                    }
                }
                this.closeAdvancedSearch();
            }
        },
        
        openCreateJob() {
            this.menuOpen = false;
            // Open create job modal with empty address
            window.CreateJobModal.show(null, null, '');
        },
        
        openStatusFilter() {
            // Refresh available statuses when opening the filter
            this.updateAvailableStatuses();

            // Re-sync local state with global state to ensure UI reflects current filters
            if (window.activeStatusFilters) {
                this.selectedStatuses = new Set(window.activeStatusFilters);
            }
            if (window.activeTagFilters) {
                this.selectedTags = new Set(window.activeTagFilters);
            }

            // Pre-load tags for the tags tab
            this.ensureTagsLoaded();

            this.statusOpen = true;
            this.menuOpen = false;
        },
        
        closeStatusFilter() {
            this.statusOpen = false;
        },
        
        openLayerControl() {
            // Sync layer state from global AppState
            if (window.AppState) {
                this.currentBaseLayer = window.AppState.currentBaseLayer;
                this.countiesVisible = window.AppState.countiesVisible;
                this.poisVisible = window.AppState.poisVisible;
                this.useClustering = window.AppState.useClustering;
            }
            this.clusteringSupported = typeof window.isMarkerClusteringSupported === 'function'
                ? window.isMarkerClusteringSupported()
                : (typeof L !== 'undefined' && typeof L.markerClusterGroup === 'function');
            this.layerOpen = true;
            this.menuOpen = false;
        },
        
        closeLayerControl() {
            this.layerOpen = false;
        },
        
        switchToBaseLayer(layerName) {
            if (window.switchBaseLayer) {
                window.switchBaseLayer(layerName);
                this.currentBaseLayer = layerName;
            }
        },
        
        toggleCountiesLayer() {
            if (window.toggleCounties) {
                const result = window.toggleCounties();
                const syncState = () => {
                    this.countiesVisible = !!(window.AppState && window.AppState.countiesVisible);
                };
                if (result && typeof result.then === 'function') {
                    result.then(syncState).catch(syncState);
                } else {
                    syncState();
                }
            }
        },

        togglePoisLayer() {
            this.poisVisible = !this.poisVisible;

            // Save preference to localStorage
            try {
                localStorage.setItem('epicmap_pois_visible', this.poisVisible.toString());
            } catch (e) {
                console.warn('Failed to save POI visibility preference:', e);
            }

            // Apply visibility change
            if (window.setPoisVisible) {
                window.setPoisVisible(this.poisVisible);
            }
        },

        toggleClusteringMode() {
            if (!this.clusteringSupported) {
                if (window.showNotification) {
                    window.showNotification('Marker grouping is unavailable in this environment', 'warning');
                }
                return;
            }
            
            const desiredState = !this.useClustering;
            if (typeof window.setMarkerClusteringEnabled === 'function') {
                const actualState = window.setMarkerClusteringEnabled(desiredState);
                this.useClustering = actualState;
            } else {
                this.useClustering = desiredState;
            }
        },
        
        toggleStatus(status) {
            // Sync local reactive state with global state
            if (!window.activeStatusFilters) {
                window.activeStatusFilters = new Set(['all']);
            }
            
            if (status === 'all') {
                // Clear all and set to 'all'
                window.activeStatusFilters.clear();
                window.activeStatusFilters.add('all');
                this.selectedStatuses.clear();
                this.selectedStatuses.add('all');
            } else {
                // Remove 'all' and toggle the specific status
                window.activeStatusFilters.delete('all');
                this.selectedStatuses.delete('all');
                
                if (window.activeStatusFilters.has(status)) {
                    window.activeStatusFilters.delete(status);
                    this.selectedStatuses.delete(status);
                } else {
                    window.activeStatusFilters.add(status);
                    this.selectedStatuses.add(status);
                }
                
                // If no statuses selected, default back to 'all'
                if (window.activeStatusFilters.size === 0) {
                    window.activeStatusFilters.add('all');
                    this.selectedStatuses.add('all');
                }
            }
        },
        
        clearAllStatuses() {
            if (!window.activeStatusFilters) {
                window.activeStatusFilters = new Set(['all']);
            }
            window.activeStatusFilters.clear();
            window.activeStatusFilters.add('all');
            this.selectedStatuses.clear();
            this.selectedStatuses.add('all');
        },
        
        applyStatusFilter() {
            // Apply the filter to the map using the global state
            if (!window.activeStatusFilters) {
                window.activeStatusFilters = new Set(['all']);
            }
            // Sync tag filters
            if (!window.activeTagFilters) {
                window.activeTagFilters = new Set();
            }
            window.activeTagFilters = new Set(this.selectedTags);

            // Save filters to localStorage for persistence
            try {
                localStorage.setItem('epicmap_status_filters', JSON.stringify(Array.from(window.activeStatusFilters)));
                localStorage.setItem('epicmap_tag_filters', JSON.stringify(Array.from(this.selectedTags)));
            } catch (e) {
                console.warn('Failed to save filters to localStorage:', e);
            }

            window.applyStatusFilter(Array.from(window.activeStatusFilters));
            this.closeStatusFilter();
        },
        
        toggleTag(tagId) {
            if (!window.activeTagFilters) {
                window.activeTagFilters = new Set();
            }
            
            if (this.selectedTags.has(tagId)) {
                this.selectedTags.delete(tagId);
                window.activeTagFilters.delete(tagId);
            } else {
                this.selectedTags.add(tagId);
                window.activeTagFilters.add(tagId);
            }
        },
        
        clearAllTags() {
            this.selectedTags.clear();
            if (window.activeTagFilters) {
                window.activeTagFilters.clear();
            }
        },
        
        isTagActive(tagId) {
            return this.selectedTags.has(tagId);
        },
        
        getTagTextColor(tagColor) {
            // Determine if text should be black or white based on background color brightness
            if (!tagColor) return 'tag-text-dark';
            const hex = tagColor.replace("#", "");
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            // Calculate relative luminance
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness > 155 ? 'tag-text-dark' : 'tag-text-light';
        },
        
        getStatusColor(status) {
            return window.MarkerUtils?.EPIC_COLORS[status] || '#6c757d';
        },

        getStatusTextColor(status) {
            // Get the status color and determine if text should be dark or light
            const color = this.getStatusColor(status);
            if (!color) return 'tag-text-light';
            const hex = color.replace("#", "");
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness > 155 ? 'tag-text-dark' : 'tag-text-light';
        },

        getStatusName(status) {
            return window.MarkerUtils?.STATUS_NAMES[status] || status;
        },
        
        getStatusDisplayName(status) {
            // Format status name for display with line break before "/"
            const name = this.getStatusName(status);
            return name.replace('/', '<br>/');
        },
        
        isStatusActive(status) {
            return this.selectedStatuses.has(status);
        },
        
        // Debug method to check current state
        debugInfo() {
            console.log('Available statuses:', this.availableStatuses);
            console.log('AppState jobs count:', window.AppState?.allJobs?.length || 0);
            console.log('Active filters:', Array.from(window.activeStatusFilters || []));
        },

        // Route Planning Methods
        hasRouteableSelection() {
            return this.selectedJobCount >= 2;
        },

        getSelectedCount() {
            return this.selectedJobCount;
        },

        openRoutePlanner() {
            this.menuOpen = false;
            this.ensureRoutePlannerLoaded()
                .then(() => {
                    if (window.RoutePlanner && typeof window.RoutePlanner.show === 'function') {
                        window.RoutePlanner.show();
                    } else if (window.showNotification) {
                        window.showNotification('Route planner not available', 'error');
                    }
                })
                .catch(() => {
                    if (window.showNotification) {
                        window.showNotification('Route planner not available', 'error');
                    }
                });
        },

        async ensureRoutePlannerLoaded() {
            if (window.RoutePlanner) return;
            if (window.RoutePlannerLoader && typeof window.RoutePlannerLoader.load === 'function') {
                await window.RoutePlannerLoader.load();
                if (window.RoutePlanner && typeof window.RoutePlanner.init === 'function' && window.AppState?.map && !window.RoutePlanner.initialized) {
                    window.RoutePlanner.init();
                }
            } else {
                throw new Error('Route planner loader unavailable');
            }
        },

        prefetchRoutePlanner() {
            if (this.routePlannerPrefetched) return;
            this.routePlannerPrefetched = true;
            this.ensureRoutePlannerLoaded().catch((error) => {
                console.warn('Route planner preload failed:', error);
                this.routePlannerPrefetched = false;
            });
        }
    };
}

// Register Alpine data, even if Alpine loaded earlier
function registerFabMenu() {
    if (window.Alpine && typeof window.Alpine.data === 'function') {
        window.Alpine.data('fabMenu', fabMenu);
    }
}
if (window.Alpine) {
    registerFabMenu();
} else {
    document.addEventListener('alpine:init', registerFabMenu);
}

// Export for debugging
window.fabMenu = fabMenu;

// Global debug function
window.debugStatusFilter = function() {
    console.log('=== Status Filter Debug Info ===');
    console.log('AppState exists:', !!window.AppState);
    console.log('Jobs loaded:', window.AppState?.allJobs?.length || 0);
    console.log('Active filters:', window.activeStatusFilters ? Array.from(window.activeStatusFilters) : 'Not initialized');
    
    if (window.AppState?.allJobs?.length > 0) {
        const statuses = [...new Set(window.AppState.allJobs.map(job => job.status).filter(Boolean))];
        console.log('Unique job statuses:', statuses);
    }
};

// Create a job from a parcel search result
window.createJobFromParcel = function(county, parcelId, lat, lng, address) {
    try {
        if (!window.CreateJobModal) {
            if (window.showNotification) window.showNotification('Create job UI not available', 'error');
            return;
        }
        // Open the create modal and prefill with parcel info
        window.CreateJobModal.show(lat, lng, address || 'Parcel Location');
        // Switch to parcel tab and set values after modal renders
        setTimeout(() => {
            try {
                window.CreateJobModal.switchTab('parcel');
                const countySelect = document.getElementById('parcel_county');
                if (countySelect) {
                    countySelect.value = county;
                    window.CreateJobModal.updateParcelInputs();
                }
                if (county === 'brevard') {
                    const el = document.getElementById('brevard_tax_account');
                    if (el) el.value = parcelId;
                } else if (county === 'orange') {
                    const el = document.getElementById('orange_parcel_id');
                    if (el) el.value = parcelId;
                }
            } catch (_) { /* no-op */ }
        }, 50);
    } catch (e) {
        console.error('createJobFromParcel error:', e);
    }
};
