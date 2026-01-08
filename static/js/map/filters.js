/**
 * Map Filters Module
 * Job filtering, searching, and status management.
 */

// Load saved filters from localStorage
let initialStatusFilters = DEFAULT_STATUS_FILTER;
let initialTagFilters = [];
try {
    const storedStatuses = localStorage.getItem(FILTER_STORAGE_KEY);
    if (storedStatuses) {
        initialStatusFilters = JSON.parse(storedStatuses);
    }
    const storedTags = localStorage.getItem(TAG_FILTER_STORAGE_KEY);
    if (storedTags) {
        initialTagFilters = JSON.parse(storedTags);
    }
} catch (e) {
    console.warn('Failed to load saved filters from localStorage:', e);
}

window.activeStatusFilters = new Set(initialStatusFilters);
window.activeTagFilters = new Set(initialTagFilters);
let searchTerm = '';

/**
 * Load jobs from the server.
 * Fetches all pages if the dataset exceeds the per-page limit.
 */
async function loadJobs(force = false) {
    try {
        const fetcher = window.cachedFetch || window.fetch;
        const perPage = 2000;
        let allJobs = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `/api/jobs?include_tags=false&per_page=${perPage}&page=${page}`;
            const response = await fetcher(url, {}, { ttl: 30_000, force });
            const data = await response.json();

            const jobs = Array.isArray(data) ? data : data.jobs || [];
            allJobs = allJobs.concat(jobs);

            hasMore = data.has_next === true;
            page++;

            if (page > 100) {
                console.warn('loadJobs: Stopping after 100 pages to prevent infinite loop');
                break;
            }
        }

        AppState.allJobs = allJobs;
        AppState.filteredJobs = [...AppState.allJobs];

        updateMapMarkers();
        updateCounts();

        if (window.MarkerUtils) {
            const filterContainer = document.getElementById('status-filters');
            if (filterContainer) {
                createStatusFilters(AppState.allJobs, filterContainer);
            }
        }

        document.dispatchEvent(new CustomEvent('jobsLoaded'));
        applyFilters();

        console.log(`Loaded ${AppState.allJobs.length} jobs`);
    } catch (error) {
        console.error('Failed to load jobs:', error);
    }
}

/**
 * Update visible/total counts.
 */
function updateCounts() {
    const totalCountEl = document.getElementById('totalCount');
    const visibleCountEl = document.getElementById('visibleCount');

    if (totalCountEl) {
        totalCountEl.textContent = AppState.allJobs.length;
    }
    if (visibleCountEl) {
        visibleCountEl.textContent = AppState.filteredJobs.length;
    }
}

/**
 * Create status filter buttons.
 */
function createStatusFilters(jobs, container) {
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'filter-pill active';
    allBtn.dataset.status = 'all';
    allBtn.innerHTML = '<span>All</span>';
    allBtn.onclick = () => toggleStatusFilter('all');
    container.appendChild(allBtn);

    const statuses = [...new Set(jobs.map(job => job.status).filter(Boolean))];

    statuses.forEach(status => {
        const btn = document.createElement('button');
        btn.className = 'filter-pill';
        btn.dataset.status = status;

        const color = window.MarkerUtils?.EPIC_COLORS[status] || '#999';
        const name = window.MarkerUtils?.STATUS_NAMES[status] || status;

        btn.innerHTML = `
            <span class="status-dot" style="background-color: ${color}"></span>
            <span>${name}</span>
        `;
        btn.onclick = () => toggleStatusFilter(status);
        container.appendChild(btn);
    });
}

/**
 * Toggle status filter.
 */
function toggleStatusFilter(status) {
    if (status === 'all') {
        window.activeStatusFilters.clear();
        window.activeStatusFilters.add('all');
    } else {
        window.activeStatusFilters.delete('all');
        if (window.activeStatusFilters.has(status)) {
            window.activeStatusFilters.delete(status);
            if (window.activeStatusFilters.size === 0) {
                window.activeStatusFilters.add('all');
            }
        } else {
            window.activeStatusFilters.add(status);
        }
    }

    const filterPills = document.querySelectorAll('.filter-pill');
    if (filterPills.length > 0) {
        filterPills.forEach(btn => {
            btn.classList.toggle('active', window.activeStatusFilters.has(btn.dataset.status));
        });
    }

    applyFilters();
}

/**
 * Apply all filters.
 */
function applyFilters() {
    AppState.filteredJobs = AppState.allJobs.filter(job => {
        if (!window.activeStatusFilters.has('all') && !window.activeStatusFilters.has(job.status)) {
            return false;
        }

        if (window.activeTagFilters.size > 0) {
            if (!Array.isArray(job.tags) || job.tags.length === 0) {
                return false;
            }
            const hasMatchingTag = job.tags.some(tag => window.activeTagFilters.has(tag.id));
            if (!hasMatchingTag) {
                return false;
            }
        }

        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            const jobNumber = (job.job_number || '').toLowerCase();
            const client = (job.client || '').toLowerCase();
            const address = (job.address || '').toLowerCase();

            if (!jobNumber.includes(search) &&
                !client.includes(search) &&
                !address.includes(search)) {
                return false;
            }
        }

        return true;
    });

    updateMapMarkers();
    updateCounts();
}

