/**
 * Parcel Boundaries Module
 * Displays parcel boundaries on the map at high zoom levels.
 */

const ParcelBoundaries = {
    /** Layer group for parcel boundaries */
    boundaryLayer: null,

    /** Map of job_number -> polygon for tracking displayed boundaries */
    displayedBoundaries: new Map(),

    /** Minimum zoom level to show boundaries (18 = very close) */
    MIN_ZOOM: 17,

    /** Loading state tracking */
    loadingJobs: new Set(),

    /**
     * Initialize the parcel boundaries module.
     * @param {L.Map} map - Leaflet map instance
     */
    init(map) {
        this.boundaryLayer = L.featureGroup().addTo(map);

        // Listen for zoom changes
        map.on('zoomend', () => this.onZoomChange(map));
        map.on('moveend', () => this.updateVisibleBoundaries(map));

        // Initial check
        this.onZoomChange(map);

        console.log('ParcelBoundaries module initialized');
    },

    /**
     * Handle zoom level changes.
     * @param {L.Map} map - Leaflet map instance
     */
    onZoomChange(map) {
        const zoom = map.getZoom();

        if (zoom >= this.MIN_ZOOM) {
            this.boundaryLayer.addTo(map);
            this.updateVisibleBoundaries(map);
        } else {
            // Hide boundaries when zoomed out
            map.removeLayer(this.boundaryLayer);
        }
    },

    /**
     * Update visible boundaries based on current map view.
     * @param {L.Map} map - Leaflet map instance
     */
    updateVisibleBoundaries(map) {
        if (map.getZoom() < this.MIN_ZOOM) return;

        const bounds = map.getBounds();
        const jobs = window.AppState?.jobs || [];

        // Find jobs in view that have geometry
        jobs.forEach(job => {
            if (!job.lat || !job.long) return;

            const lat = parseFloat(job.lat);
            const lng = parseFloat(job.long);

            if (!bounds.contains([lat, lng])) {
                // Remove if out of view
                this.removeBoundary(job.job_number);
                return;
            }

            // Show boundary if we have cached geometry
            if (job.parcel_geometry && !this.displayedBoundaries.has(job.job_number)) {
                this.addBoundary(job);
            }
        });
    },

    /**
     * Add a boundary polygon for a job.
     * @param {Object} job - Job object with parcel_geometry
     */
    addBoundary(job) {
        if (!job.parcel_geometry?.rings) {
            console.warn('addBoundary: No rings in geometry', job.job_number, job.parcel_geometry);
            return;
        }

        // Skip if already displayed
        if (this.displayedBoundaries.has(job.job_number)) {
            console.log('addBoundary: Already displayed', job.job_number);
            return;
        }

        // Convert rings to Leaflet format [lat, lng]
        const coords = job.parcel_geometry.rings.map(ring =>
            ring.map(coord => [coord[1], coord[0]])
        );

        console.log('addBoundary: Creating polygon for', job.job_number, 'with', coords.length, 'rings');

        const color = this.getBoundaryColor(job);
        const polygon = L.polygon(coords, {
            color: color,
            weight: 3,
            fillColor: color,
            fillOpacity: 0.25,
            interactive: false
        });

        polygon.addTo(this.boundaryLayer);
        this.displayedBoundaries.set(job.job_number, polygon);

        console.log('addBoundary: Polygon added, bounds:', polygon.getBounds());
    },

    /**
     * Remove a boundary polygon.
     * @param {string} jobNumber - Job number
     */
    removeBoundary(jobNumber) {
        const polygon = this.displayedBoundaries.get(jobNumber);
        if (polygon) {
            this.boundaryLayer.removeLayer(polygon);
            this.displayedBoundaries.delete(jobNumber);
        }
    },

    /**
     * Get boundary color based on job type.
     * @param {Object} job - Job object
     */
    getBoundaryColor(job) {
        if (job.is_parcel_job) {
            return '#9b59b6'; // Purple for parcel jobs
        }
        return '#3498db'; // Blue for address jobs
    },

    /**
     * Fetch and display boundary for a specific job.
     * Shows loading indicator and caches result.
     * @param {string} jobNumber - Job number
     * @param {L.Map} map - Leaflet map instance
     * @returns {Promise<Object|null>} Geometry object or null
     */
    async fetchBoundary(jobNumber, map) {
        if (this.loadingJobs.has(jobNumber)) {
            return null; // Already loading
        }

        this.loadingJobs.add(jobNumber);
        this.showLoadingIndicator(true);

        try {
            const response = await fetch(`/api/jobs/${jobNumber}/parcel-geometry`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch parcel');
            }

            const data = await response.json();
            console.log('fetchBoundary: Got geometry', data.geometry);

            // Update job in AppState (check allJobs first, then jobs)
            const allJobs = window.AppState?.allJobs || [];
            const filteredJobs = window.AppState?.jobs || [];
            let job = allJobs.find(j => j.job_number === jobNumber);
            if (!job) {
                job = filteredJobs.find(j => j.job_number === jobNumber);
            }
            console.log('fetchBoundary: found job?', !!job, 'allJobs:', allJobs.length, 'filteredJobs:', filteredJobs.length);

            if (job) {
                job.parcel_geometry = data.geometry;
                console.log('fetchBoundary: Updated job geometry');
            }

            // Ensure boundary layer is on map
            if (!map.hasLayer(this.boundaryLayer)) {
                this.boundaryLayer.addTo(map);
                console.log('fetchBoundary: Added boundaryLayer to map');
            }

            // Add boundary to map - create a temporary job object if not found
            if (job) {
                this.addBoundary(job);
            } else {
                // Create minimal job object for display
                console.log('fetchBoundary: Creating temp job object for boundary');
                this.addBoundary({
                    job_number: jobNumber,
                    parcel_geometry: data.geometry,
                    is_parcel_job: false
                });
            }

            return data.geometry;

        } catch (error) {
            console.error('Error fetching parcel boundary:', error);
            throw error;
        } finally {
            this.loadingJobs.delete(jobNumber);
            this.showLoadingIndicator(false);
        }
    },

    /**
     * Show/hide loading indicator.
     * @param {boolean} show - Whether to show the indicator
     */
    showLoadingIndicator(show) {
        let indicator = document.getElementById('parcelLoadingIndicator');

        if (show && !indicator) {
            indicator = document.createElement('div');
            indicator.id = 'parcelLoadingIndicator';
            indicator.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-white shadow-lg rounded-lg px-4 py-2 flex items-center gap-2';
            indicator.innerHTML = `
                <span class="loading loading-spinner loading-sm"></span>
                <span class="text-sm">Loading parcel boundary...</span>
            `;
            document.body.appendChild(indicator);
        } else if (!show && indicator) {
            indicator.remove();
        }
    },

    /**
     * Clear all boundaries from the map.
     */
    clear() {
        this.boundaryLayer.clearLayers();
        this.displayedBoundaries.clear();
    },

    /**
     * Refresh boundaries (e.g., after jobs reload).
     * @param {L.Map} map - Leaflet map instance
     */
    refresh(map) {
        this.clear();
        this.updateVisibleBoundaries(map);
    }
};

// Export for use in other modules
window.ParcelBoundaries = ParcelBoundaries;
