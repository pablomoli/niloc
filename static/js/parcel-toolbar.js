/**
 * Parcel Toolbar Module
 * Handles toolbar button for showing parcel boundaries of selected jobs.
 */

const ParcelToolbar = {
    /**
     * Show parcel boundaries for all selected jobs.
     * Called from the toolbar button via Alpine.
     */
    async showSelectedParcels() {
        const selectedJobNumbers = Array.from(window.AppState?.selectedJobs || []);
        console.log('showSelectedParcels: selectedJobNumbers=', selectedJobNumbers);

        if (selectedJobNumbers.length === 0) {
            if (window.showNotification) {
                window.showNotification('No jobs selected', 'warning');
            }
            return;
        }

        // Get job objects for selected job numbers (use allJobs, not filtered jobs)
        const allJobs = window.AppState?.allJobs || window.AppState?.jobs || [];
        const jobs = allJobs.filter(j => selectedJobNumbers.includes(j.job_number));
        console.log('showSelectedParcels: found', jobs.length, 'job objects from', allJobs.length, 'total');

        // Filter to only Orange/Brevard county jobs
        const eligibleJobs = jobs.filter(j => {
            const county = (j.county || '').toLowerCase();
            const eligible = county === 'orange' || county === 'brevard';
            console.log('showSelectedParcels: job', j.job_number, 'county=', j.county, 'eligible=', eligible);
            return eligible;
        });

        if (eligibleJobs.length === 0) {
            const counties = jobs.map(j => j.county || 'unknown').join(', ');
            if (window.showNotification) {
                window.showNotification(`Selected jobs not in Orange/Brevard (found: ${counties})`, 'warning');
            }
            return;
        }

        // Show loading notification
        if (window.showNotification) {
            window.showNotification(`Loading parcels for ${eligibleJobs.length} job(s)...`, 'info');
        }

        // Ensure ParcelBoundaries module is available
        if (!window.ParcelBoundaries) {
            if (window.showNotification) {
                window.showNotification('Parcel boundaries module not available', 'error');
            }
            return;
        }

        const map = window.AppState?.map;
        if (!map) return;

        // Ensure boundary layer is visible
        if (!map.hasLayer(window.ParcelBoundaries.boundaryLayer)) {
            window.ParcelBoundaries.boundaryLayer.addTo(map);
        }

        // Fetch boundaries for all eligible jobs
        let successCount = 0;
        let errorCount = 0;

        for (const job of eligibleJobs) {
            // Skip if already has geometry displayed
            if (window.ParcelBoundaries.displayedBoundaries.has(job.job_number)) {
                successCount++;
                continue;
            }

            // Skip if already has cached geometry - just display it
            if (job.parcel_geometry) {
                window.ParcelBoundaries.addBoundary(job);
                successCount++;
                continue;
            }

            try {
                await window.ParcelBoundaries.fetchBoundary(job.job_number, map);
                successCount++;
            } catch (error) {
                console.error(`Failed to fetch parcel for ${job.job_number}:`, error);
                errorCount++;
            }
        }

        // Zoom to show all selected jobs
        const validCoords = eligibleJobs
            .map(job => {
                const lat = parseFloat(job.lat);
                const lng = parseFloat(job.long);
                return (lat && lng && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
            })
            .filter(coord => coord !== null);

        if (validCoords.length === 1) {
            map.setView(validCoords[0], Math.max(map.getZoom(), window.ParcelBoundaries.MIN_ZOOM));
        } else if (validCoords.length > 1) {
            const bounds = L.latLngBounds(validCoords);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }

        // Show result notification
        if (window.showNotification) {
            if (errorCount > 0) {
                window.showNotification(`Loaded ${successCount} parcel(s), ${errorCount} failed`, 'warning');
            } else if (successCount > 0) {
                window.showNotification(`Loaded ${successCount} parcel boundary(s)`, 'success');
            }
        }
    }
};

// Export for use in Alpine and other modules
window.ParcelToolbar = ParcelToolbar;
