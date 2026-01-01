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
            <div class="text-center py-4 text-gray-400">
                <i class="bi bi-hourglass-split"></i> Loading fieldwork...
            </div>
        `;
    }
    if (this.fieldworkData.length === 0) {
        return `
            <div class="text-center py-4 text-gray-500">
                <i class="bi bi-clock-history text-2xl mb-2"></i>
                <p>No time entries recorded</p>
            </div>
        `;
    }

    return this.fieldworkData.map((fw, index) => `
        <div class="border border-gray-200 rounded-lg p-3 mb-2 hover:bg-gray-50 transition-colors">
            <div class="flex justify-between items-center">
                <div class="flex-1">
                    <div class="font-medium text-gray-900">
                        ${index + 1}. ${this.formatDate(fw.work_date)} - ${this.formatDuration(fw.total_time)}
                    </div>
                </div>
                <div class="flex gap-1 ml-3">
                    <button class="btn btn-sm btn-ghost" onclick="SimpleModal.editFieldwork(${fw.id})" title="Edit entry">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-ghost text-red-600 hover:bg-red-50" onclick="SimpleModal.deleteFieldwork(${fw.id})" title="Delete entry">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
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
        <div id="fieldwork-form" class="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h5 class="font-medium text-gray-800 mb-3">Add Time Entry</h5>

            <div class="grid grid-cols-1 gap-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
                        <input type="date" id="fw-work-date" class="input input-bordered input-md w-full" value="${today}" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Total Time (Hours:Minutes)</label>
                        <input type="text" id="fw-total-time" class="input input-bordered input-md w-full" placeholder="2:30" pattern="[0-9]+:[0-5][0-9]" required>
                        <p class="text-xs text-gray-500 mt-1">Format: H:MM (e.g., 2:30)</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Crew</label>
                        <input type="text" id="fw-crew" class="input input-bordered input-md w-full" placeholder="Optional">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Drone Card</label>
                        <input type="text" id="fw-drone-card" class="input input-bordered input-md w-full" placeholder="Optional">
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea id="fw-notes" class="textarea textarea-bordered w-full" placeholder="Optional notes" rows="2"></textarea>
                </div>

                <div class="flex gap-2 pt-2">
                    <button id="fw-save-btn" class="btn btn-md btn-success flex-1" onclick="SimpleModal.saveFieldwork()">
                        <i class="bi bi-check-lg mr-1"></i>
                        Save Entry
                    </button>
                    <button class="btn btn-md btn-ghost" onclick="SimpleModal.hideAddFieldworkForm()">
                        <i class="bi bi-x-lg mr-1"></i>
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
        this.showNotification('Invalid time format. Use H:MM (e.g., 2:30)', 'error');
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
        <div id="edit-fieldwork-form" class="mt-4 p-4 border border-gray-200 rounded-lg bg-blue-50">
            <h5 class="font-medium text-gray-800 mb-3">Edit Time Entry</h5>

            <div class="grid grid-cols-1 gap-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
                        <input type="date" id="edit-fw-work-date" class="input input-bordered input-md w-full" value="${fieldwork.work_date}" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Total Time (Hours:Minutes)</label>
                        <input type="text" id="edit-fw-total-time" class="input input-bordered input-md w-full" value="${timeDisplay}" placeholder="2:30" pattern="[0-9]+:[0-5][0-9]" required>
                        <p class="text-xs text-gray-500 mt-1">Format: H:MM (e.g., 2:30)</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Crew</label>
                        <input type="text" id="edit-fw-crew" class="input input-bordered input-md w-full" value="${escapeHtml(fieldwork.crew)}" placeholder="Optional">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Drone Card</label>
                        <input type="text" id="edit-fw-drone-card" class="input input-bordered input-md w-full" value="${escapeHtml(fieldwork.drone_card)}" placeholder="Optional">
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea id="edit-fw-notes" class="textarea textarea-bordered w-full" placeholder="Optional notes" rows="2">${escapeHtml(fieldwork.notes)}</textarea>
                </div>

                <div class="flex gap-2 pt-2">
                    <button id="edit-fw-save-btn" class="btn btn-md btn-success flex-1" onclick="SimpleModal.saveEditFieldwork(${fieldworkId})">
                        <i class="bi bi-check-lg mr-1"></i>
                        Save Changes
                    </button>
                    <button class="btn btn-md btn-ghost" onclick="SimpleModal.hideEditFieldworkForm()">
                        <i class="bi bi-x-lg mr-1"></i>
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
        this.showNotification('Invalid time format. Use H:MM (e.g., 2:30)', 'error');
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

    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;

    document.getElementById('fieldwork-confirm-modal').classList.remove('hidden');
};

/**
 * Hide confirmation modal.
 */
SimpleModal.hideConfirmModal = function() {
    document.getElementById('fieldwork-confirm-modal').classList.add('hidden');
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

