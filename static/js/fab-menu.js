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
        addressSearch: '',
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
        
        openSearch() {
            this.searchOpen = true;
            this.menuOpen = false;
            this.$nextTick(() => {
                this.$refs.searchInput?.focus();
            });
        },
        
        closeSearch() {
            this.searchOpen = false;
            this.addressSearch = '';
        },
        
        performAddressSearch() {
            if (this.addressSearch.trim()) {
                window.searchAddress(this.addressSearch);
                this.closeSearch();
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
