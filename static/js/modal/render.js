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
    const femaLink = this.generateFEMALink(job.address);
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
};

/**
 * Render the modal HTML.
 */
SimpleModal.renderModal = function(job, femaLink) {
    const modalHTML = `
        <div id="simpleJobModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style="z-index: 2000;">
            <!-- Backdrop -->
            <div class="absolute inset-0" onclick="SimpleModal.hide()"></div>

            <!-- Modal Content -->
            <div id="simpleJobModalContent" class="bg-white rounded-lg shadow-2xl p-6 w-11/12 max-w-lg relative max-h-[90vh] overflow-y-auto border border-gray-100">
                <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 hover:bg-gray-100 transition-colors" onclick="SimpleModal.hide()" aria-label="Close modal">x</button>

                <!-- Header Section -->
                <div class="mb-6 pb-4 border-b border-gray-200">
                    <h3 class="font-bold text-xl mb-3 text-gray-900">
                        <span class="font-mono text-primary">Job #${job.job_number || 'N/A'}</span>
                    </h3>
                    ${job.is_parcel_job ? `
                    <div class="mb-3">
                        <button class="btn btn-sm btn-primary" onclick="SimpleModal.openPromotion('${job.job_number}')" title="Upgrade to address job">
                            <i class="bi bi-arrow-up-right-square mr-1"></i>
                            Upgrade
                        </button>
                        <p class="text-xs text-gray-500 mt-1">Requires an address to replace parcel location.</p>
                    </div>
                    ` : ''}

                    <!-- Status and Total Time -->
                    <div class="flex justify-between items-center gap-4">
                        <div class="flex-1">
                            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                            <div id="status-view" style="display: block;">
                                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold cursor-pointer hover:opacity-90 transition-all shadow-sm"
                                     id="status-badge"
                                     style="background: ${window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d'};"
                                     onclick="SimpleModal.toggleEdit('status')"
                                     title="Click to edit">
                                    <span id="status-view-text">${window.MarkerUtils?.STATUS_NAMES[job.status] || job.status || 'Unknown Status'}</span>
                                    <i class="bi bi-pencil-square ml-1 text-xs opacity-75"></i>
                                </div>
                            </div>
                            <div id="status-edit" style="display: none;" class="flex items-center gap-2 mt-2">
                                <select id="status-select" class="select select-bordered select-sm flex-1">
                                    ${this.generateStatusOptions(job.status)}
                                </select>
                                <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('status')">
                                    <i class="bi bi-check-lg"></i>
                                </button>
                                <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('status')">
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
                        </div>

                        <div class="text-right flex-shrink-0">
                            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Total Time</label>
                            <div id="total-time-badge" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm"
                                 style="background: linear-gradient(135deg, #FF1393 0%, #e0117f 100%);">
                                <i class="bi bi-clock-history text-xs"></i>
                                <span>${this.formatDuration(this.getTotalFieldworkTime())}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="space-y-5">
                    <!-- Tags Section -->
                    <div class="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Tags</label>
                        <div id="modal-tags-container" class="flex flex-wrap gap-2 mb-3 min-h-[24px]">${this.generateTagsHTML(job)}</div>
                        <div class="relative">
                            <div class="flex gap-2 items-center">
                                <input id="modal-tag-input" class="input input-bordered input-sm flex-1 bg-white" placeholder="Type to search tags..."
                                       oninput="SimpleModal.updateTagSuggestions()" onfocus="SimpleModal.updateTagSuggestions()" onkeydown="if(event.key==='Enter') SimpleModal.addTag()">
                                <button class="btn btn-sm btn-primary" onclick="SimpleModal.addTag()">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                            </div>
                            <div id="modal-tag-suggestions" class="absolute z-20 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg" style="display:none;"></div>
                        </div>
                    </div>

                    <!-- Client Section -->
                    <div>
                        <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Client</label>
                        <div id="client-view" style="display: block;">
                            <div class="flex items-center justify-between group">
                                <p class="text-gray-900 font-medium cursor-pointer hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-gray-50 -mx-3 -my-2"
                                   onclick="SimpleModal.toggleEdit('client')"
                                   title="Click to edit">
                                    <span id="client-view-text">${job.client || 'N/A'}</span>
                                </p>
                                <button class="opacity-0 group-hover:opacity-100 transition-opacity btn btn-xs btn-ghost" onclick="SimpleModal.toggleEdit('client')" title="Edit client">
                                    <i class="bi bi-pencil-square text-gray-400"></i>
                                </button>
                            </div>
                        </div>
                        <div id="client-edit" style="display: none;" class="flex items-center gap-2 mt-2">
                            <input type="text"
                                   id="client-input"
                                   class="input input-bordered input-sm flex-1"
                                   value="${job.client || ''}"
                                   onkeypress="if(event.key === 'Enter') SimpleModal.saveField('client')"
                                   onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('client')">
                            <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('client')">
                                <i class="bi bi-check-lg"></i>
                            </button>
                            <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('client')">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Due Date Section -->
                    <div>
                        <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Due Date</label>
                        <div id="due_date-view" style="display: block;">
                            <div class="flex items-center justify-between group">
                                <p class="text-gray-900 font-medium cursor-pointer hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-gray-50 -mx-3 -my-2"
                                   onclick="SimpleModal.toggleEdit('due_date')"
                                   title="Click to edit">
                                    <span id="due_date-view-text">${job.due_date || 'None'}</span>
                                </p>
                                <button class="opacity-0 group-hover:opacity-100 transition-opacity btn btn-xs btn-ghost" onclick="SimpleModal.toggleEdit('due_date')" title="Edit due date">
                                    <i class="bi bi-pencil-square text-gray-400"></i>
                                </button>
                            </div>
                        </div>
                        <div id="due_date-edit" style="display: none;" class="flex items-center gap-2 mt-2">
                            <input type="date"
                                   id="due_date-input"
                                   class="input input-bordered input-sm flex-1"
                                   value="${job.due_date || ''}"
                                   onkeypress="if(event.key === 'Enter') SimpleModal.saveField('due_date')"
                                   onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('due_date')">
                            <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('due_date')">
                                <i class="bi bi-check-lg"></i>
                            </button>
                            <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('due_date')">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Address Section -->
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-100">
                        <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Location</label>
                        <div id="address-view" style="display: block;">
                            <div class="flex items-start gap-3">
                                <div class="flex-1">
                                    <p id="address-view-text" class="text-gray-900 font-medium leading-relaxed cursor-pointer hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-white -mx-3 -my-2"
                                       onclick="SimpleModal.toggleEdit('address')"
                                       title="Click to edit">
                                        ${job.address || 'N/A'}
                                    </p>
                                    <div class="mt-2">
                                        <span id="county-view-text" class="text-xs text-gray-500 font-medium">${job.county || 'N/A'} County</span>
                                    </div>
                                </div>
                                ${job.address && job.address !== 'N/A' ? `
                                    <button
                                        id="copyAddressBtn"
                                        data-address="${escapeHtml(job.address)}"
                                        onclick="SimpleModal.copyAddress(this.dataset.address)"
                                        class="btn btn-sm btn-primary flex-shrink-0"
                                        title="Copy address to clipboard">
                                        <i class="bi bi-clipboard mr-1"></i>
                                        <span id="copyBtnText">Copy</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        <div id="address-edit" style="display: none;" class="flex items-center gap-2 mt-2">
                            <input type="text" id="address-input" class="input input-bordered input-sm flex-1" value="${escapeHtml(job.address)}" onkeypress="if(event.key==='Enter') SimpleModal.saveField('address')" onkeydown="if(event.key==='Escape') SimpleModal.toggleEdit('address')">
                            <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('address')">
                                <i class="bi bi-check-lg"></i>
                            </button>
                            <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('address')">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>

                    ${femaLink ? `
                    <div>
                        <button
                            onclick="window.open('${femaLink}', '_blank')"
                            class="btn btn-sm btn-outline-primary w-full justify-center"
                            title="View FEMA Flood Zone">
                            <i class="bi bi-water mr-2"></i>
                            <span>View FEMA Flood Zone Map</span>
                            <i class="bi bi-box-arrow-up-right ml-2 text-xs"></i>
                        </button>
                    </div>
                    ` : ''}

                    <!-- Notes Section -->
                    <div>
                        <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Notes</label>
                        <div id="notes-view" style="display: ${job.notes ? 'block' : 'none'};">
                            <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <p class="text-gray-700 leading-relaxed cursor-pointer hover:text-primary transition-colors group"
                                   onclick="SimpleModal.toggleEdit('notes')"
                                   title="Click to edit">
                                    <span id="notes-view-text">${job.notes || 'No notes'}</span>
                                    <i class="bi bi-pencil-square ml-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" style="font-size: 12px;"></i>
                                </p>
                            </div>
                        </div>
                        <div id="notes-edit" style="display: none;" class="flex flex-col gap-2 mt-2">
                            <textarea id="notes-input"
                                   class="textarea textarea-bordered textarea-sm w-full"
                                   rows="4"
                                   placeholder="Add notes about this job..."
                                   onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('notes')">${job.notes || ''}</textarea>
                            <div class="flex items-center gap-2">
                                <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('notes')">
                                    <i class="bi bi-check-lg"></i> Save
                                </button>
                                <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('notes')">
                                    <i class="bi bi-x-lg"></i> Cancel
                                </button>
                            </div>
                        </div>
                        ${!job.notes ? `
                        <button class="btn btn-sm btn-outline-primary w-full mt-2" onclick="SimpleModal.toggleEdit('notes')" title="Add notes">
                            <i class="bi bi-plus-circle mr-1"></i> Add Notes
                        </button>
                        ` : ''}
                    </div>

                    <!-- Time Tracking Section -->
                    <div class="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <div class="flex items-center justify-between mb-3">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Time Tracking</label>
                            <button class="btn btn-sm btn-primary" onclick="SimpleModal.showAddFieldworkForm()" title="Add time entry">
                                <i class="bi bi-plus-circle mr-1"></i>
                                Add Entry
                            </button>
                        </div>
                        <div id="fieldwork-list" class="space-y-2">
                            ${this.generateFieldworkHTML()}
                        </div>
                    </div>
                </div>

                <div class="flex justify-end mt-8 pt-4 border-t border-gray-200">
                    <button class="btn btn-primary px-8" onclick="SimpleModal.hide()">Close</button>
                </div>
            </div>

            <!-- Confirmation Modal -->
            <div id="fieldwork-confirm-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden" style="z-index: 2001;">
                <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-md relative">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="SimpleModal.hideConfirmModal()">x</button>

                    <h3 id="confirm-title" class="font-bold text-lg mb-4 text-primary"></h3>

                    <p id="confirm-message" class="mb-6"></p>

                    <div class="flex justify-end space-x-3">
                        <button type="button" class="btn btn-ghost" onclick="SimpleModal.hideConfirmModal()">
                            Cancel
                        </button>
                        <button type="button" class="btn btn-error" onclick="SimpleModal.confirmAction()">
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            <!-- Promotion Modal (Upgrade) -->
            <div id="promotion-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden" style="z-index: 2002;">
                <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-md relative">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="SimpleModal.closePromotion()">x</button>
                    <h3 class="font-bold text-lg mb-4 text-primary">Upgrade to Address Job</h3>
                    <div class="mb-3">
                        <label class="block text-gray-600 text-sm font-medium mb-2">Address *</label>
                        <input type="text" id="promotion-address-input" class="input input-bordered w-full" placeholder="Enter full address" />
                    </div>
                    <div class="flex justify-end space-x-3 mt-2">
                        <button type="button" class="btn btn-ghost" onclick="SimpleModal.closePromotion()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="SimpleModal.submitPromotion()">Upgrade</button>
                    </div>
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
    const modal = document.getElementById('simpleJobModal');
    if (modal) {
        modal.remove();
    }
    document.body.style.overflow = '';
};

// Global exports for backward compatibility
window.openJobModal = SimpleModal.show.bind(SimpleModal);
window.closeJobModal = SimpleModal.hide.bind(SimpleModal);

