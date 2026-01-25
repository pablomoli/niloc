/**
 * Modal State Module
 * Tag cache and modal state management.
 */

// In-memory Tag cache for the map session
window.TagCache = {
    items: [],
    loaded: false,
    async loadOnce() {
        if (this.loaded && Array.isArray(this.items) && this.items.length) return this.items;
        try {
            const fetcher = window.cachedFetch || window.fetch;
            const resp = await fetcher('/api/tags', {}, { ttl: 120_000 });
            this.items = await resp.json();
        } catch (_) {
            this.items = [];
        }
        this.loaded = true;
        return this.items;
    },
    invalidate() {
        this.loaded = false;
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/tags');
        }
    },
    add(tag) {
        if (tag && tag.id && !this.items.find(t => t.id === tag.id)) {
            this.items.push(tag);
        }
    }
};

// SimpleModal state object
window.SimpleModal = {
    currentJob: null,
    fieldworkData: [],
    fieldworkLoaded: false,
    nearbyJobs: [],
    nearbyJobsLoaded: false,
    allTags: [],
    confirmModal: {
        title: '',
        message: '',
        callback: null
    }
};

/**
 * Fetch nearby jobs within 0.5 miles of the current job.
 */
SimpleModal.fetchNearbyJobs = async function(jobNumber) {
    this.nearbyJobsLoaded = false;
    this.nearbyJobs = [];

    try {
        const response = await fetch(`/api/jobs/${jobNumber}/nearby`);
        if (response.ok) {
            const data = await response.json();
            this.nearbyJobs = data.nearby || [];
        } else {
            console.error('Failed to fetch nearby jobs');
            this.nearbyJobs = [];
        }
    } catch (error) {
        console.error('Error fetching nearby jobs:', error);
        this.nearbyJobs = [];
    }

    this.nearbyJobsLoaded = true;
    return this.nearbyJobs;
};

/**
 * Refresh the nearby jobs display in the modal.
 */
SimpleModal.refreshNearbyJobsDisplay = function() {
    const container = document.getElementById('nearby-jobs-list');
    if (!container) return;

    if (!this.nearbyJobsLoaded) {
        container.innerHTML = '<div class="text-gray-500 text-sm">Loading nearby jobs...</div>';
        return;
    }

    if (this.nearbyJobs.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm">No jobs within 0.5 miles</div>';
        return;
    }

    container.innerHTML = this.nearbyJobs.map(job => {
        const statusColor = window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d';
        const distanceText = job.distance_miles !== null
            ? `${job.distance_miles} mi`
            : 'N/A';

        return `
            <div class="nearby-job-item" onclick="SimpleModal.openNearbyJob('${job.job_number}')" title="Click to view job">
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <span class="nearby-job-status" style="background: ${statusColor};"></span>
                    <span class="nearby-job-number">#${job.job_number}</span>
                    <span class="nearby-job-client">${escapeHtml(job.client)}</span>
                </div>
                <span class="nearby-job-distance">${distanceText}</span>
            </div>
        `;
    }).join('');
};

/**
 * Open a nearby job in the modal (replaces current job).
 */
SimpleModal.openNearbyJob = function(jobNumber) {
    // Find the job in AppState or fetch it
    const job = window.AppState?.allJobs?.find(j => j.job_number === jobNumber);
    if (job) {
        this.show(job);
    } else {
        // Fetch job data and show
        fetch(`/api/jobs/${jobNumber}`)
            .then(r => r.json())
            .then(data => {
                if (data && !data.error) {
                    this.show(data);
                }
            })
            .catch(err => console.error('Error loading nearby job:', err));
    }
};

