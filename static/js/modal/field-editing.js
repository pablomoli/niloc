/**
 * Modal Field Editing Module
 * Toggle edit mode and save field updates.
 */

/**
 * Toggle edit mode for a field.
 */
SimpleModal.toggleEdit = function(field) {
    const viewElement = document.getElementById(`${field}-view`);
    const editElement = document.getElementById(`${field}-edit`);

    if (viewElement && editElement) {
        const isEditing = editElement.style.display !== 'none';

        if (isEditing) {
            // Cancel edit
            viewElement.style.display = 'block';
            editElement.style.display = 'none';

            // Reset values
            if (field === 'status') {
                const select = document.getElementById('status-select');
                if (select) select.value = this.currentJob.status;
            } else if (field === 'client') {
                const input = document.getElementById('client-input');
                if (input) input.value = this.currentJob.client;
            } else if (field === 'due_date') {
                const input = document.getElementById('due_date-input');
                if (input) input.value = this.currentJob.due_date || '';
            } else if (field === 'address') {
                const input = document.getElementById('address-input');
                if (input) input.value = this.currentJob.address || '';
            } else if (field === 'notes') {
                const textarea = document.getElementById('notes-input');
                if (textarea) textarea.value = this.currentJob.notes || '';
            } else if (field === 'street_name') {
                const input = document.getElementById('street_name-input');
                if (input) input.value = this.getParcelStreetName(this.currentJob) || '';
            }
        } else {
            // Enter edit mode
            viewElement.style.display = 'none';
            editElement.style.display = 'block';

            // Focus input
            if (field === 'client') {
                const input = document.getElementById('client-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            } else if (field === 'due_date') {
                const input = document.getElementById('due_date-input');
                if (input) {
                    input.focus();
                }
            } else if (field === 'address') {
                const input = document.getElementById('address-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            } else if (field === 'notes') {
                const textarea = document.getElementById('notes-input');
                if (textarea) {
                    setTimeout(() => {
                        textarea.focus();
                        if (textarea.value) {
                            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                        }
                    }, 50);
                }
            } else if (field === 'street_name') {
                const input = document.getElementById('street_name-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            }
        }
    }
};

/**
 * Save field update.
 */
SimpleModal.saveField = async function(field) {
    let newValue;
    let endpoint = `/api/jobs/${this.currentJob.job_number}`;

    // Get the new value
    if (field === 'status') {
        const select = document.getElementById('status-select');
        newValue = select ? select.value : null;
    } else if (field === 'client') {
        const input = document.getElementById('client-input');
        newValue = input ? input.value.trim() : null;
    } else if (field === 'due_date') {
        const input = document.getElementById('due_date-input');
        newValue = input ? input.value : null;
    } else if (field === 'address') {
        const input = document.getElementById('address-input');
        newValue = input ? input.value.trim() : null;
    } else if (field === 'notes') {
        const textarea = document.getElementById('notes-input');
        newValue = textarea ? textarea.value.trim() : null;
    } else if (field === 'street_name') {
        const input = document.getElementById('street_name-input');
        newValue = input ? input.value.trim() : null;
    }

    if (field !== 'notes' && field !== 'due_date' && field !== 'street_name' && !newValue) {
        this.showNotification('Value cannot be empty', 'error');
        return;
    }

    // Show loading state
    const saveBtn = document.querySelector(`#${field}-edit .btn-success`);
    const originalContent = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    }

    try {
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ [field]: newValue })
        });

        if (response.ok) {
            const data = await response.json();

            // Update current job data
            this.currentJob[field] = newValue;

            // Update the job in AppState cache if available
            if (window.AppState) {
                const allJobsIndex = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (allJobsIndex !== -1) {
                    if (data.job) {
                        window.AppState.allJobs[allJobsIndex] = data.job;
                        this.currentJob = { ...data.job };
                    } else {
                        window.AppState.allJobs[allJobsIndex][field] = newValue;
                    }
                }

                const filteredIndex = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (filteredIndex !== -1) {
                    if (data.job) {
                        window.AppState.filteredJobs[filteredIndex] = data.job;
                    } else {
                        window.AppState.filteredJobs[filteredIndex][field] = newValue;
                    }
                }
            }

            // Update view based on field
            if (field === 'status') {
                const statusBadge = document.getElementById('status-badge');
                const statusText = document.getElementById('status-view-text');
                if (statusBadge) {
                    const color = window.AdminUtils?.getStatusColor(newValue)
                        || window.MarkerUtils?.EPIC_COLORS[newValue]
                        || '#6c757d';
                    const textClass = window.AdminUtils?.getTextColorClass(color) || 'tag-text-light';
                    statusBadge.style.background = color;
                    statusBadge.classList.remove('tag-text-dark', 'tag-text-light');
                    statusBadge.classList.add(textClass);
                }
                if (statusText) {
                    statusText.textContent = newValue;
                }
            } else if (field === 'due_date') {
                const dueDateText = document.getElementById('due_date-view-text');
                const updatedDueDate = (data.job && data.job.due_date !== undefined)
                    ? data.job.due_date
                    : newValue;
                if (dueDateText) {
                    dueDateText.textContent = updatedDueDate || 'None';
                }
            } else if (field === 'client') {
                const clientText = document.getElementById('client-view-text');
                if (clientText) {
                    clientText.textContent = newValue;
                }
            } else if (field === 'address') {
                const addrText = document.getElementById('address-view-text');
                const copyBtn = document.getElementById('copyAddressBtn');
                const updatedAddr = (data.job && data.job.address) ? data.job.address : newValue;
                if (addrText) addrText.textContent = updatedAddr;
                if (copyBtn) {
                    copyBtn.dataset.address = updatedAddr || '';
                    copyBtn.onclick = function() {
                        SimpleModal.copyAddress(this.dataset.address);
                    };
                }
                if (data.job && data.job.county) {
                    const countyEl = document.getElementById('county-view-text');
                    if (countyEl) countyEl.textContent = `${data.job.county} County`;
                }
            } else if (field === 'notes') {
                const viewText = document.getElementById('notes-view-text');
                const viewDiv = document.getElementById('notes-view');
                if (viewText) {
                    viewText.textContent = newValue || 'No notes';
                }
                if (viewDiv) {
                    viewDiv.style.display = newValue ? 'block' : 'none';
                }
                this.currentJob.notes = newValue || null;
            } else if (field === 'street_name') {
                const viewText = document.getElementById('street_name-view-text');
                if (viewText) {
                    viewText.textContent = newValue || 'No street name';
                }
                // Update parcel_data in currentJob
                if (this.currentJob.parcel_data) {
                    this.currentJob.parcel_data.street_name = newValue || null;
                }
            }

            // Invalidate cache
            if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/jobs');
                window.ApiCache.invalidateMatching('/admin/api/dashboard');
            }

            this.toggleEdit(field);

            this.showNotification(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`, 'success');

            // Update marker on map if status or address changed
            if ((field === 'status' || field === 'address') && window.updateJobMarker) {
                const jobToUpdate = data.job || this.currentJob;
                window.updateJobMarker(this.currentJob.job_number, jobToUpdate);
            }

        } else {
            const error = await response.json();
            throw new Error(error.error || 'Update failed');
        }
    } catch (error) {
        console.error(`Failed to update ${field}:`, error);
        this.showNotification(`Failed to update ${field}: ${error.message}`, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalContent;
        }
    }
};
