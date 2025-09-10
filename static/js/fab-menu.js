/**
 * FAB Menu Component for Epic Map
 * Handles the floating action button with arc menu pattern
 */

// FAB Menu Alpine Component
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
        
        // Existing properties
        availableStatuses: [],
        selectedStatuses: new Set(['all']), // Local reactive state for UI
        currentBaseLayer: 'satellite',
        countiesVisible: false,
        
        init() {
            // Store reference to this component for event handlers
            const self = this;
            
            // Initialize global state if needed
            if (!window.activeStatusFilters) {
                window.activeStatusFilters = new Set(['all']);
            }
            
            // Sync local reactive state with global state
            this.selectedStatuses = new Set(window.activeStatusFilters);
            
            // Get available statuses from jobs
            this.updateAvailableStatuses();
            
            // Listen for jobs loaded event to update statuses
            document.addEventListener('jobsLoaded', () => {
                self.updateAvailableStatuses();
            });
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
                            const popupContent = `
                                <div class="parcel-popup">
                                    <h5>${this.selectedCounty === 'brevard' ? 'Brevard' : 'Orange'} County Parcel</h5>
                                    <p><strong>${this.selectedCounty === 'brevard' ? 'Tax Account' : 'Parcel ID'}:</strong> ${value}</p>
                                    <p><strong>Address:</strong> ${address}</p>
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
                    const resp = await fetch(`/api/jobs/search/autocomplete?q=${encodeURIComponent(term)}&limit=8`);
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
            }, 200);
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
            }
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
                window.toggleCounties();
                // Update local state - toggle the value
                this.countiesVisible = !this.countiesVisible;
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
            window.applyStatusFilter(Array.from(window.activeStatusFilters));
            this.closeStatusFilter();
        },
        
        getStatusColor(status) {
            return window.MarkerUtils?.EPIC_COLORS[status] || '#6c757d';
        },
        
        getStatusName(status) {
            return window.MarkerUtils?.STATUS_NAMES[status] || status;
        },
        
        isStatusActive(status) {
            return this.selectedStatuses.has(status);
        },
        
        // Debug method to check current state
        debugInfo() {
            console.log('Available statuses:', this.availableStatuses);
            console.log('AppState jobs count:', window.AppState?.allJobs?.length || 0);
            console.log('Active filters:', Array.from(window.activeStatusFilters || []));
        }
    };
}

// Register Alpine data on init
document.addEventListener('alpine:init', () => {
    Alpine.data('fabMenu', fabMenu);
});

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
