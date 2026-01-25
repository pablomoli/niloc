/**
 * Modal Render Module
 * Modal HTML rendering and display.
 */

/**
 * Show the job modal.
 */
SimpleModal.show = function(job) {
    this.currentJob = { ...job };
    this.fieldworkLoaded = false;
    this.nearbyJobsLoaded = false;
    this.nearbyJobs = [];
    const femaLink = this.generateFEMALink(job.lat, job.long);
    // Render immediately with placeholders
    this.renderModal(job, femaLink);
    // Warm tags cache
    this.fetchAllTags();
    // Load fieldwork and refresh section
    this.fetchFieldworkData(job.job_number).then(() => {
        this.fieldworkLoaded = true;
        this.refreshFieldworkDisplay();
        this.updateTotalTimeDisplay();
    });
    // Load nearby jobs
    this.fetchNearbyJobs(job.job_number).then(() => {
        this.refreshNearbyJobsDisplay();
    });

    // Add escape key handler
    this._escapeHandler = (e) => {
        if (e.key === 'Escape') {
            // Check if nested modals are open first
            const confirmModal = document.getElementById('fieldwork-confirm-modal');
            const promotionModal = document.getElementById('promotion-modal');
            if (confirmModal && !confirmModal.classList.contains('hidden')) {
                this.hideConfirmModal();
                e.preventDefault();
                return;
            }
            if (promotionModal && !promotionModal.classList.contains('hidden')) {
                this.closePromotion();
                e.preventDefault();
                return;
            }
            // Close main modal
            this.hide();
            e.preventDefault();
        }
    };
    document.addEventListener('keydown', this._escapeHandler);
};

/**
 * Render the modal HTML.
 */
