/**
 * Modal Promotion Module
 * Job promotion from parcel to address.
 */

// Store promotion job number
SimpleModal._promotionJobNumber = null;

/**
 * Open in-app promotion modal.
 */
SimpleModal.openPromotion = function(jobNumber) {
    this._promotionJobNumber = jobNumber;
    const modal = document.getElementById('promotion-modal');
    const input = document.getElementById('promotion-address-input');
    if (modal) modal.classList.remove('hidden');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }
};

/**
 * Close promotion modal.
 */
SimpleModal.closePromotion = function() {
    const modal = document.getElementById('promotion-modal');
    if (modal) modal.classList.add('hidden');
};

/**
 * Submit promotion form.
 */
SimpleModal.submitPromotion = async function() {
    const input = document.getElementById('promotion-address-input');
    const address = (input?.value || '').trim();
    if (!address) {
        this.showNotification('Address is required to upgrade this job', 'error');
        return;
    }
    await this.promoteToAddress(this._promotionJobNumber, address);
    this.closePromotion();
};

/**
 * Promote job to address job.
 */
SimpleModal.promoteToAddress = async function(jobNumber, address) {
    try {
        const response = await fetch(`/api/jobs/${jobNumber}/promote-to-address`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to promote job');
        }
        const data = await response.json();
        // Update current job data
        this.currentJob.is_parcel_job = false;
        if (address) this.currentJob.address = address;
        this.renderModal(this.currentJob, this.generateFEMALink(this.currentJob.address));
        this.showNotification('Job promoted to address job successfully', 'success');
        // Update job in global state if available
        if (window.AppState && window.AppState.allJobs) {
            const idx = window.AppState.allJobs.findIndex(j => j.job_number === jobNumber);
            if (idx !== -1) {
                window.AppState.allJobs[idx].is_parcel_job = false;
                window.AppState.allJobs[idx].address = address;
            }
        }
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/admin/api/dashboard');
        }
    } catch (error) {
        console.error('Promotion error:', error);
        this.showNotification(error.message || 'Failed to promote job', 'error');
    }
};

