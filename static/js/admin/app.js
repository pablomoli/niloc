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
    calendarMonth: new Date().toISOString().slice(0, 7),
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
    },
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

    init() {
      this.ensureTabData('dashboard');
      document.addEventListener('jobCreated', async () => {
        await Promise.all([
          this.loadJobs(true),
          this.loadDashboardMetrics(true),
        ]);
        Alpine.store('notifications').add('Job created', 'success');
      });
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
      const filtersActive =
        this.jobSearch.trim().length > 0 ||
        (this.selectedStatuses.length > 0 && this.selectedStatuses.length < this.statuses.length);
      const totalRecords = this.jobsLoadedAll || filtersActive
        ? this.filteredJobs.length
        : (this.jobsMeta.total || this.filteredJobs.length);
      this.totalPages = Math.max(1, Math.ceil(totalRecords / this.jobsPerPage));
      if (this.currentPage > this.totalPages) {
        this.currentPage = Math.max(1, this.totalPages);
      }
    },

    getPageInfo() {
      const filtersActive =
        this.jobSearch.trim().length > 0 ||
        (this.selectedStatuses.length > 0 && this.selectedStatuses.length < this.statuses.length);
      const totalRecords = this.jobsLoadedAll || filtersActive
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
      this.loadCalendarMonth(this.calendarMonth);
    },

    goToCurrentMonth() {
      this.calendarMonth = new Date().toISOString().slice(0, 7);
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
    openJobTags(job) {
      this.jobTagsModal.job = job;
      this.jobTagsModal.input = '';
      this.tagSuggestions = [];
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
      };
      document.getElementById("editJobModal").classList.remove("hidden");
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
      return hasSearch || hasStatusFilter || hasTagFilter;
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

  };
};
