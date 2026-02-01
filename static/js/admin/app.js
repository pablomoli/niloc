/**
 * Admin App Component
 * Main Alpine.js data component for the admin dashboard.
 *
 * Dependencies:
 * - static/js/admin/utils.js
 * - static/js/admin/notifications.js
 * - static/js/admin/poi-icon-picker.js
 */

window.adminAppComponent = function() {
  return {
    activeTab: "dashboard",

    // Data
    jobs: [],
    users: [],
    filteredUsers: [],
    filteredJobs: [],
    deletedJobs: [],
    filteredDeletedJobs: [],
    userSearch: '',
    userSortField: 'username',
    userSortAsc: true,
    deletedSortField: 'deleted_at',
    deletedSortAsc: false,
    tags: [],
    tagsLoaded: false,
    tagsIncludeUsage: false,
    _tagsPromise: null,
    pois: [],
    poiIconChoices: [
      'bi-building',
      'bi-geo-alt',
      'bi-house',
      'bi-briefcase',
      'bi-hospital',
      'bi-cone-striped',
      'bi-tree',
      'bi-bank',
      'bi-pin-map'
    ],
    poisLoaded: false,
    _loadingPois: false,
    _creatingPoi: false,
    _savingPoi: null,
    newPoi: { name: '', address: '', icon: 'bi-geo-alt', color: '#3b82f6' },
    dashboardLoaded: false,
    jobsLoaded: false,
    usersLoaded: false,
    deletedJobsLoaded: false,
    _loadingDashboard: false,
    _loadingJobs: false,
    _loadingUsers: false,
    _loadingDeletedJobs: false,
    _dashboardPromise: null,
    _jobsPromise: null,
    _usersPromise: null,
    _deletedJobsPromise: null,
    defaultJobsPerPage: 100,
    jobsMeta: {
      total: 0,
      perPage: 0,
      currentPage: 0,
      pages: 0,
      hasNext: false,
    },
    jobsLoadedAll: false,

    // Tag modal state
    jobTagsModal: { job: null, input: '' },
    tagSuggestions: [],

    // Filters
    jobSearch: "",
    deletedJobSearch: "",
    // Multi-status filter
    statuses: [
      "On Hold/Pending Estimate",
      "Cancelled/Declined",
      "Needs Fieldwork",
      "Fieldwork Complete",
      "To Be Printed",
      "Set/Flag Pins",
      "Survey Complete/Invoice Sent",
      "Completed/To be Filed",
      "Site Plan",
    ],
    selectedStatuses: [],
    statusDropdownOpen: false,
    // Tag filter
    selectedTags: [],
    tagDropdownOpen: false,
    // Autocomplete (issue #21)
    jobSuggestions: [],
    showJobSuggestions: false,
    suggestionIndex: -1,
    _jobSearchTimer: null,

    // Sorting
    sortField: 'job_number',
    sortDirection: 'desc',

    // Pagination
    currentPage: 1,
    jobsPerPage: 10,
    totalPages: 1,

    // Stats
    stats: {
      // Jobs by EPIC status
      onHoldPending: 0,
      cancelledDeclined: 0,
      needsFieldwork: 0,
      fieldworkComplete: 0,
      toBePrinted: 0,
      invoiceSent: 0,
      setPins: 0,
      completed: 0,
      ongoingSitePlan: 0,
      estimateAvailable: 0,
      // Other metrics
      uniqueClients: 0,
      deletedJobs: 0,
    },

    // Calendar state (due date calendar on dashboard)
    calendarMonth: (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    })(),
    calendarCounts: {},
    calendarLoading: false,

    // Due date filter state
    dueDateFilter: {
      start: null,
      end: null,
      rangeValue: 7,
      rangeUnit: 'days'
    },
    dueDateDropdownOpen: false,

    // User management
    editingUser: {
      id: null,
      username: "",
      name: "",
      password: "",
      role: "user",
    },

    // Tags management
    newTag: { name: '', color: '#007bff' },
    tagsWithUsage: [],
    newUser: {
      username: "",
      name: "",
      password: "",
      role: "user",
    },

    // Job management
    editingJob: {
      job_number: "",
      client: "",
      address: "",
      status: "",
      due_date: "",
      notes: "",
      links: [],
    },
    // Link form state for edit modal
    newLink: {
      display_name: "",
      url: "",
    },
    showLinkForm: false,
    newJob: {
      job_number: "",
      client: "",
      address: "",
      status: "",
      notes: "",
    },

    // Upgrade modal state
    promotionJob: null,
    promotionAddress: "",

    // Modal management
    confirmModal: {
      title: "",
      message: "",
      confirmText: "Confirm",
      callback: () => {},
    },
    alertModal: {
      title: "",
      message: "",
    },

    // Fieldwork management
    fieldworkModal: {
      job: null,
    },
    fieldworkEntries: [],
    showAddFieldworkForm: false,
    newFieldworkEntry: {
      work_date: '',
      start_time: '',
      end_time: '',
      crew: '',
      drone_card: '',
      notes: ''
    },
    calculatedTotalTime: '0.00',

    // Bulk operations state
    selectedJobs: new Set(),
    showBulkToolbar: false,
    bulkOperation: {
      status: '',
      inProgress: false
    },

    // Schedule Calendar state
    schedules: [],
    schedulesLoaded: false,
    _loadingSchedules: false,
    _savingSchedule: false,
    currentWeekStart: null,
    calendarDays: [],
    calendarWeekLabel: '',
    pois: [], // Available POIs for scheduling
    scheduleModal: {
      show: false,
      mode: 'create',
      data: {},
      scheduleType: 'job', // 'job' or 'poi'
      jobSearch: '',
      jobResults: [],
      showJobResults: false,
      jobSuggestions: [],
      showJobSuggestions: false,
      suggestionIndex: -1,
      poiSearch: '',
      showPoiResults: false
    },
    // Drag state for schedule calendar
    _draggedSchedule: null,
    _dragTargetDate: null,
    _dragTargetIndex: null,
    _dragPreviewTime: null,
    _dragCursorX: 0,
    _dragCursorY: 0,
    _dragRafPending: false,
    _dragColumnRect: null,
    _dragDaySchedules: null,  // Cached schedules for target day
    // Resize state
    _resizingSchedule: null,
    _resizeColumnRect: null,
    _resizeStartY: 0,
    _resizePreviewEndTime: null,
    _resizeOriginals: null,      // Map of original values for rollback
    _resizeDate: null,           // Date of the day being resized
    _resizeDaySchedules: null,   // All schedules for that day
    _draggedSchedule: null,
    _scheduleJobSearchTimer: null,
    _scheduleJobSearchAbort: null,

    // Calendar subscription modal state
    calendarSubModal: {
      show: false,
      selectedTagIds: [],
      copied: false,
    },

    init() {
      this.ensureTabData('dashboard');
      document.addEventListener('jobCreated', async () => {
        await Promise.all([
          this.loadJobs(true),
          this.loadDashboardMetrics(true),
        ]);
        Alpine.store('notifications').add('Job created', 'success');
      });
      // Initialize jobs per page from localStorage
      try {
        const savedPerPage = parseInt(localStorage.getItem('admin_jobs_per_page') || '', 10);
        if (Number.isFinite(savedPerPage) && savedPerPage > 0) {
          this.jobsPerPage = savedPerPage;
        }
      } catch (_) {
        // ignore localStorage errors
      }
      // Initialize due date calendar month from localStorage
      try {
        const savedMonth = localStorage.getItem('admin_due_date_month');
        if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth)) {
          this.calendarMonth = savedMonth;
        }
      } catch (_) {
        // ignore localStorage errors
      }
      // Initialize status filter (all selected by default or from localStorage)
      try {
        const saved = JSON.parse(localStorage.getItem('admin_status_filters') || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
          this.selectedStatuses = this.statuses.filter(s => saved.includes(s));
        } else {
          this.selectedStatuses = [...this.statuses];
        }
      } catch (_) {
        this.selectedStatuses = [...this.statuses];
      }
      // Initialize tag filter from localStorage
      try {
        const savedTags = JSON.parse(localStorage.getItem('admin_tag_filters') || '[]');
        if (Array.isArray(savedTags)) {
          this.selectedTags = savedTags;
        }
      } catch (_) {
        this.selectedTags = [];
      }

      // Global escape key handler for modals (closes topmost visible modal)
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        // Modal IDs in z-index order (highest first - nested modals close first)
        const modals = [
          { id: 'confirmModal', check: () => this.confirmModal.show, close: () => { this.confirmModal.show = false; } },
          { id: 'bulkUpdateModal', close: () => this.closeBulkUpdateModal() },
          { id: 'fieldworkModal', close: () => document.getElementById('fieldworkModal')?.classList.add('hidden') },
          { id: 'promoteAddressModal', close: () => this.closePromoteModal() },
          { id: 'editJobModal', close: () => document.getElementById('editJobModal')?.classList.add('hidden') },
          { id: 'jobTagsModal', close: () => document.getElementById('jobTagsModal')?.classList.add('hidden') },
          { id: 'editUserModal', close: () => document.getElementById('editUserModal')?.classList.add('hidden') },
          { id: 'addUserModal', close: () => document.getElementById('addUserModal')?.classList.add('hidden') },
          { id: 'scheduleModal', check: () => this.scheduleModal.show, close: () => this.closeScheduleModal() },
          { id: 'calendarSubModal', check: () => this.calendarSubModal.show, close: () => this.closeCalendarSubModal() },
        ];

        for (const modal of modals) {
          // Use custom check if provided, otherwise check DOM visibility
          const isVisible = modal.check
            ? modal.check()
            : (() => {
                const el = document.getElementById(modal.id);
                return el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
              })();

          if (isVisible) {
            modal.close();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      });
    },

    activateTab(tab) {
      this.activeTab = tab;
      this.ensureTabData(tab);
    },

    async filterJobsByStatus(status) {
      this.activeTab = 'jobs';
      await this.loadJobs(true, 999999);
      this.selectedStatuses = [status];
      this.currentPage = 1;
      this.jobsPerPage = 999999;
      this.filterJobs();
    },

    async ensureTabData(tab) {
      if (tab === 'dashboard') {
        this.loadDashboardMetrics();
        return;
      }
      if (tab === 'jobs') {
        await this.loadJobs();
        return;
      }
      if (tab === 'users') {
        this.loadUsers();
        return;
      }
      if (tab === 'deleted') {
        this.loadDeletedJobs();
        return;
      }
      if (tab === 'tags') {
        if (!this.tagsLoaded || !this.tagsIncludeUsage) {
          await this.loadTags(true);
        }
      }
      if (tab === 'pois') {
        if (!this.poisLoaded) {
          this.loadPois();
        }
      }
      if (tab === 'calendar') {
        this.initCalendarWeek();
        this.loadSchedules();
        // Load POIs for schedule creation
        if (!this.poisLoaded) {
          this.loadPois();
        }
      }
    },

    // Autocomplete handlers
    async onJobSearchInput() {
      const q = this.jobSearch.trim();
      if (q.length >= 2 && !this.jobsLoadedAll && !this._loadingJobs) {
        try {
          await this.loadJobs(true, 999999);
        } catch (_) {
          // Fallback to existing data if full load fails
        }
      }
      this.filterJobs();
      clearTimeout(this._jobSearchTimer);
      if (q.length < 2) {
        this.jobSuggestions = [];
        this.showJobSuggestions = false;
        return;
      }
      this._jobSearchTimer = setTimeout(() => this.fetchJobSuggestions(q), 300);
    },

    async fetchJobSuggestions(q) {
      try {
        if (this._jobSearchAbort) this._jobSearchAbort.abort();
        this._jobSearchAbort = new AbortController();
        const resp = await fetch(`/api/jobs/search/autocomplete?q=${encodeURIComponent(q)}&limit=8`, { signal: this._jobSearchAbort.signal });
        const data = await resp.json();
        this.jobSuggestions = data.suggestions || [];
        this.suggestionIndex = this.jobSuggestions.length ? 0 : -1;
        this.showJobSuggestions = this.jobSuggestions.length > 0;
      } catch (e) {
        console.warn('Autocomplete fetch failed', e);
        this.jobSuggestions = [];
        this.showJobSuggestions = false;
      }
    },

    moveSuggestion(delta) {
      if (!this.showJobSuggestions || this.jobSuggestions.length === 0) return;
      const max = this.jobSuggestions.length - 1;
      let idx = this.suggestionIndex + delta;
      if (idx < 0) idx = max;
      if (idx > max) idx = 0;
      this.suggestionIndex = idx;
    },

    applyHighlightedSuggestion() {
      if (this.suggestionIndex >= 0 && this.jobSuggestions[this.suggestionIndex]) {
        this.selectSuggestion(this.jobSuggestions[this.suggestionIndex]);
      } else {
        this.filterJobs();
        this.showJobSuggestions = false;
      }
    },

    selectSuggestion(s) {
      this.jobSearch = s.value;
      this.showJobSuggestions = false;
      this.suggestionIndex = -1;
      this.filterJobs();
    },

    // Computed properties
    get paginatedJobs() {
      const start = (this.currentPage - 1) * this.jobsPerPage;
      const end = start + parseInt(this.jobsPerPage);
      return this.filteredJobs.slice(start, end);
    },

    // Sorting methods
    sortJobs(field) {
      if (this.sortField === field) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortField = field;
        this.sortDirection = 'asc';
      }
      this.applySorting();
      this.updatePagination();
    },

    getSortIcon(field) {
      if (this.sortField !== field) return 'bi-chevron-expand';
      return this.sortDirection === 'asc' ? 'bi-chevron-up' : 'bi-chevron-down';
    },

    applySorting() {
      this.filteredJobs.sort((a, b) => {
        let aVal = a[this.sortField];
        let bVal = b[this.sortField];

        if (this.sortField === 'created_at' || this.sortField === 'due_date') {
          aVal = aVal ? new Date(aVal) : new Date(0);
          bVal = bVal ? new Date(bVal) : new Date(0);
        } else if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    },

    // Pagination methods
    updatePagination() {
      const totalRecords = this.jobsLoadedAll || this.hasActiveFilters()
        ? this.filteredJobs.length
        : (this.jobsMeta.total || this.filteredJobs.length);
      this.totalPages = Math.max(1, Math.ceil(totalRecords / this.jobsPerPage));
      if (this.currentPage > this.totalPages) {
        this.currentPage = Math.max(1, this.totalPages);
      }
    },

    getPageInfo() {
      const totalRecords = this.jobsLoadedAll || this.hasActiveFilters()
        ? this.filteredJobs.length
        : (this.jobsMeta.total || this.filteredJobs.length);
      const start = Math.min((this.currentPage - 1) * this.jobsPerPage + 1, totalRecords);
      const end = Math.min(this.currentPage * this.jobsPerPage, totalRecords);
      return `${start}-${end} of ${totalRecords}`;
    },

    getVisiblePages() {
      const pages = [];
      const maxVisible = 5;
      let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
      let end = Math.min(this.totalPages, start + maxVisible - 1);

      if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      return pages;
    },

    async goToPage(page) {
      const target = Math.max(1, page);
      if (!this.jobsLoadedAll) {
        const neededCount = target * this.jobsPerPage;
        if (neededCount > this.jobs.length) {
          try {
            await this.loadJobs(true, 999999, { keepPage: true });
          } catch (_) {
            // Ignore failures
          }
        }
      }
      this.currentPage = target;
      this.updatePagination();
    },

    async handleJobsPerPageChange(event) {
      const value = parseInt(event?.target?.value, 10);
      if (!Number.isFinite(value) || value <= 0) {
        this.jobsPerPage = 10;
      }
      localStorage.setItem('admin_jobs_per_page', String(this.jobsPerPage));
      if (this.jobsPerPage >= 999999 && !this.jobsLoadedAll) {
        try {
          await this.loadJobs(true, 999999);
        } catch (_) {
          // leave existing dataset if load fails
        }
      } else if (
        !this.jobsLoadedAll &&
        this.jobsMeta.hasNext &&
        this.jobsPerPage > this.jobs.length
      ) {
        try {
          await this.loadJobs(true, Math.max(this.jobsPerPage, this.defaultJobsPerPage));
        } catch (_) {
          // ignore fetch failure
        }
      }
      this.currentPage = 1;
      this.filterJobs();
    },

    async loadJobs(force = false, perPageOverride = null, options = {}) {
      const { keepPage = false } = options;
      if (this._jobsPromise) {
        return this._jobsPromise;
      }
      if (this.jobsLoaded && !force) return;
      this._loadingJobs = true;
      this._jobsPromise = (async () => {
        try {
          const perPage = perPageOverride || this.defaultJobsPerPage;
          const url = `/api/jobs?per_page=${perPage}&page=1`;
          const fetcher = window.cachedFetch || window.fetch;
          const response = await fetcher(url, {}, { ttl: 30_000, force });
          const data = await response.json();
          const jobsArray = Array.isArray(data) ? data : data.jobs || [];
          this.jobs = jobsArray;
          if (Array.isArray(data)) {
            this.jobsMeta = {
              total: jobsArray.length,
              perPage,
              currentPage: 1,
              pages: 1,
              hasNext: false,
            };
            this.jobsLoadedAll = true;
          } else {
            this.jobsMeta = {
              total: data.total || jobsArray.length,
              perPage: data.per_page || perPage,
              currentPage: data.current_page || 1,
              pages: data.pages || 1,
              hasNext: Boolean(data.has_next),
            };
            this.jobsLoadedAll = !this.jobsMeta.hasNext;
          }
          this.jobs.forEach(j => { if (!Array.isArray(j.tags)) j.tags = []; });
          this.filteredJobs = [...this.jobs];
          this.sortField = 'job_number';
          this.sortDirection = 'desc';
          this.applySorting();
          this.filterJobs();
          if (!keepPage) {
            this.currentPage = 1;
          }
          this.updatePagination();
          this.jobsLoaded = true;
        } catch (error) {
          console.error("Failed to load jobs:", error);
          Alpine.store("notifications").add("Failed to load jobs", "error");
          this.jobsLoaded = false;
          throw error;
        } finally {
          this._loadingJobs = false;
          this._jobsPromise = null;
        }
      })();
      return this._jobsPromise;
    },

    async loadTags(includeUsage = false, force = false) {
      if (this._tagsPromise) return this._tagsPromise;
      if (this.tagsLoaded && !force) {
        // If usage counts are requested and not yet fetched, continue; otherwise skip.
        if (!includeUsage || this.tagsIncludeUsage) return;
      }

      this._tagsPromise = (async () => {
        try {
          const fetcher = window.cachedFetch || window.fetch;
          const url = '/api/tags' + (includeUsage ? '?include_usage=true' : '');
          const resp = await fetcher(url, {}, { ttl: 120_000, force });
          if (!resp.ok) {
            throw new Error(`Failed to load tags: ${resp.status} ${resp.statusText}`);
          }
          const arr = await resp.json();
          this.tags = Array.isArray(arr) ? arr : [];
          this.tagsWithUsage = Array.isArray(arr) ? arr : [];
          this.tagsLoaded = true;
          if (includeUsage) {
            this.tagsIncludeUsage = true;
          }
        } catch (e) {
          console.error('Failed to load tags', e);
          this.tags = [];
          this.tagsWithUsage = [];
          this.tagsLoaded = false;
        } finally {
          this._tagsPromise = null;
        }
      })();

      return this._tagsPromise;
    },

    async createTag() {
      const name = (this.newTag.name || '').trim();
      if (!name) return;
      try {
        const resp = await fetch('/api/tags', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(this.newTag)});
        const tag = await resp.json();
        if (!resp.ok) throw new Error(tag.error || 'Create failed');
        this.newTag = { name: '', color: '#007bff' };
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
          window.ApiCache.invalidateMatching('/api/tags');
        }
        await this.loadTags(true, true);
        Alpine.store('notifications').add('Tag created','success');
      } catch (e) { console.error(e); Alpine.store('notifications').add(e.message,'error'); }
    },

    async saveTag(tag) {
      try {
        const resp = await fetch(`/api/tags/${tag.id}`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: tag.name, color: tag.color }) });
        if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || 'Save failed'); }
        Alpine.store('notifications').add('Tag saved','success');
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
          window.ApiCache.invalidateMatching('/api/tags');
        }
        await this.loadTags(true, true);
      } catch (e) { console.error(e); Alpine.store('notifications').add(e.message,'error'); }
    },

    async deleteTag(tag) {
      if ((tag.job_count||0) > 0) { Alpine.store('notifications').add('Tag in use; cannot delete','warning'); return; }
      this.showConfirm('Delete Tag', `Delete '${tag.name}'?`, async () => {
        try {
          const resp = await fetch(`/api/tags/${tag.id}`, { method:'DELETE' });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Delete failed');
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/tags');
          }
          await this.loadTags(true, true);
          Alpine.store('notifications').add('Tag deleted','success');
        } catch (e) { console.error(e); Alpine.store('notifications').add(e.message,'error'); }
      }, 'Delete');
    },

    // POI Management
    _originalPoiAddresses: {},

    async loadPois(force = false) {
      if (this._loadingPois) return;
      if (this.poisLoaded && !force) return;
      this._loadingPois = true;
      try {
        const resp = await fetch('/api/pois');
        if (!resp.ok) throw new Error('Failed to load POIs');
        const data = await resp.json();
        this.pois = Array.isArray(data) ? data : [];
        this._originalPoiAddresses = {};
        this.pois.forEach(poi => {
          this._originalPoiAddresses[poi.id] = poi.address;
        });
        this.poisLoaded = true;
      } catch (e) {
        console.error('Failed to load POIs:', e);
        Alpine.store('notifications').add('Failed to load POIs', 'error');
        this.pois = [];
      } finally {
        this._loadingPois = false;
      }
    },

    async geocodeAddress(address) {
      try {
        const resp = await fetch(`/api/geocode?address=${encodeURIComponent(address + ', Florida')}`);
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || 'Geocoding failed');
        }
        return await resp.json();
      } catch (e) {
        console.error('Geocoding error:', e);
        throw e;
      }
    },

    async createPoi() {
      const name = (this.newPoi.name || '').trim();
      const address = (this.newPoi.address || '').trim();
      if (!name || !address) return;

      this._creatingPoi = true;
      try {
        let geocodeResult;
        try {
          geocodeResult = await this.geocodeAddress(address);
        } catch (e) {
          Alpine.store('notifications').add('Could not geocode address: ' + e.message, 'error');
          return;
        }

        const payload = {
          name: name,
          address: geocodeResult.formatted_address || address,
          lat: geocodeResult.lat,
          lng: geocodeResult.lng,
          icon: (this.newPoi.icon || 'bi-geo-alt').trim(),
          color: (this.newPoi.color || '#3b82f6').trim()
        };

        const resp = await fetch('/api/pois', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Create failed');

        this.newPoi = { name: '', address: '', icon: 'bi-geo-alt', color: '#3b82f6' };
        await this.loadPois(true);
        Alpine.store('notifications').add('POI created successfully', 'success');
      } catch (e) {
        console.error('Create POI error:', e);
        Alpine.store('notifications').add(e.message, 'error');
      } finally {
        this._creatingPoi = false;
      }
    },

    async savePoi(poi) {
      if (!poi || !poi.id) return;
      const name = (poi.name || '').trim();
      const address = (poi.address || '').trim();
      if (!name) {
        Alpine.store('notifications').add('POI name is required', 'error');
        return;
      }

      this._savingPoi = poi.id;
      try {
        const originalAddress = this._originalPoiAddresses[poi.id] || '';
        let lat = poi.lat;
        let lng = poi.lng;

        if (address && address !== originalAddress) {
          try {
            const geocodeResult = await this.geocodeAddress(address);
            lat = geocodeResult.lat;
            lng = geocodeResult.lng;
            poi.address = geocodeResult.formatted_address || address;
          } catch (e) {
            Alpine.store('notifications').add('Could not geocode new address: ' + e.message, 'error');
            return;
          }
        }

        const payload = {
          name: name,
          address: poi.address,
          lat: lat,
          lng: lng,
          icon: (poi.icon || 'bi-geo-alt').trim(),
          color: (poi.color || '#3b82f6').trim()
        };

        const resp = await fetch(`/api/pois/${poi.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Save failed');

        await this.loadPois(true);
        Alpine.store('notifications').add('POI saved', 'success');
      } catch (e) {
        console.error('Save POI error:', e);
        Alpine.store('notifications').add(e.message, 'error');
      } finally {
        this._savingPoi = null;
      }
    },

    async deletePoi(poi) {
      if (!poi || !poi.id) return;
      this.showConfirm('Delete POI', `Delete '${poi.name}'?`, async () => {
        try {
          const resp = await fetch(`/api/pois/${poi.id}`, { method: 'DELETE' });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Delete failed');
          await this.loadPois(true);
          Alpine.store('notifications').add('POI deleted', 'success');
        } catch (e) {
          console.error('Delete POI error:', e);
          Alpine.store('notifications').add(e.message, 'error');
        }
      }, 'Delete');
    },

    async loadUsers(force = false) {
      if (this._usersPromise) {
        return this._usersPromise;
      }
      if (this.usersLoaded && !force && this.users.length > 0) return;
      this._loadingUsers = true;
      this._usersPromise = (async () => {
        try {
          const fetcher = window.cachedFetch || window.fetch;
          const response = await fetcher("/api/users", {}, { ttl: 60_000, force });
          if (!response.ok) {
            throw new Error(`Failed to load users: ${response.status} ${response.statusText}`);
          }
          const data = await response.json();
          this.users = Array.isArray(data) ? data : [];
          this.usersLoaded = true;
          await this.$nextTick();
          this.filterUsers();
        } catch (error) {
          console.error("Failed to load users:", error);
          Alpine.store("notifications").add("Failed to load users", "error");
          this.usersLoaded = false;
          this.users = [];
          this.filteredUsers = [];
          throw error;
        } finally {
          this._loadingUsers = false;
          this._usersPromise = null;
        }
      })();
      return this._usersPromise;
    },

    filterUsers() {
      let filtered = [...this.users];

      if (this.userSearch && this.userSearch.trim()) {
        const term = this.userSearch.toLowerCase().trim();
        filtered = filtered.filter(
          (user) =>
            user.username.toLowerCase().includes(term) ||
            user.name.toLowerCase().includes(term)
        );
      }

      filtered.sort((a, b) => {
        let aVal = a[this.userSortField];
        let bVal = b[this.userSortField];

        if (aVal == null) aVal = '';
        if (bVal == null) bVal = '';

        if (this.userSortField === 'last_active') {
          if (!aVal) return 1;
          if (!bVal) return -1;
          aVal = new Date(aVal);
          bVal = new Date(bVal);
        }

        if (aVal < bVal) return this.userSortAsc ? -1 : 1;
        if (aVal > bVal) return this.userSortAsc ? 1 : -1;
        return 0;
      });

      this.filteredUsers = filtered;
    },

    sortUsers(field) {
      if (this.userSortField === field) {
        this.userSortAsc = !this.userSortAsc;
      } else {
        this.userSortField = field;
        this.userSortAsc = true;
      }
      this.filterUsers();
    },

    formatUserDate(dateString) {
      return window.AdminUtils.formatRelativeDate(dateString);
    },

    formatUserTime(dateString) {
      return window.AdminUtils.formatTime(dateString);
    },

    isValidEmail(email) {
      return window.AdminUtils.isValidEmail(email);
    },

    hasInvalidPassword(password) {
      return window.AdminUtils.hasInvalidPassword(password);
    },

    isPrivateIP(ip) {
      return window.AdminUtils.isPrivateIP(ip);
    },

    formatIP(ip) {
      return window.AdminUtils.formatIP(ip);
    },

    async loadDeletedJobs(force = false) {
      if (this._deletedJobsPromise) {
        return this._deletedJobsPromise;
      }
      if (this.deletedJobsLoaded && !force && this.deletedJobs.length > 0) return;
      this._loadingDeletedJobs = true;
      this._deletedJobsPromise = (async () => {
        try {
          const fetcher = window.cachedFetch || window.fetch;
          const response = await fetcher("/api/jobs/deleted", {}, { ttl: 60_000, force });
          if (!response.ok) {
            throw new Error(`Failed to load deleted jobs: ${response.status} ${response.statusText}`);
          }
          const data = await response.json();
          this.deletedJobs = Array.isArray(data.jobs) ? data.jobs : [];
          this.stats.deletedJobs = data.total || 0;
          this.deletedJobsLoaded = true;
          await this.$nextTick();
          this.filterDeletedJobs();
        } catch (error) {
          console.error("Failed to load deleted jobs:", error);
          Alpine.store("notifications").add("Failed to load deleted jobs", "error");
          this.deletedJobsLoaded = false;
          this.deletedJobs = [];
          this.filteredDeletedJobs = [];
          throw error;
        } finally {
          this._loadingDeletedJobs = false;
          this._deletedJobsPromise = null;
        }
      })();
      return this._deletedJobsPromise;
    },

    async loadDashboardMetrics(force = false) {
      if (this._dashboardPromise) {
        return this._dashboardPromise;
      }
      if (this.dashboardLoaded && !force) return;
      this._loadingDashboard = true;
      this._dashboardPromise = (async () => {
        try {
          const fetcher = window.cachedFetch || window.fetch;
          const response = await fetcher("/admin/api/dashboard", {}, { ttl: 30_000, force });
          const data = await response.json();

          const sc = data.status_counts || {};
          this.stats.completed = (sc["Completed/To be Filed"] || 0) + (sc["Completed"] || 0);
          this.stats.needsFieldwork = (sc["Needs Fieldwork"] || 0);
          this.stats.setPins = (sc["Set/Flag Pins"] || 0) + (sc["Set Pins"] || 0);
          this.stats.toBePrinted = (sc["To Be Printed"] || 0);
          this.stats.fieldworkComplete = (sc["Fieldwork Complete"] || 0) + (sc["Needs Office Work"] || 0);
          this.stats.invoiceSent = (sc["Survey Complete/Invoice Sent"] || 0) + (sc["Invoice Sent"] || 0);
          this.stats.ongoingSitePlan = (sc["Site Plan"] || 0) + (sc["Ongoing Site"] || 0);
          this.stats.onHoldPending = (sc["On Hold/Pending Estimate"] || 0) + (sc["On Hold"] || 0);
          this.stats.cancelledDeclined = (sc["Cancelled/Declined"] || 0);

          this.stats.uniqueClients = data.unique_clients || 0;
          this.stats.deletedJobs = data.deleted_jobs || this.stats.deletedJobs || 0;

          this.dashboardLoaded = true;
          // Load calendar data for current month
          this.loadCalendarMonth(this.calendarMonth);
        } catch (error) {
          console.error("Failed to load stats:", error);
          this.dashboardLoaded = false;
          throw error;
        } finally {
          this._loadingDashboard = false;
          this._dashboardPromise = null;
        }
      })();
      return this._dashboardPromise;
    },

    // Calendar methods
    async loadCalendarMonth(month) {
      this.calendarLoading = true;
      try {
        const fetcher = window.cachedFetch || window.fetch;
        const response = await fetcher(`/api/jobs/due-dates?month=${month}`, {}, { ttl: 60_000 });
        const data = await response.json();
        this.calendarCounts = data.counts || {};
      } catch (error) {
        console.error("Failed to load calendar counts:", error);
        this.calendarCounts = {};
      } finally {
        this.calendarLoading = false;
      }
    },

    prevCalendarMonth() {
      const [year, month] = this.calendarMonth.split('-').map(Number);
      let newYear = year;
      let newMonth = month - 1;
      if (newMonth < 1) {
        newMonth = 12;
        newYear--;
      }
      this.calendarMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`;
      localStorage.setItem('admin_due_date_month', this.calendarMonth);
      this.loadCalendarMonth(this.calendarMonth);
    },

    nextCalendarMonth() {
      const [year, month] = this.calendarMonth.split('-').map(Number);
      let newYear = year;
      let newMonth = month + 1;
      if (newMonth > 12) {
        newMonth = 1;
        newYear++;
      }
      this.calendarMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`;
      localStorage.setItem('admin_due_date_month', this.calendarMonth);
      this.loadCalendarMonth(this.calendarMonth);
    },

    goToCurrentMonth() {
      const now = new Date();
      this.calendarMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      localStorage.setItem('admin_due_date_month', this.calendarMonth);
      this.loadCalendarMonth(this.calendarMonth);
    },

    getCalendarMonthLabel() {
      const [year, month] = this.calendarMonth.split('-').map(Number);
      const date = new Date(year, month - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    },

    getCalendarGrid() {
      const [year, month] = this.calendarMonth.split('-').map(Number);
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);
      const daysInMonth = lastDay.getDate();
      const startDayOfWeek = firstDay.getDay();

      const grid = [];
      let week = [];

      // Previous month's trailing days
      const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
      for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        week.push({
          day,
          date: dateStr,
          isCurrentMonth: false,
          count: this.calendarCounts[dateStr] || 0
        });
      }

      // Current month's days
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        week.push({
          day,
          date: dateStr,
          isCurrentMonth: true,
          isToday: dateStr === new Date().toISOString().slice(0, 10),
          count: this.calendarCounts[dateStr] || 0
        });

        if (week.length === 7) {
          grid.push(week);
          week = [];
        }
      }

      // Next month's leading days
      if (week.length > 0) {
        let nextDay = 1;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        while (week.length < 7) {
          const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
          week.push({
            day: nextDay,
            date: dateStr,
            isCurrentMonth: false,
            count: this.calendarCounts[dateStr] || 0
          });
          nextDay++;
        }
        grid.push(week);
      }

      return grid;
    },

    getCountBadgeColor(count) {
      // Interpolate from yellow (1) -> orange (3) -> red (5+)
      // Yellow: #f59e0b, Orange: #f97316, Red: #ef4444
      if (count <= 0) return '#9ca3af'; // gray
      if (count === 1) return '#f59e0b'; // yellow/amber
      if (count === 2) return '#f97316'; // orange
      if (count === 3) return '#ea580c'; // dark orange
      if (count === 4) return '#dc2626'; // red-600
      return '#b91c1c'; // red-700 for 5+
    },

    onCalendarDayClick(date) {
      this.dueDateFilter.start = date;
      this.dueDateFilter.end = date;
      this.activeTab = 'jobs';
      this.ensureTabData('jobs');
      this.$nextTick(() => {
        this.filterJobs();
      });
    },

    // Due date filter methods
    getDueDateFilterLabel() {
      if (!this.dueDateFilter.start || !this.dueDateFilter.end) {
        return 'All';
      }
      if (this.dueDateFilter.start === this.dueDateFilter.end) {
        return this.formatDate(this.dueDateFilter.start);
      }
      return `${this.formatDate(this.dueDateFilter.start)} - ${this.formatDate(this.dueDateFilter.end)}`;
    },

    applyQuickDueDateFilter(type) {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      let endDate;

      if (type === 'day') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        endDate = tomorrow.toISOString().slice(0, 10);
      } else if (type === 'week') {
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        endDate = nextWeek.toISOString().slice(0, 10);
      } else if (type === 'month') {
        const nextMonth = new Date(today);
        nextMonth.setDate(nextMonth.getDate() + 30);
        endDate = nextMonth.toISOString().slice(0, 10);
      }

      this.dueDateFilter.start = todayStr;
      this.dueDateFilter.end = endDate;
      this.dueDateDropdownOpen = false;
      this.filterJobs();
    },

    applyDueDateRange() {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const endDate = new Date(today);

      const value = this.dueDateFilter.rangeValue || 7;
      if (this.dueDateFilter.rangeUnit === 'days') {
        endDate.setDate(endDate.getDate() + value);
      } else if (this.dueDateFilter.rangeUnit === 'weeks') {
        endDate.setDate(endDate.getDate() + (value * 7));
      } else if (this.dueDateFilter.rangeUnit === 'months') {
        endDate.setMonth(endDate.getMonth() + value);
      }

      this.dueDateFilter.start = todayStr;
      this.dueDateFilter.end = endDate.toISOString().slice(0, 10);
      this.dueDateDropdownOpen = false;
      this.filterJobs();
    },

    clearDueDateFilter() {
      this.dueDateFilter.start = null;
      this.dueDateFilter.end = null;
      this.dueDateDropdownOpen = false;
      this.filterJobs();
    },

    filterJobs() {
      let filtered = this.jobs;

      if (this.jobSearch.trim()) {
        const rawTerm = this.jobSearch.toLowerCase();
        const normalizedTerm = this.normalizeWhitespace(rawTerm);
        const strippedTerm = normalizedTerm.replace(/\s+/g, '');
        filtered = filtered.filter(
          (job) =>
            this.matchesSearchField(job.job_number, rawTerm, strippedTerm) ||
            this.matchesSearchField(job.client, rawTerm, strippedTerm, normalizedTerm) ||
            this.matchesSearchField(job.address, rawTerm, strippedTerm, normalizedTerm) ||
            (Array.isArray(job.tags) && job.tags.some(t => this.matchesSearchField(t.name, rawTerm, strippedTerm, normalizedTerm))),
        );
      }

      if (Array.isArray(this.selectedStatuses) && this.selectedStatuses.length > 0 && this.selectedStatuses.length < this.statuses.length) {
        const set = new Set(this.selectedStatuses);
        filtered = filtered.filter(job => set.has(job.status || ''));
      }

      if (Array.isArray(this.selectedTags) && this.selectedTags.length > 0) {
        filtered = filtered.filter(job => {
          if (!Array.isArray(job.tags) || job.tags.length === 0) return false;
          return job.tags.some(tag => this.selectedTags.includes(tag.id));
        });
      }

      // Due date range filter
      if (this.dueDateFilter.start && this.dueDateFilter.end) {
        filtered = filtered.filter(job => {
          if (!job.due_date) return false;
          return job.due_date >= this.dueDateFilter.start && job.due_date <= this.dueDateFilter.end;
        });
      }

      this.filteredJobs = filtered;
      this.applySorting();
      this.updatePagination();
    },

    matchesSearchField(value, rawTerm, strippedTerm, normalizedTerm = null) {
      return window.AdminUtils.matchesSearchField(value, rawTerm, strippedTerm, normalizedTerm);
    },

    normalizeWhitespace(value) {
      return window.AdminUtils.normalizeWhitespace(value);
    },

    // Multi-status helpers
    statusSummary() {
      if (!this.selectedStatuses || this.selectedStatuses.length === 0) return 'Statuses: None';
      if (this.selectedStatuses.length === this.statuses.length) return 'Statuses: All';
      return `Statuses: ${this.selectedStatuses.length} selected`;
    },

    toggleStatusOption(status, checked) {
      const exists = this.selectedStatuses.includes(status);
      if (checked && !exists) this.selectedStatuses.push(status);
      if (!checked && exists) this.selectedStatuses = this.selectedStatuses.filter(s => s !== status);
      localStorage.setItem('admin_status_filters', JSON.stringify(this.selectedStatuses));
      if (
        this.selectedStatuses.length > 0 &&
        this.selectedStatuses.length < this.statuses.length &&
        !this.jobsLoadedAll &&
        !this._loadingJobs
      ) {
        this.loadJobs(true, 999999).finally(() => this.filterJobs());
      } else {
        this.filterJobs();
      }
    },

    selectAllStatuses() {
      this.selectedStatuses = [...this.statuses];
      localStorage.setItem('admin_status_filters', JSON.stringify(this.selectedStatuses));
      this.filterJobs();
    },

    clearAllStatuses() {
      this.selectedStatuses = [];
      localStorage.setItem('admin_status_filters', JSON.stringify(this.selectedStatuses));
      this.filterJobs();
    },

    toggleStatusDropdown() {
      this.statusDropdownOpen = !this.statusDropdownOpen;
    },

    // Tag filter helpers
    tagSummary() {
      if (!this.selectedTags || this.selectedTags.length === 0) return 'Tags: None';
      if (this.selectedTags.length === this.tags.length) return 'Tags: All';
      return `Tags: ${this.selectedTags.length} selected`;
    },

    toggleTagOption(tagId, checked) {
      const exists = this.selectedTags.includes(tagId);
      if (checked && !exists) this.selectedTags.push(tagId);
      if (!checked && exists) this.selectedTags = this.selectedTags.filter(id => id !== tagId);
      localStorage.setItem('admin_tag_filters', JSON.stringify(this.selectedTags));
      this.filterJobs();
    },

    selectAllTags() {
      this.selectedTags = this.tags.map(t => t.id);
      localStorage.setItem('admin_tag_filters', JSON.stringify(this.selectedTags));
      this.filterJobs();
    },

    clearAllTags() {
      this.selectedTags = [];
      localStorage.setItem('admin_tag_filters', JSON.stringify(this.selectedTags));
      this.filterJobs();
    },

    toggleTagDropdown() {
      this.tagDropdownOpen = !this.tagDropdownOpen;
      if (this.tagDropdownOpen && (!this.tagsLoaded || this.tags.length === 0)) {
        this.loadTags(false);
      }
    },

    // Tag helpers
    async openJobTags(job) {
      this.jobTagsModal.job = job;
      this.jobTagsModal.input = '';
      this.tagSuggestions = [];
      // Ensure all tags are loaded for autocomplete
      if (!this.tagsLoaded || this.tags.length === 0) {
        await this.loadTags(false);
      }
      fetch(`/api/jobs/${job.job_number}/tags`).then(r => r.json()).then(ts => { this.jobTagsModal.job.tags = ts; this.syncJobRowTags(job, ts); });
      document.getElementById('jobTagsModal').classList.remove('hidden');
    },

    // Upgrade actions
    openPromoteModal(job) {
      this.promotionJob = job;
      this.promotionAddress = '';
      document.getElementById('promoteAddressModal').classList.remove('hidden');
      setTimeout(() => document.getElementById('promoteAddressInput')?.focus(), 50);
    },

    closePromoteModal() {
      document.getElementById('promoteAddressModal').classList.add('hidden');
    },

    closeScheduleModal() {
      this.scheduleModal.show = false;
      this.scheduleModal.showJobSuggestions = false;
      this.scheduleModal.showJobResults = false;
    },

    // Calendar Subscription Modal methods
    async openCalendarSubModal() {
      // Ensure tags are loaded for selection
      if (!this.tagsLoaded || this.tags.length === 0) {
        await this.loadTags(false);
      }
      this.calendarSubModal = {
        show: true,
        selectedTagIds: [],
        copied: false,
      };
    },

    closeCalendarSubModal() {
      this.calendarSubModal.show = false;
    },

    toggleCalendarSubTag(tagId) {
      const idx = this.calendarSubModal.selectedTagIds.indexOf(tagId);
      if (idx === -1) {
        this.calendarSubModal.selectedTagIds.push(tagId);
      } else {
        this.calendarSubModal.selectedTagIds.splice(idx, 1);
      }
      this.calendarSubModal.copied = false;
    },

    isCalendarSubTagSelected(tagId) {
      return this.calendarSubModal.selectedTagIds.includes(tagId);
    },

    getCalendarSubUrl() {
      const base = `${window.location.origin}/api/schedules/calendar.ics`;
      // Only add query params if tags are selected (days defaults to 90 server-side)
      if (this.calendarSubModal.selectedTagIds.length > 0) {
        const params = new URLSearchParams();
        params.set('tags', this.calendarSubModal.selectedTagIds.join(','));
        return `${base}?${params.toString()}`;
      }
      return base;
    },

    async copyCalendarSubUrl() {
      const url = this.getCalendarSubUrl();
      try {
        await navigator.clipboard.writeText(url);
        this.calendarSubModal.copied = true;
        Alpine.store('notifications').add('Calendar URL copied to clipboard', 'success');
        setTimeout(() => {
          this.calendarSubModal.copied = false;
        }, 2000);
      } catch (e) {
        console.error('Failed to copy URL:', e);
        Alpine.store('notifications').add('Failed to copy URL', 'error');
      }
    },

    async submitPromote() {
      const address = (this.promotionAddress || '').trim();
      if (!address) {
        Alpine.store('notifications').add('Address is required to upgrade this job', 'error');
        return;
      }
      try {
        const response = await fetch(`/api/jobs/${this.promotionJob.job_number}/promote-to-address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address })
        });
        const data = await response.json();
        if (response.ok) {
          Alpine.store('notifications').add('Job upgraded successfully', 'success');
          const jobIndex = this.jobs.findIndex(j => j.job_number === this.promotionJob.job_number);
          if (jobIndex !== -1) {
            this.jobs[jobIndex].is_parcel_job = false;
            this.jobs[jobIndex].address = address;
          }
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/admin/api/dashboard');
          }
          this.closePromoteModal();
        } else {
          throw new Error(data.error || 'Failed to upgrade job');
        }
      } catch (error) {
        console.error('Error upgrading job:', error);
        Alpine.store('notifications').add(error.message || 'Failed to upgrade job', 'error');
      }
    },

    syncJobRowTags(job, tags) {
      const idx = this.jobs.findIndex(j => j.id === job.id);
      if (idx !== -1) this.jobs[idx].tags = tags;
    },

    getTagTextColor(tagColor) {
      // Determine if text should be black or white based on background color brightness
      if (!tagColor) return 'tag-text-dark';
      const hex = tagColor.replace("#", "");
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      // Calculate relative luminance
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 155 ? 'tag-text-dark' : 'tag-text-light';
    },

    getStatusColor(status) {
      return window.AdminUtils?.getStatusColor(status) || '#6c757d';
    },

    getStatusTextColor(status) {
      const color = this.getStatusColor(status);
      return window.AdminUtils?.getTextColorClass(color) || 'tag-text-light';
    },

    filterTagSuggestions() {
      const q = (this.jobTagsModal.input || '').toLowerCase();
      if (!q) { this.tagSuggestions = []; return; }
      this.tagSuggestions = this.tags.filter(t => t.name.toLowerCase().includes(q) && !(this.jobTagsModal.job?.tags || []).some(jt => jt.id === t.id)).slice(0, 8);
    },

    async addExistingTag(tag) {
      if (!this.jobTagsModal.job) return;
      try {
        const resp = await fetch(`/api/jobs/${this.jobTagsModal.job.job_number}/tags`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tag_id: tag.id })});
        const data = await resp.json();
        if (resp.ok) {
          this.jobTagsModal.job.tags = data.tags || [];
          this.syncJobRowTags(this.jobTagsModal.job, this.jobTagsModal.job.tags);
          this.jobTagsModal.input=''; this.tagSuggestions=[];
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/api/tags');
          }
          try { await this.loadTags(true, true); } catch (_) {}
        } else {
          throw new Error(data.error || 'Failed to add tag');
        }
      } catch(e){ console.error(e); }
    },

    async addTagFromInput() {
      const name = (this.jobTagsModal.input || '').trim();
      if (!name) return;
      const existing = this.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
      if (existing) return this.addExistingTag(existing);
      try {
        const create = await fetch('/api/tags', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name })});
        const tag = await create.json();
        if (!create.ok) throw new Error(tag.error || 'Create failed');
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
          window.ApiCache.invalidateMatching('/api/tags');
        }
        this.tags.push(tag);
        await this.addExistingTag(tag);
      } catch(e){ console.error(e); }
    },

    async removeTagFromJob(job, tag) {
      try {
        const resp = await fetch(`/api/jobs/${job.job_number}/tags/${tag.id}`, { method:'DELETE' });
        const data = await resp.json();
        if (resp.ok) {
          job.tags = data.tags || (job.tags || []).filter(t => t.id !== tag.id);
          this.syncJobRowTags(job, job.tags);
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/api/tags');
          }
          try { await this.loadTags(true, true); } catch (_) {}
        } else {
          throw new Error(data.error || 'Failed to remove tag');
        }
      } catch(e){ console.error(e); }
    },

    getStatusBadgeClass(status) {
      return window.AdminUtils.getStatusBadgeClass(status);
    },

    formatDate(dateString) {
      return window.AdminUtils.formatDate(dateString);
    },

    openAddJobModal() {
      if (window.CreateJobModal?.show) {
        window.CreateJobModal.show(null, null, '');
      } else {
        console.warn('CreateJobModal not loaded; ensure create-job-modal.js is included');
      }
    },

    editJob(job) {
      this.editingJob = {
        job_number: job.job_number,
        client: job.client,
        address: job.address,
        status: job.status || "",
        due_date: job.due_date || "",
        notes: job.notes || "",
        is_parcel_job: !!job.is_parcel_job,
        links: Array.isArray(job.links) ? [...job.links] : [],
      };
      this.newLink = { display_name: "", url: "" };
      this.showLinkForm = false;
      document.getElementById("editJobModal").classList.remove("hidden");
    },

    async addJobLink() {
      const displayName = (this.newLink.display_name || "").trim();
      const url = (this.newLink.url || "").trim();

      if (!displayName) {
        Alpine.store("notifications").add("Display name is required", "error");
        return;
      }
      if (!url) {
        Alpine.store("notifications").add("URL is required", "error");
        return;
      }
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        Alpine.store("notifications").add("URL must start with http:// or https://", "error");
        return;
      }

      try {
        const response = await fetch(`/api/jobs/${this.editingJob.job_number}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, display_name: displayName }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to add link");

        this.editingJob.links = data.links || [];
        this.newLink = { display_name: "", url: "" };
        this.showLinkForm = false;

        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === "function") {
          window.ApiCache.invalidateMatching("/api/jobs");
        }

        Alpine.store("notifications").add("Link added", "success");
      } catch (error) {
        console.error("Add link error:", error);
        Alpine.store("notifications").add(error.message || "Failed to add link", "error");
      }
    },

    async removeJobLink(index) {
      try {
        const response = await fetch(`/api/jobs/${this.editingJob.job_number}/links/${index}`, {
          method: "DELETE",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to remove link");

        this.editingJob.links = data.links || [];

        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === "function") {
          window.ApiCache.invalidateMatching("/api/jobs");
        }

        Alpine.store("notifications").add("Link removed", "success");
      } catch (error) {
        console.error("Remove link error:", error);
        Alpine.store("notifications").add(error.message || "Failed to remove link", "error");
      }
    },

    async deleteJob(job) {
      this.showConfirm(
        "Delete Job",
        `Are you sure you want to delete job ${job.job_number}?`,
        async () => {
          try {
            const response = await fetch(`/api/jobs/${job.job_number}`, {
              method: "DELETE",
            });

            if (response.ok) {
              if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/jobs');
                window.ApiCache.invalidateMatching('/api/jobs/deleted');
                window.ApiCache.invalidateMatching('/admin/api/dashboard');
                window.ApiCache.invalidateMatching('/api/tags');
              }
              await Promise.all([
                this.loadJobs(true),
                this.loadDeletedJobs(true),
                this.loadDashboardMetrics(true),
                this.loadTags(true, true),
              ]);
              Alpine.store("notifications").add("Job deleted successfully", "success");
            } else {
              throw new Error("Failed to delete job");
            }
          } catch (error) {
            console.error("Delete job error:", error);
            Alpine.store("notifications").add("Failed to delete job", "error");
          }
        },
        "Delete",
      );
    },

    // Bulk operations methods
    toggleJobSelection(jobNumber) {
      if (this.selectedJobs.has(jobNumber)) {
        this.selectedJobs.delete(jobNumber);
      } else {
        this.selectedJobs.add(jobNumber);
      }
      this.updateBulkToolbarVisibility();
    },

    selectAllVisible() {
      this.paginatedJobs.forEach(job => {
        this.selectedJobs.add(job.job_number);
      });
      this.updateBulkToolbarVisibility();
    },

    selectAllMatching() {
      this.filteredJobs.forEach(job => {
        this.selectedJobs.add(job.job_number);
      });
      this.updateBulkToolbarVisibility();
      Alpine.store('notifications').add(`Selected ${this.filteredJobs.length} matching jobs`, 'info');
    },

    clearSelection() {
      this.selectedJobs.clear();
      this.updateBulkToolbarVisibility();
    },

    updateBulkToolbarVisibility() {
      this.showBulkToolbar = this.selectedJobs.size > 0;
    },

    isJobSelected(jobNumber) {
      return this.selectedJobs.has(jobNumber);
    },

    getSelectedCount() {
      return this.selectedJobs.size;
    },

    openBulkUpdateModal() {
      this.bulkOperation.status = '';
      document.getElementById('bulkUpdateModal').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('bulkStatusSelect')?.focus();
      }, 50);
    },

    closeBulkUpdateModal() {
      document.getElementById('bulkUpdateModal').classList.add('hidden');
    },

    async executeBulkUpdate() {
      if (!this.bulkOperation.status) {
        Alpine.store('notifications').add('Please select a status', 'error');
        return;
      }

      const jobNumbers = Array.from(this.selectedJobs);
      const count = jobNumbers.length;

      if (count > 500) {
        const confirmed = confirm(`You are updating ${count} jobs. This exceeds the recommended limit of 500 and may take 15-20 seconds. Continue?`);
        if (!confirmed) {
          return;
        }
      }

      this.bulkOperation.inProgress = true;

      try {
        const response = await fetch('/api/jobs/bulk-update-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            job_numbers: jobNumbers,
            status: this.bulkOperation.status
          })
        });

        const data = await response.json();

        if (response.ok || response.status === 207) {
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/admin/api/dashboard');
          }

          await Promise.all([
            this.loadJobs(true),
            this.loadDashboardMetrics(true)
          ]);

          if (data.failed && data.failed > 0) {
            Alpine.store('notifications').add(
              `${data.updated} of ${data.total} jobs updated. ${data.failed} failed.`,
              'warning'
            );
            console.warn('Bulk update failures:', data.failures);
          } else {
            Alpine.store('notifications').add(data.message, 'success');
          }

          this.clearSelection();
          this.closeBulkUpdateModal();
        } else {
          throw new Error(data.error || 'Bulk update failed');
        }
      } catch (error) {
        console.error('Bulk update error:', error);
        this.closeBulkUpdateModal();
        this.bulkOperation.inProgress = false;

        setTimeout(() => {
          Alpine.store('notifications').add(error.message || 'Failed to update jobs', 'error');
        }, 300);
      } finally {
        this.bulkOperation.inProgress = false;
      }
    },

    hasActiveFilters() {
      const hasSearch = this.jobSearch && this.jobSearch.trim().length > 0;
      const hasStatusFilter = this.selectedStatuses.length > 0 && this.selectedStatuses.length < this.statuses.length;
      const hasTagFilter = this.selectedTags && this.selectedTags.length > 0;
      const hasDueDateFilter = this.dueDateFilter && this.dueDateFilter.start && this.dueDateFilter.end;
      return hasSearch || hasStatusFilter || hasTagFilter || hasDueDateFilter;
    },

    confirmBulkDelete() {
      const count = this.getSelectedCount();
      const jobNumbers = Array.from(this.selectedJobs);

      this.showConfirm(
        "Delete Jobs",
        `Are you sure you want to delete ${count} job${count === 1 ? '' : 's'}? This action can be undone from the Deleted Jobs tab.`,
        async () => {
          await this.executeBulkDelete(jobNumbers);
        },
        "Delete"
      );
    },

    async executeBulkDelete(jobNumbers) {
      try {
        const response = await fetch('/api/jobs/bulk-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            job_numbers: jobNumbers
          })
        });

        const data = await response.json();

        if (response.ok || response.status === 207) {
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/api/jobs/deleted');
            window.ApiCache.invalidateMatching('/admin/api/dashboard');
            window.ApiCache.invalidateMatching('/api/tags');
          }

          await Promise.all([
            this.loadJobs(true),
            this.loadDeletedJobs(true),
            this.loadDashboardMetrics(true),
            this.loadTags(true, true)
          ]);

          if (data.failed && data.failed > 0) {
            Alpine.store('notifications').add(
              `${data.deleted} of ${data.total} jobs deleted. ${data.failed} failed.`,
              'warning'
            );
            console.warn('Bulk delete failures:', data.failures);
          } else {
            Alpine.store('notifications').add(data.message, 'success');
          }

          this.clearSelection();
        } else {
          throw new Error(data.error || 'Bulk delete failed');
        }
      } catch (error) {
        console.error('Bulk delete error:', error);
        this.hideConfirmModal();

        setTimeout(() => {
          Alpine.store('notifications').add(error.message || 'Failed to delete jobs', 'error');
        }, 300);
      }
    },

    openAddUserModal() {
      this.newUser = {
        username: "",
        name: "",
        password: "",
        role: "user",
      };
      document.getElementById("addUserModal").classList.remove("hidden");
    },

    editUser(user) {
      this.editingUser = {
        id: user.id,
        username: user.username,
        name: user.name,
        password: "",
        role: user.role,
      };
      document.getElementById("editUserModal").classList.remove("hidden");
    },

    async deleteUser(user) {
      this.showConfirm(
        "Delete User",
        `Are you sure you want to delete user <strong>${user.username}</strong> (${user.name})?<br><br><span class="text-error">This action cannot be undone.</span>`,
        async () => {
          try {
            const response = await fetch(`/api/users/${user.id}`, {
              method: "DELETE",
            });

            if (response.ok) {
              if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/users');
              }
              await this.loadUsers(true);
              Alpine.store("notifications").add("User deleted successfully", "success");
            } else {
              let msg = 'Failed to delete user';
              try {
                const data = await response.json();
                msg = data.error || msg;
              } catch(_) {}
              throw new Error(msg);
            }
          } catch (error) {
            console.error("Delete user error:", error);
            Alpine.store("notifications").add(error.message || "Failed to delete user", "error");
          }
        },
        "Delete",
      );
    },

    filterDeletedJobs() {
      let filtered = [...this.deletedJobs];

      if (this.deletedJobSearch && this.deletedJobSearch.trim()) {
        const term = this.deletedJobSearch.toLowerCase().trim();
        filtered = filtered.filter(
          (job) =>
            (job.display_job_number || job.original_job_number || "")
              .toLowerCase()
              .includes(term) ||
            job.client.toLowerCase().includes(term) ||
            job.address.toLowerCase().includes(term),
        );
      }

      filtered.sort((a, b) => {
        let aVal, bVal;

        if (this.deletedSortField === 'job_number') {
          aVal = (a.display_job_number || a.original_job_number || '').toLowerCase();
          bVal = (b.display_job_number || b.original_job_number || '').toLowerCase();
        } else if (this.deletedSortField === 'client') {
          aVal = (a.client || '').toLowerCase();
          bVal = (b.client || '').toLowerCase();
        } else if (this.deletedSortField === 'deleted_at') {
          if (!a.deleted_at) return 1;
          if (!b.deleted_at) return -1;
          aVal = new Date(a.deleted_at);
          bVal = new Date(b.deleted_at);
        } else {
          aVal = a[this.deletedSortField] || '';
          bVal = b[this.deletedSortField] || '';
        }

        if (aVal < bVal) return this.deletedSortAsc ? -1 : 1;
        if (aVal > bVal) return this.deletedSortAsc ? 1 : -1;
        return 0;
      });

      this.filteredDeletedJobs = filtered;
    },

    sortDeletedJobs(field) {
      if (this.deletedSortField === field) {
        this.deletedSortAsc = !this.deletedSortAsc;
      } else {
        this.deletedSortField = field;
        this.deletedSortAsc = field === 'deleted_at' ? false : true;
      }
      this.filterDeletedJobs();
    },

    formatDeletedDate(dateString) {
      if (!dateString) return "Unknown";
      const result = window.AdminUtils.formatRelativeDate(dateString);
      return result === "Never" ? "Unknown" : result;
    },

    formatDeletedTime(dateString) {
      return window.AdminUtils.formatTime(dateString);
    },

    getDeletedByName(userId) {
      if (!userId) return "Unknown";
      const user = this.users.find((u) => u.id === userId);
      return user ? user.name : "Unknown User";
    },

    async restoreJob(job) {
      const jobNumber = job.display_job_number || job.original_job_number;
      this.showConfirm(
        "Restore Job",
        `Are you sure you want to restore job ${jobNumber}?`,
        async () => {
          try {
            const response = await fetch(`/api/jobs/${job.job_number}/restore`, {
              method: "POST",
            });

            if (response.ok) {
              if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/jobs');
                window.ApiCache.invalidateMatching('/api/jobs/deleted');
                window.ApiCache.invalidateMatching('/admin/api/dashboard');
                window.ApiCache.invalidateMatching('/api/tags');
              }
              await Promise.all([
                this.loadJobs(true),
                this.loadDeletedJobs(true),
                this.loadDashboardMetrics(true),
                this.loadTags(true, true),
              ]);
              Alpine.store("notifications").add(`Job ${jobNumber} restored successfully`, "success");
            } else {
              const error = await response.json();
              throw new Error(error.error || "Failed to restore job");
            }
          } catch (error) {
            console.error("Restore job error:", error);
            Alpine.store("notifications").add(error.message || "Failed to restore job", "error");
          }
        },
        "Restore",
      );
    },

    async permanentlyDeleteJob(job) {
      const jobNumber = job.display_job_number || job.original_job_number;
      this.showConfirm(
        "Permanently Delete Job",
        `Are you sure you want to PERMANENTLY delete job ${jobNumber}? This action cannot be undone!`,
        () => {
          this.hideConfirmModal();

          setTimeout(() => {
            this.showConfirm(
              "Final Confirmation",
              `This will permanently delete job ${jobNumber} and all associated data. Are you absolutely sure?`,
              async () => {
                try {
                  const response = await fetch(`/api/jobs/${job.job_number}/permanent-delete`, {
                    method: "DELETE",
                  });

                  if (response.ok) {
                    if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                      window.ApiCache.invalidateMatching('/api/jobs');
                      window.ApiCache.invalidateMatching('/api/jobs/deleted');
                      window.ApiCache.invalidateMatching('/admin/api/dashboard');
                      window.ApiCache.invalidateMatching('/api/tags');
                    }
                    await Promise.all([
                      this.loadDeletedJobs(true),
                      this.loadDashboardMetrics(true),
                      this.loadTags(true, true),
                    ]);
                    Alpine.store("notifications").add(`Job ${jobNumber} permanently deleted`, "success");
                  } else {
                    throw new Error("Failed to permanently delete job");
                  }
                } catch (error) {
                  console.error("Permanent delete job error:", error);
                  Alpine.store("notifications").add("Failed to permanently delete job", "error");
                }
              },
              "Permanently Delete",
            );
          }, 300);
        },
        "Continue",
      );
    },

    async saveNewUser() {
      try {
        const response = await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.newUser),
        });

        if (response.ok) {
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/users');
          }
          await this.loadUsers(true);
          Alpine.store("notifications").add("User created successfully", "success");
          document.getElementById("addUserModal").classList.add("hidden");
          this.newUser = {
            username: "",
            name: "",
            password: "",
            role: "user",
          };
        } else {
          const error = await response.json();
          throw new Error(error.error || "Failed to create user");
        }
      } catch (error) {
        console.error("Create user error:", error);
        Alpine.store("notifications").add(error.message || "Failed to create user", "error");
      }
    },

    async updateUser() {
      try {
        const updateData = {
          username: this.editingUser.username,
          name: this.editingUser.name,
          role: this.editingUser.role,
        };

        const trimmedPassword = this.editingUser.password?.trim() || '';
        if (trimmedPassword.length > 0) {
          if (trimmedPassword.length < 8) {
            Alpine.store("notifications").add("Password must be at least 8 characters", "error");
            return;
          }
          updateData.password = trimmedPassword;
        }

        const response = await fetch(`/api/users/${this.editingUser.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        });

        if (response.ok) {
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/users');
          }
          await this.loadUsers(true);
          Alpine.store("notifications").add("User updated successfully", "success");
          document.getElementById("editUserModal").classList.add("hidden");
        } else {
          let errorMessage = "Failed to update user";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = `Failed to update user: ${response.status} ${response.statusText}`;
          }
          console.error("Update user error:", errorMessage, response.status);
          Alpine.store("notifications").add(errorMessage, "error");
        }
      } catch (error) {
        console.error("Update user error:", error);
        Alpine.store("notifications").add(
          error.message || "Failed to update user. Please check the console for details.",
          "error",
        );
      }
    },

    async saveNewJob() {
      try {
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.newJob),
        });

        if (response.ok) {
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/api/jobs/deleted');
            window.ApiCache.invalidateMatching('/admin/api/dashboard');
          }
          await Promise.all([
            this.loadJobs(true),
            this.loadDashboardMetrics(true),
          ]);
          Alpine.store("notifications").add("Job created successfully", "success");
          document.getElementById("addJobModal").classList.add("hidden");
          this.newJob = {
            job_number: "",
            client: "",
            address: "",
            status: "",
            notes: "",
          };
        } else {
          const error = await response.json();
          throw new Error(error.error || "Failed to create job");
        }
      } catch (error) {
        console.error("Create job error:", error);
        Alpine.store("notifications").add(error.message || "Failed to create job", "error");
      }
    },

    async updateJob() {
      try {
        const updateData = {
          client: this.editingJob.client,
          address: this.editingJob.address,
          status: this.editingJob.status,
          due_date: this.editingJob.due_date || null,
          notes: this.editingJob.notes,
        };

        const response = await fetch(`/api/jobs/${this.editingJob.job_number}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        });

        if (response.ok) {
          if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/jobs');
            window.ApiCache.invalidateMatching('/admin/api/dashboard');
          }
          await Promise.all([
            this.loadJobs(true),
            this.loadDashboardMetrics(true),
          ]);
          Alpine.store("notifications").add("Job updated successfully", "success");
          document.getElementById("editJobModal").classList.add("hidden");
        } else {
          const error = await response.json();
          throw new Error(error.error || "Failed to update job");
        }
      } catch (error) {
        console.error("Update job error:", error);
        Alpine.store("notifications").add(error.message || "Failed to update job", "error");
      }
    },

    // Modal helper functions
    showConfirm(title, message, callback, confirmText = "Confirm") {
      this.confirmModal = {
        title,
        message,
        confirmText,
        callback,
      };

      const modal = document.getElementById("confirmModal");
      if (modal) {
        modal.classList.remove("hidden");
      }
    },

    hideConfirmModal() {
      const modal = document.getElementById("confirmModal");
      if (modal) {
        modal.classList.add("hidden");
      }
    },

    // Fieldwork management functions
    async openFieldworkModal(job) {
      this.fieldworkModal.job = job;
      this.resetNewEntry();
      await this.loadFieldworkEntries(job.job_number);
      document.getElementById("fieldworkModal").classList.remove("hidden");
    },

    async loadFieldworkEntries(jobNumber) {
      try {
        const response = await fetch(`/api/jobs/${jobNumber}/fieldwork`);
        if (response.ok) {
          this.fieldworkEntries = await response.json();
        } else {
          this.fieldworkEntries = [];
          console.error('Failed to load fieldwork entries');
        }
      } catch (error) {
        console.error('Error loading fieldwork entries:', error);
        this.fieldworkEntries = [];
      }
    },

    resetNewEntry() {
      const today = new Date().toISOString().split('T')[0];
      this.newFieldworkEntry = {
        work_date: today,
        total_time: '',
        crew: '',
        drone_card: '',
        notes: ''
      };
      this.showAddFieldworkForm = false;
    },

    parseTimeInput(timeStr) {
      return window.AdminUtils.parseTimeInput(timeStr);
    },

    getTotalFieldworkTime() {
      if (!this.fieldworkEntries || this.fieldworkEntries.length === 0) return 0;
      return this.fieldworkEntries.reduce((total, entry) => total + parseFloat(entry.total_time || 0), 0);
    },

    formatDuration(hours) {
      return window.AdminUtils.formatDuration(hours);
    },

    async saveFieldworkEntry() {
      if (!this.newFieldworkEntry.work_date || !this.newFieldworkEntry.total_time) {
        Alpine.store("notifications").add("Please fill in all required fields", "error");
        return;
      }

      const parsedTime = this.parseTimeInput(this.newFieldworkEntry.total_time);
      if (parsedTime === null || parsedTime <= 0) {
        Alpine.store("notifications").add("Invalid format. Use H:MM (e.g., 1:30) or range (e.g., 9:00a-10:30a)", "error");
        return;
      }

      try {
        const response = await fetch(`/api/jobs/${this.fieldworkModal.job.job_number}/fieldwork`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            work_date: this.newFieldworkEntry.work_date,
            total_time: this.newFieldworkEntry.total_time,
            crew: this.newFieldworkEntry.crew || null,
            drone_card: this.newFieldworkEntry.drone_card || null,
            notes: this.newFieldworkEntry.notes || null
          })
        });

        if (response.ok) {
          await this.loadFieldworkEntries(this.fieldworkModal.job.job_number);
          this.resetNewEntry();
          Alpine.store("notifications").add("Time entry saved successfully", "success");
        } else {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save entry');
        }
      } catch (error) {
        console.error('Failed to save fieldwork:', error);
        Alpine.store("notifications").add(`Failed to save: ${error.message}`, "error");
      }
    },

    async deleteFieldworkEntry(entry) {
      this.showConfirm(
        'Delete Time Entry',
        `Delete time entry for ${this.formatDate(entry.work_date)}?`,
        async () => {
          try {
            const response = await fetch(`/api/fieldwork/${entry.id}`, {
              method: 'DELETE'
            });

            if (response.ok) {
              await this.loadFieldworkEntries(this.fieldworkModal.job.job_number);
              Alpine.store("notifications").add("Time entry deleted successfully", "success");
            } else {
              const error = await response.json();
              throw new Error(error.error || 'Failed to delete entry');
            }
          } catch (error) {
            console.error('Failed to delete fieldwork:', error);
            Alpine.store("notifications").add(`Failed to delete: ${error.message}`, "error");
          }
        },
        'Delete'
      );
    },

    // =========================================================================
    // SCHEDULE CALENDAR METHODS
    // =========================================================================

    initCalendarWeek(forceToday = false) {
      let weekStart = null;
      if (!forceToday) {
        try {
          const savedWeek = localStorage.getItem('admin_schedule_week_start');
          if (savedWeek && /^\d{4}-\d{2}-\d{2}$/.test(savedWeek)) {
            weekStart = savedWeek;
          }
        } catch (_) {
          // ignore localStorage errors
        }
      }
      if (!weekStart) {
        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - today.getDay() + 1); // Get Monday
        if (today.getDay() === 0) monday.setDate(monday.getDate() - 7); // Sunday fix
        weekStart = this.toLocalDateString(monday);
      }
      this.currentWeekStart = weekStart;
      localStorage.setItem('admin_schedule_week_start', this.currentWeekStart);
      this.updateCalendarDays();
    },

    updateCalendarDays() {
      const days = [];
      const start = this.parseLocalDate(this.currentWeekStart);
      const today = this.toLocalDateString(new Date());
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dateStr = this.toLocalDateString(d);
        days.push({
          date: dateStr,
          dayName: dayNames[i],
          dayNum: d.getDate(),
          monthName: monthNames[d.getMonth()],
          isToday: dateStr === today
        });
      }
      this.calendarDays = days;

      // Update week label
      const endDate = new Date(start);
      endDate.setDate(start.getDate() + 6);
      const startMonth = monthNames[start.getMonth()];
      const endMonth = monthNames[endDate.getMonth()];
      if (startMonth === endMonth) {
        this.calendarWeekLabel = `${startMonth} ${start.getDate()} - ${endDate.getDate()}, ${start.getFullYear()}`;
      } else {
        this.calendarWeekLabel = `${startMonth} ${start.getDate()} - ${endMonth} ${endDate.getDate()}, ${start.getFullYear()}`;
      }
    },

    calendarPrevWeek() {
      const d = this.parseLocalDate(this.currentWeekStart);
      d.setDate(d.getDate() - 7);
      this.currentWeekStart = this.toLocalDateString(d);
      localStorage.setItem('admin_schedule_week_start', this.currentWeekStart);
      this.updateCalendarDays();
      this.loadSchedules();
    },

    calendarNextWeek() {
      const d = this.parseLocalDate(this.currentWeekStart);
      d.setDate(d.getDate() + 7);
      this.currentWeekStart = this.toLocalDateString(d);
      localStorage.setItem('admin_schedule_week_start', this.currentWeekStart);
      this.updateCalendarDays();
      this.loadSchedules();
    },

    calendarToday() {
      this.initCalendarWeek(true);
      this.loadSchedules();
    },

    async loadSchedules() {
      if (this._loadingSchedules) return;
      this._loadingSchedules = true;
      try {
        const resp = await fetch(`/api/schedules/week/${this.currentWeekStart}`);
        if (!resp.ok) throw new Error('Failed to load schedules');
        const data = await resp.json();
        // Flatten schedules from grouped format
        this.schedules = [];
        for (const dateKey in data.schedules) {
          this.schedules.push(...data.schedules[dateKey]);
        }
        this.schedulesLoaded = true;
      } catch (e) {
        console.error('Load schedules error:', e);
        Alpine.store('notifications').add('Failed to load schedules', 'error');
      } finally {
        this._loadingSchedules = false;
      }
    },

    getSchedulesForDay(dateStr) {
      return this.schedules
        .filter(s => s.scheduled_date === dateStr)
        .sort((a, b) => (a.route_order || 999) - (b.route_order || 999));
    },

    formatScheduleTime(schedule) {
      if (!schedule.start_time) return '';
      const start = this.formatTime12Hour(schedule.start_time.slice(0, 5));
      if (schedule.end_time) {
        const end = this.formatTime12Hour(schedule.end_time.slice(0, 5));
        return `${start} - ${end}`;
      }
      return start;
    },

    /**
     * Calculate time gap in minutes between two schedules.
     * Returns null if times are not available or invalid.
     */
    getTimeGapMinutes(prevSchedule, nextSchedule) {
      if (!prevSchedule || !nextSchedule) return null;

      // Get end time of previous (or start + estimated duration, or just start)
      let prevEnd = prevSchedule.end_time || prevSchedule.start_time;
      if (!prevEnd) return null;

      // If prev has start but no end, estimate end based on duration (default 30min)
      if (!prevSchedule.end_time && prevSchedule.start_time) {
        const duration = prevSchedule.estimated_duration || 0.5; // hours
        const [h, m] = prevSchedule.start_time.split(':').map(Number);
        const endMinutes = h * 60 + m + (duration * 60);
        const endH = Math.floor(endMinutes / 60) % 24;
        const endM = Math.floor(endMinutes % 60);
        prevEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      }

      const nextStart = nextSchedule.start_time;
      if (!nextStart) return null;

      // Parse times
      const [prevH, prevM] = prevEnd.split(':').map(Number);
      const [nextH, nextM] = nextStart.split(':').map(Number);

      const prevMinutes = prevH * 60 + prevM;
      const nextMinutes = nextH * 60 + nextM;

      return nextMinutes - prevMinutes;
    },

    /**
     * Format time gap for display.
     * Returns null if gap is less than 15 minutes (not worth showing).
     */
    formatTimeGap(gapMinutes) {
      if (gapMinutes === null || gapMinutes < 15) return null;
      if (gapMinutes < 60) return `${gapMinutes}min gap`;
      const hours = Math.floor(gapMinutes / 60);
      const mins = gapMinutes % 60;
      if (mins === 0) return `${hours}h gap`;
      return `${hours}h ${mins}m gap`;
    },

    /**
     * Get the time gap display between schedule at index and previous schedule.
     */
    getGapBeforeSchedule(daySchedules, index) {
      if (index === 0) return null;
      const prev = daySchedules[index - 1];
      const current = daySchedules[index];
      const gapMinutes = this.getTimeGapMinutes(prev, current);
      return this.formatTimeGap(gapMinutes);
    },

    /**
     * Calculate a suggested start time for an event being inserted at a position.
     * Snaps to 15-minute increments.
     * @param {Array} daySchedules - Schedules for the day (in order)
     * @param {number} insertIndex - Where the event will be inserted
     * @param {Object} draggedSchedule - The schedule being moved (to preserve its time if appropriate)
     * @returns {string|null} Suggested start time in HH:MM format, or null to keep existing
     */
    calculateSuggestedTime(daySchedules, insertIndex, draggedSchedule) {
      // If inserting at the beginning
      if (insertIndex === 0) {
        // If there's a next event, suggest 30min before it
        if (daySchedules.length > 0 && daySchedules[0].start_time) {
          const [h, m] = daySchedules[0].start_time.split(':').map(Number);
          let newMinutes = h * 60 + m - 30;
          if (newMinutes < 6 * 60) newMinutes = 6 * 60; // Don't go before 6am
          return this.minutesToTimeString(this.snapTo15Min(newMinutes));
        }
        // Otherwise keep existing time or default to 8:00
        return draggedSchedule.start_time || '08:00';
      }

      // Get the previous event
      const prevSchedule = daySchedules[insertIndex - 1];
      if (!prevSchedule) return draggedSchedule.start_time;

      // Calculate end of previous event
      let prevEndMinutes;
      if (prevSchedule.end_time) {
        const [h, m] = prevSchedule.end_time.split(':').map(Number);
        prevEndMinutes = h * 60 + m;
      } else if (prevSchedule.start_time) {
        const [h, m] = prevSchedule.start_time.split(':').map(Number);
        const duration = prevSchedule.estimated_duration || 0.5;
        prevEndMinutes = h * 60 + m + (duration * 60);
      } else {
        return draggedSchedule.start_time;
      }

      // Add 15 min buffer after previous event
      let suggestedMinutes = prevEndMinutes + 15;

      // If there's a next event, make sure we don't overlap
      if (insertIndex < daySchedules.length) {
        const nextSchedule = daySchedules[insertIndex];
        if (nextSchedule.start_time) {
          const [nh, nm] = nextSchedule.start_time.split(':').map(Number);
          const nextStartMinutes = nh * 60 + nm;
          // If suggested time would overlap, place it in between
          const draggedDuration = (draggedSchedule.estimated_duration || 0.5) * 60;
          if (suggestedMinutes + draggedDuration > nextStartMinutes) {
            // Not enough room, squeeze it in
            suggestedMinutes = Math.max(prevEndMinutes, nextStartMinutes - draggedDuration - 15);
          }
        }
      }

      return this.minutesToTimeString(this.snapTo15Min(suggestedMinutes));
    },

    /**
     * Snap minutes to nearest 15-minute increment.
     */
    snapTo15Min(minutes) {
      return Math.round(minutes / 15) * 15;
    },

    /**
     * Convert minutes since midnight to HH:MM string (24-hour for API).
     */
    minutesToTimeString(minutes) {
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    /**
     * Convert HH:MM (24-hour) to 12-hour format for display.
     */
    formatTime12Hour(timeStr) {
      if (!timeStr) return '';
      const [h, m] = timeStr.split(':').map(Number);
      const period = h >= 12 ? 'pm' : 'am';
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${hour12}:${String(m).padStart(2, '0')}${period}`;
    },

    extractStreetName(address) {
      if (!address) return '';
      // Get the street portion (before first comma)
      const streetPart = address.split(',')[0].trim();
      // Remove leading house number (digits, optional letter suffix like "123A")
      const withoutNumber = streetPart.replace(/^\d+[A-Za-z]?\s+/, '');
      return withoutNumber || streetPart;
    },

    getJobDisplayAddress(job) {
      // For regular jobs, return the address
      if (job.address) return job.address;
      // For parcel jobs, extract street name from parcel_data
      // Priority: user-entered street_name > raw_response.street_name > raw_response.formatted_address
      if (job.is_parcel_job && job.parcel_data) {
        // Check for user-entered street_name first
        if (job.parcel_data.street_name) {
          return job.parcel_data.street_name;
        }
        // Fall back to raw_response data
        const rawResponse = job.parcel_data.raw_response || {};
        const streetName = rawResponse.street_name || rawResponse.formatted_address || '';
        if (streetName && streetName !== 'No Address Available') {
          return streetName;
        }
      }
      return '';
    },

    getScheduleBlockStyle(schedule) {
      const color = this.getStatusColor(schedule.status);
      return `background-color: ${color}; border-color: ${color};`;
    },

    getScheduleBlockTextClass(schedule) {
      return this.getStatusTextColor(schedule.status);
    },

    toLocalDateString(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },

    parseLocalDate(dateStr) {
      const [year, month, day] = (dateStr || '').split('-').map(Number);
      if (!year || !month || !day) return new Date();
      return new Date(year, month - 1, day);
    },

    openNewScheduleModal(dateStr) {
      this.scheduleModal = {
        show: true,
        mode: 'create',
        scheduleType: 'job', // 'job' or 'poi'
        data: {
          scheduled_date: dateStr,
          job_id: null,
          poi_id: null,
          estimated_duration: '',
          start_time: '',
          end_time: '',
          notes: ''
        },
        jobSearch: '',
        jobResults: [],
        showJobResults: false,
        jobSuggestions: [],
        showJobSuggestions: false,
        suggestionIndex: -1,
        poiSearch: '',
        showPoiResults: false
      };
    },

    openScheduleModal(schedule) {
      // Determine if this is a job or POI schedule
      const scheduleType = schedule.poi_id ? 'poi' : 'job';
      this.scheduleModal = {
        show: true,
        mode: 'edit',
        scheduleType: scheduleType,
        data: { ...schedule },
        jobSearch: '',
        jobResults: [],
        showJobResults: false,
        jobSuggestions: [],
        showJobSuggestions: false,
        suggestionIndex: -1,
        poiSearch: schedule.poi_name || '',
        showPoiResults: false
      };
    },

    onScheduleJobSearchInput() {
      const q = this.scheduleModal.jobSearch.trim();
      clearTimeout(this._scheduleJobSearchTimer);
      if (q.length < 2) {
        this.scheduleModal.jobResults = [];
        this.scheduleModal.showJobResults = false;
        this.scheduleModal.jobSuggestions = [];
        this.scheduleModal.showJobSuggestions = false;
        this.scheduleModal.suggestionIndex = -1;
        return;
      }
      this._scheduleJobSearchTimer = setTimeout(() => {
        this.searchJobsForSchedule(q, false);
        this.fetchScheduleJobSuggestions(q);
      }, 300);
    },

    async fetchScheduleJobSuggestions(q) {
      try {
        if (this._scheduleJobSearchAbort) this._scheduleJobSearchAbort.abort();
        this._scheduleJobSearchAbort = new AbortController();
        const resp = await fetch(`/api/jobs/search/autocomplete?q=${encodeURIComponent(q)}&limit=8`, {
          signal: this._scheduleJobSearchAbort.signal
        });
        const data = await resp.json();
        this.scheduleModal.jobSuggestions = data.suggestions || [];
        this.scheduleModal.suggestionIndex = this.scheduleModal.jobSuggestions.length ? 0 : -1;
        this.scheduleModal.showJobSuggestions = this.scheduleModal.jobSuggestions.length > 0;
      } catch (e) {
        console.warn('Schedule autocomplete fetch failed', e);
        this.scheduleModal.jobSuggestions = [];
        this.scheduleModal.showJobSuggestions = false;
      }
    },

    moveScheduleSuggestion(delta) {
      if (!this.scheduleModal.showJobSuggestions || this.scheduleModal.jobSuggestions.length === 0) return;
      const max = this.scheduleModal.jobSuggestions.length - 1;
      let idx = this.scheduleModal.suggestionIndex + delta;
      if (idx < 0) idx = max;
      if (idx > max) idx = 0;
      this.scheduleModal.suggestionIndex = idx;
    },

    applyScheduleHighlightedSuggestion() {
      if (this.scheduleModal.suggestionIndex >= 0 &&
        this.scheduleModal.jobSuggestions[this.scheduleModal.suggestionIndex]) {
        this.selectScheduleSuggestion(this.scheduleModal.jobSuggestions[this.scheduleModal.suggestionIndex]);
        return;
      }
      this.scheduleModal.showJobSuggestions = false;
    },

    selectScheduleSuggestion(s) {
      this.scheduleModal.jobSearch = s.value;
      this.scheduleModal.showJobSuggestions = false;
      this.scheduleModal.suggestionIndex = -1;
      this.searchJobsForSchedule(s.value, true);
    },

    async searchJobsForSchedule(q, showResults = false) {
      const searchTerm = (q ?? this.scheduleModal.jobSearch).trim();
      if (searchTerm.length < 2) {
        this.scheduleModal.jobResults = [];
        this.scheduleModal.showJobResults = false;
        return;
      }
      try {
        const resp = await fetch(`/api/jobs/search?q=${encodeURIComponent(searchTerm)}`);
        if (!resp.ok) throw new Error('Search failed');
        const data = await resp.json();
        const results = Array.isArray(data.jobs) ? data.jobs : [];
        this.scheduleModal.jobResults = results;
        this.scheduleModal.showJobResults = showResults && results.length > 0;
      } catch (e) {
        console.error('Schedule job search error:', e);
        this.scheduleModal.jobResults = [];
        this.scheduleModal.showJobResults = false;
      }
    },

    selectJobForSchedule(job) {
      this.scheduleModal.data.job_id = job.id;
      this.scheduleModal.data.job_number = job.job_number;
      this.scheduleModal.data.client = job.client;
      this.scheduleModal.data.job_notes = job.notes || null;
      this.scheduleModal.data.job_links = job.links || [];
      this.scheduleModal.jobSearch = job.job_number;
      this.scheduleModal.showJobResults = false;
    },

    selectPoiForSchedule(poi) {
      this.scheduleModal.data.poi_id = poi.id;
      this.scheduleModal.data.poi_name = poi.name;
      this.scheduleModal.data.poi_icon = poi.icon;
      this.scheduleModal.data.poi_color = poi.color;
      this.scheduleModal.data.job_id = null; // Clear job if POI selected
    },

    getFilteredPois() {
      const search = (this.scheduleModal.poiSearch || '').toLowerCase().trim();
      if (!search) {
        return this.pois;
      }
      return this.pois.filter(poi => {
        const name = (poi.name || '').toLowerCase();
        const address = (poi.address || '').toLowerCase();
        return name.includes(search) || address.includes(search);
      });
    },

    async saveSchedule() {
      if (this._savingSchedule) return;
      this._savingSchedule = true;
      try {
        const data = this.scheduleModal.data;
        const scheduleType = this.scheduleModal.scheduleType;
        const isEdit = this.scheduleModal.mode === 'edit';
        const url = isEdit ? `/api/schedules/${data.id}` : '/api/schedules';
        const method = isEdit ? 'PUT' : 'POST';

        const payload = {
          scheduled_date: data.scheduled_date,
          start_time: data.start_time || null,
          end_time: data.end_time || null,
          estimated_duration: data.estimated_duration ? parseFloat(data.estimated_duration) : null,
          notes: data.notes || null
        };

        // Add either job_id or poi_id based on schedule type
        if (scheduleType === 'poi') {
          payload.poi_id = data.poi_id;
        } else {
          payload.job_id = data.job_id;
        }

        const resp = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || 'Save failed');
        }

        this.scheduleModal.show = false;
        await this.loadSchedules();
        Alpine.store('notifications').add(isEdit ? 'Schedule updated' : 'Schedule created', 'success');
      } catch (e) {
        console.error('Save schedule error:', e);
        Alpine.store('notifications').add(e.message, 'error');
      } finally {
        this._savingSchedule = false;
      }
    },

    async deleteSchedule(scheduleId) {
      this.showConfirm('Delete Schedule', 'Are you sure you want to delete this schedule?', async () => {
        try {
          const resp = await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
          if (!resp.ok) throw new Error('Delete failed');
          this.scheduleModal.show = false;
          await this.loadSchedules();
          Alpine.store('notifications').add('Schedule deleted', 'success');
        } catch (e) {
          console.error('Delete schedule error:', e);
          Alpine.store('notifications').add(e.message, 'error');
        }
      }, 'Delete');
    },

    getGoogleMapsRouteUrl(dateStr) {
      // Build Google Maps directions URL with all stops for the day
      const schedules = this.getSchedulesForDay(dateStr);
      if (schedules.length === 0) return '#';

      // Filter schedules that have coordinates
      const stops = schedules
        .filter(s => s.lat && s.lng)
        .map(s => `${s.lat},${s.lng}`);

      if (stops.length === 0) return '#';

      // Google Maps directions format:
      // Single stop: /maps/dir/?api=1&destination=lat,lng
      // Multiple stops: origin + destination + waypoints
      if (stops.length === 1) {
        return `https://www.google.com/maps/dir/?api=1&destination=${stops[0]}`;
      }

      // Multiple stops: first is origin, last is destination, middle are waypoints
      const origin = stops[0];
      const destination = stops[stops.length - 1];
      const waypoints = stops.slice(1, -1);

      let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
      if (waypoints.length > 0) {
        url += `&waypoints=${waypoints.join('|')}`;
      }
      return url;
    },

    handleScheduleDragStart(event, schedule) {
      this._draggedSchedule = schedule;
      this._draggedScheduleEl = event.target;
      this._dragTargetDate = null;
      this._dragTargetIndex = null;
      this._dragPreviewTime = null;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', schedule.id);
      // Add dragging class for visual feedback
      setTimeout(() => {
        event.target.classList.add('opacity-50', 'scale-95');
        document.body.classList.add('schedule-dragging');
      }, 0);
    },

    handleScheduleDragEnd(event) {
      event.target.classList.remove('opacity-50', 'scale-95');
      document.body.classList.remove('schedule-dragging');
      // Clear all drag state
      this._draggedSchedule = null;
      this._dragTargetDate = null;
      this._dragTargetIndex = null;
      this._dragPreviewTime = null;
      this._dragCursorX = 0;
      this._dragCursorY = 0;
      this._dragRafPending = false;
      this._dragColumnRect = null;
      this._dragDaySchedules = null;
    },

    // Schedule time grid settings
    _scheduleStartHour: 6,   // 6 AM
    _scheduleEndHour: 20,    // 8 PM

    calculateTimeFromPosition(event, columnEl) {
      // Get position within the column
      const rect = columnEl.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const height = rect.height;

      // Calculate percentage through the day
      const percent = Math.max(0, Math.min(1, y / height));

      // Map to time range (6 AM to 8 PM = 14 hours)
      const totalMinutes = (this._scheduleEndHour - this._scheduleStartHour) * 60;
      const minutesFromStart = percent * totalMinutes;
      const snappedMinutes = this.snapTo15Min(minutesFromStart);
      const totalMinutesFromMidnight = (this._scheduleStartHour * 60) + snappedMinutes;

      return this.minutesToTimeString(totalMinutesFromMidnight);
    },

    calculateInsertIndex(date, time) {
      // Use cached schedules if available, otherwise compute
      const daySchedules = this._dragDaySchedules || this.schedules
        .filter(s => s.scheduled_date === date && (!this._draggedSchedule || s.id !== this._draggedSchedule.id))
        .sort((a, b) => (a.route_order || 999) - (b.route_order || 999));

      if (!time) return daySchedules.length;

      const [h, m] = time.split(':').map(Number);
      const targetMinutes = h * 60 + m;

      for (let i = 0; i < daySchedules.length; i++) {
        const s = daySchedules[i];
        if (s.start_time) {
          const [sh, sm] = s.start_time.split(':').map(Number);
          const scheduleMinutes = sh * 60 + sm;
          if (targetMinutes <= scheduleMinutes) {
            return i;
          }
        }
      }
      return daySchedules.length;
    },

    handleDayColumnDragOver(event, date) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      // Cache values for RAF callback
      const x = event.clientX;
      const y = event.clientY;
      const columnEl = event.currentTarget;

      // Cache column rect and schedules on first drag over this column
      if (this._dragTargetDate !== date) {
        this._dragColumnRect = columnEl.getBoundingClientRect();
        this._dragTargetDate = date;
        // Pre-compute and cache schedules for this day
        this._dragDaySchedules = this.schedules
          .filter(s => s.scheduled_date === date && (!this._draggedSchedule || s.id !== this._draggedSchedule.id))
          .sort((a, b) => (a.route_order || 999) - (b.route_order || 999));
      }

      // Throttle updates with requestAnimationFrame
      if (!this._dragRafPending) {
        this._dragRafPending = true;
        requestAnimationFrame(() => {
          this._dragRafPending = false;
          this.updateDragState(x, y, date);
        });
      }
    },

    handleDayColumnDragLeave(event, date) {
      // Only clear if actually leaving the column
      if (!event.currentTarget.contains(event.relatedTarget)) {
        if (this._dragTargetDate === date) {
          this._dragTargetDate = null;
          this._dragTargetIndex = null;
          this._dragPreviewTime = null;
          this._dragColumnRect = null;
          this._dragDaySchedules = null;
        }
      }
    },

    handleScheduleDragOver(event, date, _scheduleId, _index) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';

      // Cache values for RAF callback
      const x = event.clientX;
      const y = event.clientY;
      const columnEl = event.currentTarget.closest('.schedule-day-column');

      // Cache column rect and schedules on first drag over this column
      if (this._dragTargetDate !== date) {
        this._dragColumnRect = columnEl.getBoundingClientRect();
        this._dragTargetDate = date;
        // Pre-compute and cache schedules for this day
        this._dragDaySchedules = this.schedules
          .filter(s => s.scheduled_date === date && (!this._draggedSchedule || s.id !== this._draggedSchedule.id))
          .sort((a, b) => (a.route_order || 999) - (b.route_order || 999));
      }

      // Throttle updates with requestAnimationFrame
      if (!this._dragRafPending) {
        this._dragRafPending = true;
        requestAnimationFrame(() => {
          this._dragRafPending = false;
          this.updateDragState(x, y, date);
        });
      }
    },

    handleScheduleDragLeave(_event) {
      // Don't clear - let parent column handle state
    },

    updateDragState(x, y, date) {
      if (!this._draggedSchedule || !this._dragColumnRect) return;

      // Calculate time from cached rect (avoids layout thrashing)
      const rect = this._dragColumnRect;
      const relativeY = y - rect.top;
      const percent = Math.max(0, Math.min(1, relativeY / rect.height));
      const totalMinutes = (this._scheduleEndHour - this._scheduleStartHour) * 60;
      const minutesFromStart = percent * totalMinutes;
      const snappedMinutes = this.snapTo15Min(minutesFromStart);
      const totalMinutesFromMidnight = (this._scheduleStartHour * 60) + snappedMinutes;
      const time = this.minutesToTimeString(totalMinutesFromMidnight);

      // Only update if time changed (reduces reactive updates)
      if (time !== this._dragPreviewTime) {
        this._dragPreviewTime = time;
        this._dragTargetIndex = this.calculateInsertIndex(date, time);
      }

      // Direct DOM manipulation for indicator (bypasses Alpine reactivity)
      const indicator = document.querySelector('.schedule-time-indicator');
      if (indicator) {
        indicator.textContent = this.formatTime12Hour(time);
        indicator.style.left = `${x}px`;
        indicator.style.top = `${y - 28}px`;
      }
    },

    async handleScheduleDropBetween(event, targetDate, _targetScheduleId, _position) {
      event.preventDefault();
      event.stopPropagation();

      if (!this._draggedSchedule) return;
      const draggedSchedule = this._draggedSchedule;
      const droppedTime = this._dragPreviewTime;
      const insertIndex = this._dragTargetIndex;

      // Clear drag state immediately
      this._draggedSchedule = null;
      this._dragTargetDate = null;
      this._dragTargetIndex = null;
      this._dragPreviewTime = null;
      this._dragDaySchedules = null;

      // Save original values for rollback
      const originalDate = draggedSchedule.scheduled_date;
      const originalTime = draggedSchedule.start_time;
      const originalOrders = new Map();

      // Calculate new order
      const existingSchedules = this.schedules
        .filter(s => s.scheduled_date === targetDate && s.id !== draggedSchedule.id)
        .sort((a, b) => (a.route_order || 999) - (b.route_order || 999));

      // Save original orders for rollback
      existingSchedules.forEach(s => originalOrders.set(s.id, s.route_order));
      originalOrders.set(draggedSchedule.id, draggedSchedule.route_order);

      // Build new order array
      const newOrder = [...existingSchedules];
      newOrder.splice(insertIndex, 0, draggedSchedule);
      const newOrderIds = newOrder.map(s => s.id);

      // OPTIMISTIC UPDATE - apply changes immediately
      draggedSchedule.scheduled_date = targetDate;
      if (droppedTime) {
        draggedSchedule.start_time = droppedTime;
      }
      newOrder.forEach((s, i) => { s.route_order = i + 1; });

      // Sync with server in background
      const updateData = { scheduled_date: targetDate };
      if (droppedTime && droppedTime !== originalTime) {
        updateData.start_time = droppedTime;
      }

      try {
        // Fire both requests in parallel
        const [scheduleResp, orderResp] = await Promise.all([
          fetch(`/api/schedules/${draggedSchedule.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          }),
          fetch(`/api/schedules/reorder/${targetDate}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule_ids: newOrderIds })
          })
        ]);

        if (!scheduleResp.ok || !orderResp.ok) {
          throw new Error('Failed to save changes');
        }
      } catch (e) {
        // ROLLBACK on error
        console.error('Schedule drop error:', e);
        draggedSchedule.scheduled_date = originalDate;
        draggedSchedule.start_time = originalTime;
        originalOrders.forEach((order, id) => {
          const s = this.schedules.find(x => x.id === id);
          if (s) s.route_order = order;
        });
        Alpine.store('notifications').add('Failed to save - changes reverted', 'error');
      }
    },

    async handleScheduleDrop(event, newDate) {
      // Fallback: drop on empty area of a day column (append to end)
      if (!this._draggedSchedule) return;
      await this.handleScheduleDropBetween(event, newDate, null, 'after');
    },

    // =========================================================================
    // SCHEDULE RESIZE
    // =========================================================================

    startResize(event, schedule, date) {
      // Get the column element for calculating time from position
      const columnEl = event.target.closest('.schedule-day-column');
      if (!columnEl) return;

      // Get all schedules for this day, sorted by route_order
      const daySchedules = this.schedules
        .filter(s => s.scheduled_date === date)
        .sort((a, b) => (a.route_order || 999) - (b.route_order || 999));

      // Save original values for all schedules (for rollback and cascade)
      this._resizeOriginals = new Map();
      daySchedules.forEach(s => {
        this._resizeOriginals.set(s.id, {
          start_time: s.start_time,
          end_time: s.end_time,
          estimated_duration: s.estimated_duration
        });
      });

      this._resizingSchedule = schedule;
      this._resizeDate = date;
      this._resizeDaySchedules = daySchedules;
      this._resizeColumnRect = columnEl.getBoundingClientRect();
      this._resizeStartY = event.clientY || event.touches?.[0]?.clientY;
      this._resizePreviewEndTime = schedule.end_time;

      document.body.classList.add('schedule-resizing-active');

      // Bind handlers if not already bound
      if (!this._boundResizeMove) {
        this._boundResizeMove = this.handleResizeMove.bind(this);
        this._boundResizeEnd = this.handleResizeEnd.bind(this);
      }

      // Add listeners
      document.addEventListener('mousemove', this._boundResizeMove);
      document.addEventListener('mouseup', this._boundResizeEnd);
      document.addEventListener('touchmove', this._boundResizeMove, { passive: false });
      document.addEventListener('touchend', this._boundResizeEnd);
    },

    timeToMinutes(timeStr) {
      if (!timeStr) return null;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    },

    handleResizeMove(event) {
      if (!this._resizingSchedule || !this._resizeColumnRect) return;
      event.preventDefault();

      const y = event.clientY || event.touches?.[0]?.clientY;
      const rect = this._resizeColumnRect;

      // Calculate time from Y position
      const relativeY = y - rect.top;
      const percent = Math.max(0, Math.min(1, relativeY / rect.height));
      const totalMinutes = (this._scheduleEndHour - this._scheduleStartHour) * 60;
      const minutesFromStart = percent * totalMinutes;
      const snappedMinutes = this.snapTo15Min(minutesFromStart);
      const newEndMinutes = (this._scheduleStartHour * 60) + snappedMinutes;

      // Get ORIGINAL start time of resizing schedule
      const resizingOriginal = this._resizeOriginals.get(this._resizingSchedule.id);
      const startMinutes = this.timeToMinutes(resizingOriginal.start_time) || (8 * 60);

      // Ensure end time is at least 15 min after start time
      if (newEndMinutes <= startMinutes + 15) {
        return;
      }

      const newEndTime = this.minutesToTimeString(newEndMinutes);

      // Skip if no change
      if (newEndTime === this._resizePreviewEndTime) return;

      this._resizePreviewEndTime = newEndTime;

      // Update the resizing schedule
      this._resizingSchedule.end_time = newEndTime;
      const durationHours = (newEndMinutes - startMinutes) / 60;
      this._resizingSchedule.estimated_duration = durationHours;

      // CASCADE: Recalculate ALL subsequent events from their ORIGINAL positions
      const resizingIndex = this._resizeDaySchedules.findIndex(s => s.id === this._resizingSchedule.id);
      let prevEndMinutes = newEndMinutes;

      for (let i = resizingIndex + 1; i < this._resizeDaySchedules.length; i++) {
        const s = this._resizeDaySchedules[i];
        const original = this._resizeOriginals.get(s.id);
        const originalStartMinutes = this.timeToMinutes(original.start_time);
        const originalDuration = original.estimated_duration || 0.5;
        const originalDurationMinutes = originalDuration * 60;

        if (originalStartMinutes === null) {
          break; // No start time, stop cascading
        }

        // Check if this event needs to be pushed (based on ORIGINAL position)
        if (originalStartMinutes < prevEndMinutes + 15) {
          // Push forward
          const newStartMinutes = prevEndMinutes + 15;
          s.start_time = this.minutesToTimeString(newStartMinutes);
          s.end_time = this.minutesToTimeString(newStartMinutes + originalDurationMinutes);
          s.estimated_duration = originalDuration;
          prevEndMinutes = newStartMinutes + originalDurationMinutes;
        } else {
          // No push needed - restore to original position
          s.start_time = original.start_time;
          s.end_time = original.end_time;
          s.estimated_duration = original.estimated_duration;
          prevEndMinutes = originalStartMinutes + originalDurationMinutes;
        }
      }
    },

    async handleResizeEnd(_event) {
      if (!this._resizingSchedule) return;

      const originals = this._resizeOriginals;
      const daySchedules = this._resizeDaySchedules;

      // Clear resize state
      this._resizingSchedule = null;
      this._resizeColumnRect = null;
      this._resizePreviewEndTime = null;
      this._resizeDaySchedules = null;
      this._resizeDate = null;

      document.body.classList.remove('schedule-resizing-active');
      document.removeEventListener('mousemove', this._boundResizeMove);
      document.removeEventListener('mouseup', this._boundResizeEnd);
      document.removeEventListener('touchmove', this._boundResizeMove);
      document.removeEventListener('touchend', this._boundResizeEnd);

      // Collect all changed schedules
      const updates = [];
      daySchedules.forEach(s => {
        const orig = originals.get(s.id);
        if (s.start_time !== orig.start_time || s.end_time !== orig.end_time) {
          updates.push({
            id: s.id,
            start_time: s.start_time,
            end_time: s.end_time,
            estimated_duration: s.estimated_duration
          });
        }
      });

      // Skip if no changes
      if (updates.length === 0) {
        this._resizeOriginals = null;
        return;
      }

      // Sync all changes with server in parallel
      try {
        const promises = updates.map(u =>
          fetch(`/api/schedules/${u.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              start_time: u.start_time,
              end_time: u.end_time,
              estimated_duration: u.estimated_duration
            })
          })
        );

        const responses = await Promise.all(promises);
        const allOk = responses.every(r => r.ok);

        if (!allOk) throw new Error('Failed to save some changes');
      } catch (e) {
        // Rollback all schedules
        console.error('Resize error:', e);
        daySchedules.forEach(s => {
          const orig = originals.get(s.id);
          s.start_time = orig.start_time;
          s.end_time = orig.end_time;
          s.estimated_duration = orig.estimated_duration;
        });
        Alpine.store('notifications').add('Failed to save - changes reverted', 'error');
      }

      this._resizeOriginals = null;
    },

  };
};