SimpleModal.renderModal = function(job, femaLink) {
    const statusColor = window.AdminUtils?.getStatusColor(job.status)
        || window.MarkerUtils?.EPIC_COLORS[job.status]
        || '#6c757d';
    const statusTextClass = window.AdminUtils?.getTextColorClass(statusColor) || 'tag-text-light';
    const statusDisplayName = window.MarkerUtils?.STATUS_NAMES[job.status] || job.status || 'Unknown Status';
    const modalHTML = `
        <div id="simpleJobModal" class="epic-modal-backdrop" onclick="if(event.target === this) SimpleModal.hide()">
            <!-- Modal Content -->
            <div class="epic-modal modal-lg">
                <!-- Header -->
                <div class="epic-modal-header">
                    <div class="epic-modal-subtitle">Job Details</div>
                    <div style="display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;">
                        <h3 class="epic-modal-title font-mono" style="margin: 0;">#${job.job_number || 'N/A'}</h3>
                        <div id="client-header" style="flex: 1; min-width: 0;">
                            <div id="client-view" style="display: block;">
                                <span id="client-view-text" class="epic-modal-client" onclick="SimpleModal.toggleEdit('client')" title="Click to edit">${escapeHtml(job.client) || 'N/A'}</span>
                            </div>
                            <div id="client-edit" style="display: none;">
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="text"
                                           id="client-input"
                                           class="epic-input"
                                           style="font-size: 1rem;"
                                           value="${escapeHtml(job.client) || ''}"
                                           onkeypress="if(event.key === 'Enter') SimpleModal.saveField('client')"
                                           onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('client')">
                                    <button class="epic-btn epic-btn-success epic-btn-icon" onclick="SimpleModal.saveField('client')">
                                        <i class="bi bi-check-lg"></i>
                                    </button>
                                    <button class="epic-btn epic-btn-ghost epic-btn-icon" onclick="SimpleModal.toggleEdit('client')">
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${job.is_parcel_job ? `
                    <div style="margin-top: 12px;">
                        <button class="epic-btn epic-btn-primary epic-btn-sm" onclick="SimpleModal.openPromotion('${job.job_number}')" title="Upgrade to address job">
                            <i class="bi bi-arrow-up-right-square"></i>
                            Upgrade to Address
                        </button>
                    </div>
                    ` : ''}
                    <button class="epic-modal-close" onclick="SimpleModal.hide()" aria-label="Close modal">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <!-- Body -->
                <div class="epic-modal-body" id="simpleJobModalContent">
                    <!-- Status, Due Date, and Total Time Row -->
                    <div class="epic-form-section" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                        <div>
                            <label class="epic-form-label">Status</label>
                            <div id="status-view" style="display: block;">
                                <div class="epic-status-badge ${statusTextClass}"
                                     id="status-badge"
                                     style="background: ${statusColor};"
                                     onclick="SimpleModal.toggleEdit('status')"
                                     title="Click to edit">
                                    <span id="status-view-text">${statusDisplayName}</span>
                                    <i class="bi bi-pencil-square edit-icon"></i>
                                </div>
                            </div>
                            <div id="status-edit" style="display: none; margin-top: 8px;">
                                <div style="display: inline-flex; gap: 6px; align-items: center;">
                                    <select id="status-select" class="epic-input epic-select" style="width: auto; min-width: 180px;">
                                        ${this.generateStatusOptions(job.status)}
                                    </select>
                                    <button class="epic-btn epic-btn-success epic-btn-icon" style="padding: 8px;" onclick="SimpleModal.saveField('status')">
                                        <i class="bi bi-check-lg"></i>
                                    </button>
                                    <button class="epic-btn epic-btn-ghost epic-btn-icon" style="padding: 8px;" onclick="SimpleModal.toggleEdit('status')">
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style="text-align: center;">
                            <label class="epic-form-label">Due Date</label>
                            <div id="due_date-view" style="display: block;">
                                <div class="epic-due-date-badge ${!job.due_date ? 'not-set' : ''}" onclick="SimpleModal.toggleEdit('due_date')" title="Click to edit">
                                    <i class="bi bi-calendar-event"></i>
                                    <span id="due_date-view-text">${job.due_date || 'Not set'}</span>
                                </div>
                            </div>
                            <div id="due_date-edit" style="display: none; margin-top: 8px;">
                                <div style="display: inline-flex; gap: 6px; align-items: center;">
                                    <input type="date"
                                           id="due_date-input"
                                           class="epic-input"
                                           style="width: auto;"
                                           value="${job.due_date || ''}"
                                           onkeypress="if(event.key === 'Enter') SimpleModal.saveField('due_date')"
                                           onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('due_date')">
                                    <button class="epic-btn epic-btn-success epic-btn-icon" style="padding: 8px;" onclick="SimpleModal.saveField('due_date')">
                                        <i class="bi bi-check-lg"></i>
                                    </button>
                                    <button class="epic-btn epic-btn-ghost epic-btn-icon" style="padding: 8px;" onclick="SimpleModal.toggleEdit('due_date')">
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style="text-align: right; flex-shrink: 0;">
                            <label class="epic-form-label">Total Time</label>
                            <div id="total-time-badge" class="epic-time-badge">
                                <i class="bi bi-clock-history"></i>
                                <span>${this.formatDuration(this.getTotalFieldworkTime())}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Tags Section -->
                    <div class="epic-form-section">
                        <div class="epic-data-card accent-pink">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
                                <label class="epic-form-label" style="margin: 0; flex-shrink: 0;">Tags</label>
                                <div style="position: relative; flex: 1; max-width: 280px;">
                                    <div style="display: flex; gap: 8px; align-items: center;">
                                        <input id="modal-tag-input" class="epic-input" style="flex: 1; font-size: 0.875rem;" placeholder="Search or add..."
                                               oninput="SimpleModal.updateTagSuggestions()" onfocus="SimpleModal.updateTagSuggestions()" onkeydown="if(event.key==='Enter') SimpleModal.addTag()">
                                        <button class="epic-btn epic-btn-primary epic-btn-icon" style="padding: 8px;" onclick="SimpleModal.addTag()">
                                            <i class="bi bi-plus-lg"></i>
                                        </button>
                                    </div>
                                    <div id="modal-tag-suggestions" class="absolute z-20 mt-2 w-full bg-white rounded-xl border border-gray-200 shadow-xl max-h-60 overflow-auto" style="display:none;"></div>
                                </div>
                            </div>
                            <div id="modal-tags-container" style="display: flex; flex-wrap: wrap; gap: 10px; min-height: 32px;">${this.generateTagsHTML(job)}</div>
                        </div>
                    </div>

                    <!-- Address Section -->
                    <div class="epic-form-section">
                        <div class="epic-data-card accent-blue">
                            <label class="epic-form-label">Location</label>
                            ${job.is_parcel_job ? `
                            <!-- Parcel Job Location Display -->
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div id="street_name-view" style="display: flex; align-items: center; gap: 8px;">
                                    <i class="bi bi-signpost-2" style="color: #6b7280;"></i>
                                    <div class="epic-editable-field" onclick="SimpleModal.toggleEdit('street_name')" title="Click to edit" style="margin: 0; flex: 1;">
                                        <span id="street_name-view-text" class="field-value" style="font-weight: 500;">${escapeHtml(this.getParcelStreetName(job)) || 'No street name'}</span>
                                        <i class="bi bi-pencil-square edit-indicator"></i>
                                    </div>
                                </div>
                                <div id="street_name-edit" style="display: none;">
                                    <div style="display: flex; gap: 8px; align-items: center;">
                                        <input type="text" id="street_name-input" class="epic-input" value="${escapeHtml(this.getParcelStreetName(job)) || ''}" placeholder="Enter street name" onkeypress="if(event.key==='Enter') SimpleModal.saveField('street_name')" onkeydown="if(event.key==='Escape') SimpleModal.toggleEdit('street_name')">
                                        <button class="epic-btn epic-btn-success epic-btn-icon" onclick="SimpleModal.saveField('street_name')">
                                            <i class="bi bi-check-lg"></i>
                                        </button>
                                        <button class="epic-btn epic-btn-ghost epic-btn-icon" onclick="SimpleModal.toggleEdit('street_name')">
                                            <i class="bi bi-x-lg"></i>
                                        </button>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <i class="bi bi-map" style="color: #6b7280;"></i>
                                    <span class="font-mono" style="font-size: 0.875rem;">${escapeHtml(job.parcel_data?.parcel_id || 'N/A')}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <i class="bi bi-geo-alt" style="color: #6b7280;"></i>
                                    <span style="font-size: 0.875rem; color: #6b7280;">${escapeHtml(job.county) || 'N/A'} County</span>
                                </div>
                            </div>
                            ` : `
                            <!-- Address Job Location Display -->
                            <div id="address-view" style="display: block;">
                                <div style="display: flex; align-items: flex-start; gap: 12px;">
                                    <div style="flex: 1;">
                                        <div class="epic-editable-field" onclick="SimpleModal.toggleEdit('address')" title="Click to edit" style="margin: 0;">
                                            <span id="address-view-text" class="field-value" style="line-height: 1.5;">${escapeHtml(job.address) || 'N/A'}</span>
                                            <i class="bi bi-pencil-square edit-indicator"></i>
                                        </div>
                                        <div style="margin-top: 8px;">
                                            <span id="county-view-text" class="font-mono" style="font-size: 0.75rem; color: #6b7280; font-weight: 500;">${escapeHtml(job.county) || 'N/A'} County</span>
                                        </div>
                                    </div>
                                    ${job.address && job.address !== 'N/A' ? `
                                        <button
                                            id="copyAddressBtn"
                                            data-address="${escapeHtml(job.address)}"
                                            onclick="SimpleModal.copyAddress(this.dataset.address)"
                                            class="epic-btn epic-btn-primary epic-btn-sm"
                                            style="flex-shrink: 0;"
                                            title="Copy address to clipboard">
                                            <i class="bi bi-clipboard"></i>
                                            <span id="copyBtnText">Copy</span>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <div id="address-edit" style="display: none; margin-top: 12px;">
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="text" id="address-input" class="epic-input" value="${escapeHtml(job.address)}" onkeypress="if(event.key==='Enter') SimpleModal.saveField('address')" onkeydown="if(event.key==='Escape') SimpleModal.toggleEdit('address')">
                                    <button class="epic-btn epic-btn-success epic-btn-icon" onclick="SimpleModal.saveField('address')">
                                        <i class="bi bi-check-lg"></i>
                                    </button>
                                    <button class="epic-btn epic-btn-ghost epic-btn-icon" onclick="SimpleModal.toggleEdit('address')">
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            </div>
                            `}
                        </div>
                    </div>

                    ${(femaLink || job.prop_appr_link) ? `
                    <div class="epic-form-section">
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            ${femaLink ? `
                            <button
                                onclick="window.open('${femaLink}', '_blank')"
                                class="epic-btn epic-btn-secondary"
                                style="flex: 1; min-width: 140px; justify-content: center;"
                                title="View FEMA Flood Zone">
                                <i class="bi bi-water"></i>
                                <span>FEMA Flood Zone</span>
                                <i class="bi bi-box-arrow-up-right" style="font-size: 0.75rem; opacity: 0.7;"></i>
                            </button>
                            ` : ''}
                            ${job.prop_appr_link ? `
                            <button
                                onclick="window.open('${job.prop_appr_link}', '_blank')"
                                class="epic-btn epic-btn-secondary"
                                style="flex: 1; min-width: 140px; justify-content: center;"
                                title="View Property Appraiser">
                                <i class="bi bi-building"></i>
                                <span>Property Appraiser</span>
                                <i class="bi bi-box-arrow-up-right" style="font-size: 0.75rem; opacity: 0.7;"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Notes Section -->
                    <div class="epic-form-section">
                        <label class="epic-form-label">Notes</label>
                        <div id="notes-view" style="display: ${job.notes ? 'block' : 'none'};">
                            <div class="epic-data-card interactive" onclick="SimpleModal.toggleEdit('notes')" title="Click to edit">
                                <p id="notes-view-text" style="margin: 0; color: #374151; line-height: 1.6; font-size: 0.9375rem;">${escapeHtml(job.notes) || 'No notes'}</p>
                            </div>
                        </div>
                        <div id="notes-edit" style="display: none; margin-top: 8px;">
                            <textarea id="notes-input"
                                   class="epic-input epic-textarea"
                                   placeholder="Add notes about this job..."
                                   onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('notes')">${escapeHtml(job.notes) || ''}</textarea>
                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <button class="epic-btn epic-btn-success epic-btn-sm" onclick="SimpleModal.saveField('notes')">
                                    <i class="bi bi-check-lg"></i> Save
                                </button>
                                <button class="epic-btn epic-btn-ghost epic-btn-sm" onclick="SimpleModal.toggleEdit('notes')">
                                    <i class="bi bi-x-lg"></i> Cancel
                                </button>
                            </div>
                        </div>
                        ${!job.notes ? `
                        <button class="epic-btn epic-btn-secondary epic-btn-sm" style="width: 100%; margin-top: 8px;" onclick="SimpleModal.toggleEdit('notes')" title="Add notes">
                            <i class="bi bi-plus-circle"></i> Add Notes
                        </button>
                        ` : ''}
                    </div>

                    <!-- Links Section -->
                    <div class="epic-form-section">
                        <div class="epic-data-card accent-purple">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                <label class="epic-form-label" style="margin: 0;">Links</label>
                                <button class="epic-btn epic-btn-primary epic-btn-sm" onclick="SimpleModal.showAddLinkForm()" title="Add link">
                                    <i class="bi bi-plus-circle"></i>
                                    Add Link
                                </button>
                            </div>
                            <div id="links-list" style="display: flex; flex-direction: column; gap: 8px;">
                                ${this.generateLinksHTML(job)}
                            </div>
                            <div id="add-link-form" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    <input type="text" id="link-display-name-input" class="epic-input" placeholder="Display name (e.g., Property Appraiser)" />
                                    <input type="url" id="link-url-input" class="epic-input" placeholder="https://..." />
                                    <div style="display: flex; gap: 8px; margin-top: 4px;">
                                        <button class="epic-btn epic-btn-success epic-btn-sm" onclick="SimpleModal.addLink()">
                                            <i class="bi bi-check-lg"></i> Add
                                        </button>
                                        <button class="epic-btn epic-btn-ghost epic-btn-sm" onclick="SimpleModal.hideAddLinkForm()">
                                            <i class="bi bi-x-lg"></i> Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Nearby Jobs Section -->
                    <div class="epic-form-section">
                        <div class="epic-data-card accent-green">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                <label class="epic-form-label" style="margin: 0;">
                                    <i class="bi bi-geo-alt" style="margin-right: 4px;"></i>
                                    Nearby Jobs
                                    <span style="font-weight: normal; color: #6b7280; font-size: 0.75rem; margin-left: 4px;">(0.5 mi)</span>
                                </label>
                                <button id="reveal-nearby-btn" class="epic-btn epic-btn-sm" style="background: #10b981; color: white; display: none;" onclick="SimpleModal.revealNearbyOnMap()" title="Show nearby jobs on the map">
                                    <i class="bi bi-map"></i>
                                    Reveal on Map
                                </button>
                            </div>
                            <div id="nearby-jobs-list" style="display: flex; flex-direction: column; gap: 6px;">
                                <div class="text-gray-500 text-sm">Loading nearby jobs...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Time Tracking Section -->
                    <div class="epic-form-section">
                        <div class="epic-data-card">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                                <label class="epic-form-label" style="margin: 0;">Time Tracking</label>
                                <button class="epic-btn epic-btn-primary epic-btn-sm" onclick="SimpleModal.showAddFieldworkForm()" title="Add time entry">
                                    <i class="bi bi-plus-circle"></i>
                                    Add Entry
                                </button>
                            </div>
                            <div id="fieldwork-list" style="display: flex; flex-direction: column; gap: 8px;">
                                ${this.generateFieldworkHTML()}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="epic-modal-footer">
                    <button class="epic-btn epic-btn-primary" onclick="SimpleModal.hide()">Done</button>
                </div>
            </div>
        </div>

        <!-- Confirmation Modal (sibling, not nested) -->
        <div id="fieldwork-confirm-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden" style="z-index: 2001;" onclick="if(event.target === this) SimpleModal.hideConfirmModal()">
            <div class="epic-modal modal-danger" style="max-width: 400px;">
                <div class="epic-modal-header">
                    <h3 id="confirm-title" class="epic-modal-title"></h3>
                    <button class="epic-modal-close" onclick="SimpleModal.hideConfirmModal()">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                <div class="epic-modal-body">
                    <p id="confirm-message" style="margin: 0; color: #374151; line-height: 1.6;"></p>
                </div>
                <div class="epic-modal-footer">
                    <button class="epic-btn epic-btn-ghost" onclick="SimpleModal.hideConfirmModal()">Cancel</button>
                    <button class="epic-btn epic-btn-danger" onclick="SimpleModal.confirmAction()">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>

        <!-- Promotion Modal (sibling, not nested) -->
        <div id="promotion-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden" style="z-index: 2002;" onclick="if(event.target === this) SimpleModal.closePromotion()">
            <div class="epic-modal" style="max-width: 420px;">
                <div class="epic-modal-header">
                    <div class="epic-modal-subtitle">Parcel Job</div>
                    <h3 class="epic-modal-title">Upgrade to Address</h3>
                    <button class="epic-modal-close" onclick="SimpleModal.closePromotion()">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                <div class="epic-modal-body">
                    <div class="epic-form-section">
                        <label class="epic-form-label required">Address</label>
                        <input type="text" id="promotion-address-input" class="epic-input" placeholder="Enter full street address" />
                    </div>
                </div>
                <div class="epic-modal-footer">
                    <button class="epic-btn epic-btn-ghost" onclick="SimpleModal.closePromotion()">Cancel</button>
                    <button class="epic-btn epic-btn-success" onclick="SimpleModal.submitPromotion()">
                        <i class="bi bi-arrow-up-right-square"></i> Upgrade
                    </button>
                </div>
            </div>
        </div>
    `;

    // Remove any existing modal
    const existing = document.getElementById('simpleJobModal');
    if (existing) {
        existing.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add custom styles for status dropdown
    const styleElement = document.createElement('style');
    styleElement.id = 'status-dropdown-styles';
    styleElement.textContent = `
        #status-select option {
            padding: 8px;
            position: relative;
        }
        #status-select option:before {
            content: '|';
            margin-right: 8px;
        }
        ${Object.entries(window.MarkerUtils?.EPIC_COLORS || {}).map(([status, color]) => `
            #status-select option[value="${status}"]:before {
                color: ${color};
            }
        `).join('')}
    `;

    // Remove existing styles if any
    const existingStyles = document.getElementById('status-dropdown-styles');
    if (existingStyles) {
        existingStyles.remove();
    }
    document.head.appendChild(styleElement);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
};

/**
 * Hide the modal.
 */
SimpleModal.hide = function() {
    // Remove escape key handler
    if (this._escapeHandler) {
        document.removeEventListener('keydown', this._escapeHandler);
        this._escapeHandler = null;
    }

    // Clear nearby job highlights from map
    if (this.clearNearbyHighlights) {
        this.clearNearbyHighlights();
    }

    const modal = document.getElementById('simpleJobModal');
    if (modal) {
        modal.remove();
    }
    // Also remove sibling modals
    const confirmModal = document.getElementById('fieldwork-confirm-modal');
    if (confirmModal) {
        confirmModal.remove();
    }
    const promotionModal = document.getElementById('promotion-modal');
    if (promotionModal) {
        promotionModal.remove();
    }
    document.body.style.overflow = '';
};

// Global exports for backward compatibility
window.openJobModal = SimpleModal.show.bind(SimpleModal);
window.closeJobModal = SimpleModal.hide.bind(SimpleModal);
