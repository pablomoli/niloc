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
    const revealBtn = document.getElementById('reveal-nearby-btn');
    if (!container) return;

    if (!this.nearbyJobsLoaded) {
        container.innerHTML = '<div class="text-gray-500 text-sm">Loading nearby jobs...</div>';
        if (revealBtn) revealBtn.style.display = 'none';
        return;
    }

    if (this.nearbyJobs.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm">No jobs within 0.5 miles</div>';
        if (revealBtn) revealBtn.style.display = 'none';
        return;
    }

    // Show the reveal button when there are nearby jobs
    if (revealBtn) revealBtn.style.display = 'inline-flex';

    container.innerHTML = this.nearbyJobs.map(job => {
        const statusColor = window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d';
        const statusName = window.MarkerUtils?.STATUS_NAMES[job.status] || job.status || 'Unknown';
        // Format distance: always show 2 decimal places, clamp null to 0
        const distance = job.distance_miles ?? 0;
        const distanceText = distance < 0.01 ? '< 0.01 mi' : `${distance.toFixed(2)} mi`;

        return `
            <div class="nearby-job-item" onclick="SimpleModal.openNearbyJob('${job.job_number}')" title="${escapeHtml(statusName)} - Click to view">
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

/**
 * Temporary layer for nearby job highlights
 */
SimpleModal.nearbyHighlightLayer = null;
SimpleModal.nearbyHighlightTimeout = null;

/**
 * Reveal nearby jobs on the map with highlight markers and connection lines.
 * Creates a temporary layer that shows nearby jobs regardless of current filters.
 */
SimpleModal.revealNearbyOnMap = function() {
    if (!this.currentJob || !this.nearbyJobs.length) return;

    const map = window.AppState?.map;
    if (!map) return;

    // Store data before closing modal
    const currentJob = { ...this.currentJob };
    const nearbyJobs = [...this.nearbyJobs];

    // Close the modal so user can see the map
    this.hide();

    // Clear any existing highlight layer
    this.clearNearbyHighlights();

    const currentLat = parseFloat(currentJob.lat);
    const currentLng = parseFloat(currentJob.long);

    if (isNaN(currentLat) || isNaN(currentLng)) return;

    // Create a new layer group for highlights and add to map
    this.nearbyHighlightLayer = L.featureGroup();
    map.addLayer(this.nearbyHighlightLayer);

    // Bring to front to ensure visibility
    this.nearbyHighlightLayer.bringToFront();

    const bounds = L.latLngBounds([[currentLat, currentLng]]);

    // Add current job marker (larger, pulsing style)
    const currentMarker = L.circleMarker([currentLat, currentLng], {
        radius: 16,
        fillColor: '#FF1393',
        color: '#fff',
        weight: 4,
        opacity: 1,
        fillOpacity: 0.9,
        className: 'nearby-highlight-current'
    }).bindTooltip(`Current: #${currentJob.job_number}`, { permanent: true, direction: 'top', offset: [0, -10] });
    this.nearbyHighlightLayer.addLayer(currentMarker);

    // Add nearby job markers with connecting lines
    nearbyJobs.forEach((job) => {
        const lat = parseFloat(job.lat);
        const lng = parseFloat(job.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        bounds.extend([lat, lng]);

        // Draw connection line
        const line = L.polyline([[currentLat, currentLng], [lat, lng]], {
            color: '#10b981',
            weight: 3,
            opacity: 0.7,
            dashArray: '8, 12'
        });
        this.nearbyHighlightLayer.addLayer(line);

        // Draw nearby job marker
        const statusColor = window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d';
        const marker = L.circleMarker([lat, lng], {
            radius: 12,
            fillColor: statusColor,
            color: '#fff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9
        }).bindTooltip(`#${job.job_number}: ${job.client}`, { permanent: true, direction: 'top', offset: [0, -8] });

        // Click to open job modal
        marker.on('click', () => {
            this.clearNearbyHighlights();
            // Find full job data and open modal
            const fullJob = window.AppState?.allJobs?.find(j => j.job_number === job.job_number);
            if (fullJob) {
                this.show(fullJob);
            } else {
                fetch(`/api/jobs/${job.job_number}`)
                    .then(r => r.json())
                    .then(data => { if (data && !data.error) this.show(data); });
            }
        });
        this.nearbyHighlightLayer.addLayer(marker);
    });

    // Fit map to show all markers with padding
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 });

    // Auto-clear highlights after 20 seconds
    this.nearbyHighlightTimeout = setTimeout(() => {
        this.clearNearbyHighlights();
        if (typeof showNotification === 'function') {
            showNotification('Nearby job highlights cleared', 'info');
        }
    }, 20000);

    // Add escape key handler to dismiss highlights
    this._nearbyEscapeHandler = (e) => {
        if (e.key === 'Escape') {
            this.clearNearbyHighlights();
            if (typeof showNotification === 'function') {
                showNotification('Nearby job highlights cleared', 'info');
            }
        }
    };
    document.addEventListener('keydown', this._nearbyEscapeHandler);

    // Show notification
    if (typeof showNotification === 'function') {
        showNotification(`Showing ${nearbyJobs.length} nearby jobs - click marker to view, ESC to dismiss`, 'success');
    }
};

/**
 * Clear the nearby jobs highlight layer from the map.
 */
SimpleModal.clearNearbyHighlights = function() {
    if (this.nearbyHighlightTimeout) {
        clearTimeout(this.nearbyHighlightTimeout);
        this.nearbyHighlightTimeout = null;
    }
    if (this._nearbyEscapeHandler) {
        document.removeEventListener('keydown', this._nearbyEscapeHandler);
        this._nearbyEscapeHandler = null;
    }
    if (this.nearbyHighlightLayer) {
        const map = window.AppState?.map;
        if (map && map.hasLayer(this.nearbyHighlightLayer)) {
            map.removeLayer(this.nearbyHighlightLayer);
        }
        this.nearbyHighlightLayer = null;
    }
};