// Job search with debouncing
let jobSearchTimer = null;
function searchJobs() {
    const searchInput = document.querySelector('.search-box input[placeholder*="Job"]');
    const newSearchTerm = searchInput.value.trim();

    if (jobSearchTimer) clearTimeout(jobSearchTimer);
    jobSearchTimer = setTimeout(() => {
        searchTerm = newSearchTerm;
        applyFilters();
    }, 300);
}

// Address search with debouncing
let addressSearchTimer = null;
async function searchAddress(address) {
    const searchQuery = address || document.querySelector('.search-box input[placeholder*="address"]')?.value?.trim();

    if (!searchQuery) return;

    if (addressSearchTimer) clearTimeout(addressSearchTimer);
    addressSearchTimer = setTimeout(async () => {
        await performAddressSearch(searchQuery);
    }, 500);
}

/**
 * Perform actual address search.
 */
async function performAddressSearch(searchQuery) {
    try {
        const response = await fetch(`/api/geocode?address=${encodeURIComponent(searchQuery + ', Florida')}`);
        const result = await response.json();

        if (response.ok && result.lat && result.lng) {
            const lat = parseFloat(result.lat);
            const lng = parseFloat(result.lng);
            const displayName = result.formatted_address || searchQuery;

            if (window.currentSearchMarker) {
                AppState.map.removeLayer(window.currentSearchMarker);
            }

            const safeDisplayName = escapeHtml(displayName);
            const popupContent = `
                <div style="text-align: center; min-width: 200px;">
                    <strong>Search Result</strong><br>
                    <p style="margin: 10px 0; font-size: 12px;">${safeDisplayName}</p>
                    <button
                        class="btn btn-primary btn-sm"
                        style="margin-top: 10px;"
                        data-lat="${lat}"
                        data-lng="${lng}"
                        data-name="${safeDisplayName}"
                        onclick="createJobAtLocation(parseFloat(this.dataset.lat), parseFloat(this.dataset.lng), this.dataset.name)"
                    >
                        <i class="bi bi-plus-circle"></i> Create Job Here
                    </button>
                </div>
            `;

            if (window.MarkerUtils) {
                window.currentSearchMarker = MarkerUtils.createSearchMarker(lat, lng)
                    .bindPopup(popupContent)
                    .addTo(AppState.map)
                    .openPopup();
            } else {
                window.currentSearchMarker = L.marker([lat, lng])
                    .bindPopup(popupContent)
                    .addTo(AppState.map)
                    .openPopup();
            }

            AppState.map.setView([lat, lng], 15);
        } else {
            showNotification('Address not found', 'error');
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        showNotification('Error searching for address', 'error');
    }
}

/**
 * Apply status filter from FAB menu.
 */
function applyStatusFilter(statuses) {
    if (statuses.includes('all')) {
        window.activeStatusFilters.clear();
        window.activeStatusFilters.add('all');
    } else {
        window.activeStatusFilters.clear();
        statuses.forEach(status => window.activeStatusFilters.add(status));
    }

    const filterPills = document.querySelectorAll('.filter-pill');
    if (filterPills.length > 0) {
        filterPills.forEach(btn => {
            btn.classList.toggle('active', window.activeStatusFilters.has(btn.dataset.status));
        });
    }

    applyFilters();
}

/**
 * Create job at location.
 */
function createJobAtLocation(lat, lng, address) {
    console.log('Creating job at:', lat, lng, address);

    if (window.CreateJobModal) {
        window.CreateJobModal.show(lat, lng, address);
    } else {
        showNotification('Create job functionality not available', 'error');
    }
}

// Wire up Alpine data for search inputs
document.addEventListener('alpine:init', () => {
    Alpine.data('searchControls', () => ({
        jobSearch: '',
        addressSearch: '',
        searchJobs() {
            const searchInput = document.querySelector('.search-box input[placeholder*="Job"]');
            if (searchInput) {
                searchInput.value = this.jobSearch;
                window.searchJobs();
            }
        },
        searchAddress() {
            window.searchAddress(this.addressSearch);
        }
    }));
});

// Export to window
window.loadJobs = loadJobs;
window.updateCounts = updateCounts;
window.createStatusFilters = createStatusFilters;
window.toggleStatusFilter = toggleStatusFilter;
window.applyFilters = applyFilters;
window.searchJobs = searchJobs;
window.searchAddress = searchAddress;
window.performAddressSearch = performAddressSearch;
window.applyStatusFilter = applyStatusFilter;
window.createJobAtLocation = createJobAtLocation;
