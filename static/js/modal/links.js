/**
 * Modal Links Module
 * Link management for jobs.
 */

/**
 * Generate links HTML (list of link buttons with delete option).
 */
SimpleModal.generateLinksHTML = function(job) {
    try {
        const links = Array.isArray(job?.links) ? job.links : [];
        if (!links.length) {
            return '<span style="color: #9ca3af; font-size: 0.875rem; font-style: italic;">No links added</span>';
        }
        const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
        return links.map((link, index) => `
            <div class="epic-link-item" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" style="flex: 1; display: flex; align-items: center; gap: 8px; color: #4f46e5; text-decoration: none; font-weight: 500;" title="${esc(link.url)}">
                    <i class="bi bi-link-45deg"></i>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(link.display_name)}</span>
                    <i class="bi bi-box-arrow-up-right" style="font-size: 0.7rem; opacity: 0.6; flex-shrink: 0;"></i>
                </a>
                <button class="epic-btn epic-btn-ghost epic-btn-icon" style="flex-shrink: 0; padding: 4px 8px;" onclick="SimpleModal.removeLink(${index})" title="Remove link">
                    <i class="bi bi-trash" style="color: #ef4444;"></i>
                </button>
            </div>
        `).join('');
    } catch (_) {
        return '<span style="color: #9ca3af; font-size: 0.875rem; font-style: italic;">No links added</span>';
    }
};

/**
 * Show the add link form.
 */
SimpleModal.showAddLinkForm = function() {
    const form = document.getElementById('add-link-form');
    if (form) {
        form.style.display = 'block';
        const nameInput = document.getElementById('link-display-name-input');
        if (nameInput) nameInput.focus();
    }
};

/**
 * Hide the add link form.
 */
SimpleModal.hideAddLinkForm = function() {
    const form = document.getElementById('add-link-form');
    if (form) {
        form.style.display = 'none';
    }
    const nameInput = document.getElementById('link-display-name-input');
    const urlInput = document.getElementById('link-url-input');
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
};

/**
 * Add a link to the current job.
 */
SimpleModal.addLink = async function() {
    const nameInput = document.getElementById('link-display-name-input');
    const urlInput = document.getElementById('link-url-input');
    if (!nameInput || !urlInput) return;

    const displayName = (nameInput.value || '').trim();
    const url = (urlInput.value || '').trim();

    if (!displayName) {
        this.showNotification('Display name is required', 'error');
        nameInput.focus();
        return;
    }
    if (!url) {
        this.showNotification('URL is required', 'error');
        urlInput.focus();
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        this.showNotification('URL must start with http:// or https://', 'error');
        urlInput.focus();
        return;
    }

    try {
        const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, display_name: displayName })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to add link');

        this.currentJob.links = data.links || [];
        this.updateLinksSection();
        this.hideAddLinkForm();

        // Update AppState caches
        if (window.AppState) {
            const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx !== -1) window.AppState.allJobs[idx].links = this.currentJob.links;
            const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx2 !== -1) window.AppState.filteredJobs[idx2].links = this.currentJob.links;
        }

        // Invalidate API cache
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
        }

        this.showNotification('Link added', 'success');
    } catch (e) {
        this.showNotification(e.message || 'Failed to add link', 'error');
    }
};

/**
 * Remove a link from the current job by index.
 */
SimpleModal.removeLink = async function(index) {
    try {
        const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/links/${index}`, {
            method: 'DELETE'
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to remove link');

        this.currentJob.links = data.links || [];
        this.updateLinksSection();

        // Update AppState caches
        if (window.AppState) {
            const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx !== -1) window.AppState.allJobs[idx].links = this.currentJob.links;
            const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx2 !== -1) window.AppState.filteredJobs[idx2].links = this.currentJob.links;
        }

        // Invalidate API cache
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
        }

        this.showNotification('Link removed', 'success');
    } catch (e) {
        this.showNotification(e.message || 'Failed to remove link', 'error');
    }
};

/**
 * Update links section in modal.
 */
SimpleModal.updateLinksSection = function() {
    const container = document.getElementById('links-list');
    if (container) {
        container.innerHTML = this.generateLinksHTML(this.currentJob);
    }
};
