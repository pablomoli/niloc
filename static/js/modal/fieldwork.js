/**
 * Modal Fieldwork Module
 * Time tracking CRUD operations.
 */

/**
 * Fetch fieldwork data for a job.
 */
SimpleModal.fetchFieldworkData = async function(jobNumber) {
    try {
        const response = await fetch(`/api/jobs/${jobNumber}/fieldwork`);
        if (response.ok) {
            this.fieldworkData = await response.json();
        } else {
            console.error('Failed to fetch fieldwork data');
            this.fieldworkData = [];
        }
    } catch (error) {
        console.error('Error fetching fieldwork data:', error);
        this.fieldworkData = [];
    }
};

/**
 * Generate fieldwork entries HTML.
 */
SimpleModal.generateFieldworkHTML = function() {
    if (!this.fieldworkLoaded) {
        return `
            <div class="epic-empty-state" style="padding: 24px;">
                <div class="epic-loading" style="justify-content: center; color: var(--epic-pink);">
                    Loading entries...
                </div>
            </div>
        `;
    }
    if (this.fieldworkData.length === 0) {
        return `
            <div class="epic-empty-state">
                <i class="bi bi-clock-history"></i>
                <p>No time entries recorded yet</p>
            </div>
        `;
    }

    return this.fieldworkData.map((fw, index) => `
        <div class="epic-fieldwork-entry">
            <div class="entry-info">
                <div class="entry-number">${index + 1}</div>
                <div>
                    <div class="entry-details">${this.formatDate(fw.work_date)}</div>
                    <div class="entry-duration">${this.formatDuration(fw.total_time)}</div>
                </div>
            </div>
            <div class="entry-actions">
                <button class="epic-btn epic-btn-ghost epic-btn-icon" onclick="SimpleModal.editFieldwork(${fw.id})" title="Edit entry">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="epic-btn epic-btn-danger epic-btn-icon" onclick="SimpleModal.deleteFieldwork(${fw.id})" title="Delete entry">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
};

/**
 * Show add fieldwork form.
 */
SimpleModal.showAddFieldworkForm = function() {
    const today = new Date().toISOString().split('T')[0];

    const formHTML = `
        <div id="fieldwork-form" class="epic-data-card accent-pink" style="margin-top: 16px;">
            <div class="epic-modal-subtitle" style="margin-bottom: 16px;">New Time Entry</div>

            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label required">Work Date</label>
                        <input type="date" id="fw-work-date" class="epic-input" value="${today}" required>
                    </div>
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label required">Duration</label>
                        <input type="text" id="fw-total-time" class="epic-input mono" placeholder="1:30 or 9:00-10:30" required>
                        <small style="font-size: 0.6875rem; color: #9ca3af; margin-top: 4px; display: block;">H:MM or start-end</small>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label">Crew</label>
                        <input type="text" id="fw-crew" class="epic-input" placeholder="Optional">
                    </div>
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label">Drone Card</label>
                        <input type="text" id="fw-drone-card" class="epic-input" placeholder="Optional">
                    </div>
                </div>

                <div class="epic-form-section" style="margin: 0;">
                    <label class="epic-form-label">Notes</label>
                    <textarea id="fw-notes" class="epic-input epic-textarea" placeholder="Optional notes" rows="2"></textarea>
                </div>

                <div style="display: flex; gap: 8px; padding-top: 8px;">
                    <button id="fw-save-btn" class="epic-btn epic-btn-success" style="flex: 1;" onclick="SimpleModal.saveFieldwork()">
                        <i class="bi bi-check-lg"></i>
                        Save Entry
                    </button>
                    <button class="epic-btn epic-btn-ghost" onclick="SimpleModal.hideAddFieldworkForm()">
                        <i class="bi bi-x-lg"></i>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    const timeSection = document.querySelector('#fieldwork-list').parentElement;
    const existingForm = document.getElementById('fieldwork-form');

    if (existingForm) {
        existingForm.remove();
    }

    timeSection.insertAdjacentHTML('beforeend', formHTML);
};

/**
 * Hide add fieldwork form.
 */
SimpleModal.hideAddFieldworkForm = function() {
    const form = document.getElementById('fieldwork-form');
    if (form) {
        form.remove();
    }
};

/**
 * Save new fieldwork entry.
 */
SimpleModal.saveFieldwork = async function() {
    const saveBtn = document.getElementById('fw-save-btn');
    const originalContent = saveBtn.innerHTML;

    const workDate = document.getElementById('fw-work-date').value;
    const totalTime = document.getElementById('fw-total-time').value;
    const crew = document.getElementById('fw-crew').value.trim();
    const droneCard = document.getElementById('fw-drone-card').value.trim();
    const notes = document.getElementById('fw-notes').value.trim();

    if (!workDate || !totalTime) {
        this.showNotification('Please fill in all required fields', 'error');
        return;
    }

    const parsedTime = this.parseTimeInput(totalTime);
    if (parsedTime === null || parsedTime <= 0) {
        this.showNotification('Invalid format. Use H:MM (e.g., 1:30) or range (e.g., 9:00-10:30)', 'error');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';

    try {
        const response = await fetch(`/api/jobs/${this.currentJob.job_number}/fieldwork`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                work_date: workDate,
                total_time: totalTime,
                crew: crew || null,
                drone_card: droneCard || null,
                notes: notes || null
            })
        });

        if (response.ok) {
            await this.fetchFieldworkData(this.currentJob.job_number);
            this.refreshFieldworkDisplay();
            this.hideAddFieldworkForm();
            this.showNotification('Time entry saved successfully', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save entry');
        }
    } catch (error) {
        console.error('Failed to save fieldwork:', error);
        this.showNotification(`Failed to save: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalContent;
    }
};

/**
 * Refresh fieldwork display.
 */
SimpleModal.refreshFieldworkDisplay = function() {
    const fieldworkList = document.getElementById('fieldwork-list');
    if (fieldworkList) {
        fieldworkList.innerHTML = this.generateFieldworkHTML();
    }
    this.updateTotalTimeDisplay();
};

/**
 * Update total time display.
 */
SimpleModal.updateTotalTimeDisplay = function() {
    const totalTimeElement = document.getElementById('total-time-badge');
    if (totalTimeElement) {
        totalTimeElement.textContent = this.formatDuration(this.getTotalFieldworkTime());
    }
};

/**
 * Edit fieldwork entry.
 */
SimpleModal.editFieldwork = function(fieldworkId) {
    const fieldwork = this.fieldworkData.find(fw => fw.id === fieldworkId);
    if (!fieldwork) return;

    this.hideAddFieldworkForm();
    this.hideEditFieldworkForm();

    const timeDisplay = this.formatTimeInput(fieldwork.total_time);

    const formHTML = `
        <div id="edit-fieldwork-form" class="epic-data-card accent-blue" style="margin-top: 16px;">
            <div class="epic-modal-subtitle" style="margin-bottom: 16px;">Edit Time Entry</div>

            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label required">Work Date</label>
                        <input type="date" id="edit-fw-work-date" class="epic-input" value="${fieldwork.work_date}" required>
                    </div>
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label required">Duration</label>
                        <input type="text" id="edit-fw-total-time" class="epic-input mono" value="${timeDisplay}" placeholder="1:30 or 9:00-10:30" required>
                        <small style="font-size: 0.6875rem; color: #9ca3af; margin-top: 4px; display: block;">H:MM or start-end</small>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label">Crew</label>
                        <input type="text" id="edit-fw-crew" class="epic-input" value="${escapeHtml(fieldwork.crew)}" placeholder="Optional">
                    </div>
                    <div class="epic-form-section" style="margin: 0;">
                        <label class="epic-form-label">Drone Card</label>
                        <input type="text" id="edit-fw-drone-card" class="epic-input" value="${escapeHtml(fieldwork.drone_card)}" placeholder="Optional">
                    </div>
                </div>

                <div class="epic-form-section" style="margin: 0;">
                    <label class="epic-form-label">Notes</label>
                    <textarea id="edit-fw-notes" class="epic-input epic-textarea" placeholder="Optional notes" rows="2">${escapeHtml(fieldwork.notes)}</textarea>
                </div>

                <div style="display: flex; gap: 8px; padding-top: 8px;">
                    <button id="edit-fw-save-btn" class="epic-btn epic-btn-primary" style="flex: 1;" onclick="SimpleModal.saveEditFieldwork(${fieldworkId})">
                        <i class="bi bi-check-lg"></i>
                        Save Changes
                    </button>
                    <button class="epic-btn epic-btn-ghost" onclick="SimpleModal.hideEditFieldworkForm()">
                        <i class="bi bi-x-lg"></i>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    const timeSection = document.querySelector('#fieldwork-list').parentElement;
    timeSection.insertAdjacentHTML('beforeend', formHTML);
};

/**
 * Hide edit fieldwork form.
 */
SimpleModal.hideEditFieldworkForm = function() {
    const form = document.getElementById('edit-fieldwork-form');
    if (form) {
        form.remove();
    }
};

/**
 * Save edited fieldwork entry.
 */
SimpleModal.saveEditFieldwork = async function(fieldworkId) {
    const saveBtn = document.getElementById('edit-fw-save-btn');
    const originalContent = saveBtn.innerHTML;

    const workDate = document.getElementById('edit-fw-work-date').value;
    const totalTime = document.getElementById('edit-fw-total-time').value;
    const crew = document.getElementById('edit-fw-crew').value.trim();
    const droneCard = document.getElementById('edit-fw-drone-card').value.trim();
    const notes = document.getElementById('edit-fw-notes').value.trim();

    if (!workDate || !totalTime) {
        this.showNotification('Please fill in all required fields', 'error');
        return;
    }

    const parsedTime = this.parseTimeInput(totalTime);
    if (parsedTime === null || parsedTime <= 0) {
        this.showNotification('Invalid format. Use H:MM (e.g., 1:30) or range (e.g., 9:00-10:30)', 'error');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';

    try {
        const response = await fetch(`/api/fieldwork/${fieldworkId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                work_date: workDate,
                total_time: totalTime,
                crew: crew || null,
                drone_card: droneCard || null,
                notes: notes || null
            })
        });

        if (response.ok) {
            await this.fetchFieldworkData(this.currentJob.job_number);
            this.refreshFieldworkDisplay();
            this.hideEditFieldworkForm();
            this.showNotification('Time entry updated successfully', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update entry');
        }
    } catch (error) {
        console.error('Failed to update fieldwork:', error);
        this.showNotification(`Failed to update: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalContent;
    }
};

/**
 * Show confirmation modal.
 */
SimpleModal.showConfirm = function(title, message, callback) {
    this.confirmModal.title = title;
    this.confirmModal.message = message;
    this.confirmModal.callback = callback;

    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const modal = document.getElementById('fieldwork-confirm-modal');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (modal) modal.classList.remove('hidden');
};

/**
 * Hide confirmation modal.
 */
SimpleModal.hideConfirmModal = function() {
    const modal = document.getElementById('fieldwork-confirm-modal');
    if (modal) modal.classList.add('hidden');
    this.confirmModal.callback = null;
};

/**
 * Execute confirmed action.
 */
SimpleModal.confirmAction = function() {
    if (this.confirmModal.callback) {
        this.confirmModal.callback();
    }
    this.hideConfirmModal();
};

/**
 * Delete fieldwork entry with confirmation.
 */
SimpleModal.deleteFieldwork = async function(fieldworkId) {
    const fieldwork = this.fieldworkData.find(fw => fw.id === fieldworkId);
    if (!fieldwork) return;

    this.showConfirm(
        'Delete Time Entry',
        `Delete time entry for ${this.formatDate(fieldwork.work_date)}?\n\nThis action cannot be undone.`,
        async () => {
            try {
                const response = await fetch(`/api/fieldwork/${fieldworkId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    await this.fetchFieldworkData(this.currentJob.job_number);
                    this.refreshFieldworkDisplay();
                    this.showNotification('Time entry deleted successfully', 'success');
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to delete entry');
                }
            } catch (error) {
                console.error('Failed to delete fieldwork:', error);
                this.showNotification(`Failed to delete: ${error.message}`, 'error');
            }
        }
    );
};

