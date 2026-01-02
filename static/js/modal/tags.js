/**
 * Modal Tags Module
 * Tag management for jobs.
 */

/**
 * Get text color class based on background color brightness.
 */
SimpleModal.getTagTextColor = function(tagColor) {
    if (!tagColor) return 'tag-text-dark';
    const hex = tagColor.replace("#", "");
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 155 ? 'tag-text-dark' : 'tag-text-light';
};

/**
 * Generate tags HTML (read-only chips).
 */
SimpleModal.generateTagsHTML = function(job) {
    try {
        const tags = Array.isArray(job?.tags) ? job.tags : [];
        if (!tags.length) return '<span style="color: #9ca3af; font-size: 0.875rem; font-style: italic;">No tags assigned</span>';
        const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
        return tags.map(t => {
            const textClass = this.getTagTextColor(t.color);
            return `
                <span class="epic-tag-filled ${textClass}" style="background-color:${t.color||'#007bff'};">
                    ${esc(t.name)}
                    <button class="remove-btn" onclick="SimpleModal.removeTag(${t.id})" title="Remove tag">
                        <i class="bi bi-x"></i>
                    </button>
                </span>
            `;
        }).join('');
    } catch (_) {
        return '<span style="color: #9ca3af; font-size: 0.875rem; font-style: italic;">No tags assigned</span>';
    }
};

/**
 * Fetch all tags for suggestions.
 */
SimpleModal.fetchAllTags = async function() {
    try {
        const items = await window.TagCache.loadOnce();
        this.allTags = items || [];
    } catch (_) {
        this.allTags = [];
    }
};

/**
 * Add tag to the current job by name.
 */
SimpleModal.addTag = async function() {
    const input = document.getElementById('modal-tag-input');
    if (!input) return;
    const name = (input.value || '').trim();
    if (!name) return;
    const existing = (this.allTags || []).find(t => (t.name||'').toLowerCase() === name.toLowerCase());
    let payload;
    if (existing) {
        payload = { tag_id: existing.id };
    } else {
        payload = { name };
    }
    try {
        const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to add tag');
        this.currentJob.tags = data.tags || [];
        this.updateTagsSection();
        if (window.AppState) {
            const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx !== -1) window.AppState.allJobs[idx].tags = this.currentJob.tags;
            const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx2 !== -1) window.AppState.filteredJobs[idx2].tags = this.currentJob.tags;
        }
        input.value = '';
        if (!existing) {
            window.TagCache.invalidate();
            this.fetchAllTags();
        }
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/api/tags');
        }
        this.showNotification('Tag added', 'success');
    } catch (e) {
        this.showNotification(e.message || 'Failed to add tag', 'error');
    }
};

/**
 * Add an existing tag by id (from suggestions).
 */
SimpleModal.addExistingTag = async function(tagId) {
    try {
        const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to add tag');
        this.currentJob.tags = data.tags || [];
        this.updateTagsSection();
        if (window.AppState) {
            const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx !== -1) window.AppState.allJobs[idx].tags = this.currentJob.tags;
            const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx2 !== -1) window.AppState.filteredJobs[idx2].tags = this.currentJob.tags;
        }
        const input = document.getElementById('modal-tag-input');
        if (input) input.value = '';
        this.updateTagSuggestions();
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/api/tags');
        }
        this.showNotification('Tag added', 'success');
    } catch (e) {
        this.showNotification(e.message || 'Failed to add tag', 'error');
    }
};

/**
 * Update dropdown suggestions as user types.
 */
SimpleModal.updateTagSuggestions = function() {
    const input = document.getElementById('modal-tag-input');
    const panel = document.getElementById('modal-tag-suggestions');
    if (!input || !panel) return;
    const q = (input.value || '').toLowerCase().trim();
    const assigned = new Set((Array.isArray(this.currentJob.tags) ? this.currentJob.tags : []).map(t => t.id));
    if (!q) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
    }
    const matches = (this.allTags || [])
        .filter(t => !assigned.has(t.id) && (t.name || '').toLowerCase().includes(q))
        .slice(0, 8);
    if (matches.length === 0) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
    }
    panel.innerHTML = matches.map(t => {
        const textClass = this.getTagTextColor(t.color);
        const escapedName = (t.name||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        return `
            <button class="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-0 transition-colors" onclick="SimpleModal.addExistingTag(${t.id})">
                <span class="epic-tag-filled ${textClass}" style="background-color:${t.color||'#007bff'}; padding: 6px 12px; font-size: 0.75rem;">${escapedName}</span>
            </button>
        `;
    }).join('');
    panel.style.display = 'block';
};

/**
 * Hide tag suggestions panel.
 */
SimpleModal.hideTagSuggestions = function() {
    const panel = document.getElementById('modal-tag-suggestions');
    if (panel) {
        panel.innerHTML = '';
        panel.style.display = 'none';
    }
};

/**
 * Remove tag from current job.
 */
SimpleModal.removeTag = async function(tagId) {
    try {
        const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/tags/${tagId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to remove tag');
        this.currentJob.tags = data.tags || (this.currentJob.tags || []).filter(t => t.id !== tagId);
        this.updateTagsSection();
        if (window.AppState) {
            const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx !== -1) window.AppState.allJobs[idx].tags = this.currentJob.tags;
            const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
            if (idx2 !== -1) window.AppState.filteredJobs[idx2].tags = this.currentJob.tags;
        }
        window.TagCache.invalidate();
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/api/tags');
        }
        this.showNotification('Tag removed', 'success');
    } catch (e) {
        this.showNotification(e.message || 'Failed to remove tag', 'error');
    }
};

/**
 * Update tags section in modal.
 */
SimpleModal.updateTagsSection = function() {
    const container = document.getElementById('modal-tags-container');
    if (container) container.innerHTML = this.generateTagsHTML(this.currentJob);
};

