class AdminSPA {
  constructor() {
    // Section management
    this.currentSection = "dashboard";

    // Caching system for performance
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes

    this.allJobs = []; // All jobs from server
    this.filteredJobs = []; // Currently displayed jobs after filtering
    this.currentFilters = {
      search: "", // Combined search term (job numbers, clients, addresses)
      status: "", // Status filter only
    };

    // Debounced filtering for smooth UX (150ms delay)
    this.debouncedFilter = this.debounce(() => {
      this.applyFilters();
    }, 150);

    this.allDeletedJobs = []; // All deleted jobs from server
    this.filteredDeletedJobs = []; // Currently displayed deleted jobs after filtering
    this.currentDeletedFilters = {
      search: "", // Search term for deleted jobs
    };

    // Debounced filtering for deleted jobs
    this.debouncedFilterDeleted = this.debounce(() => {
      this.applyDeletedFilters();
    }, 150);

    this.init();
  }

  // =============================================================================
  // INITIALIZATION & NAVIGATION
  // =============================================================================

  init() {
    this.setupNavigation();

    // Handle browser back/forward buttons
    window.addEventListener("popstate", (e) => {
      const section = e.state?.section || "dashboard";
      this.loadSection(section, false);
    });

    // Load initial section from URL hash
    const initialSection = window.location.hash.replace("#", "") || "dashboard";
    this.loadSection(initialSection, true);
  }

  setupNavigation() {
    const navItems = document.querySelectorAll(".spa-nav-item");
    navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        const section = item.dataset.section;
        if (section) {
          e.preventDefault();
          this.loadSection(section, true);
        }
      });
    });
  }
  // Add this method to your AdminSPA class in admin_spa.js

  async permanentDeleteJob(currentJobNumber, originalJobNumber, client) {
    // First confirmation - basic warning
    const firstConfirm = confirm(
      `⚠️ PERMANENT DELETE WARNING ⚠️\n\n` +
        `Job: ${originalJobNumber}\n` +
        `Client: ${client}\n\n` +
        `This will PERMANENTLY delete this job and ALL related data.\n` +
        `This action CANNOT be undone!\n\n` +
        `Are you absolutely sure you want to continue?`,
    );

    if (!firstConfirm) {
      return; // User cancelled
    }

    // Second confirmation - make them type the job number
    const typeConfirm = prompt(
      `🚨 FINAL CONFIRMATION 🚨\n\n` +
        `To permanently delete job "${originalJobNumber}", please type the ORIGINAL job number below:\n\n` +
        `Type "${originalJobNumber}" to confirm permanent deletion:`,
    );

    if (typeConfirm !== originalJobNumber) {
      if (typeConfirm !== null) {
        // User didn't cancel, just typed wrong
        this.showError(
          `Confirmation failed. You typed "${typeConfirm}" but expected "${originalJobNumber}"`,
        );
      }
      return;
    }

    // Third confirmation - final scary warning
    const finalConfirm = confirm(
      `🔥 LAST CHANCE TO CANCEL 🔥\n\n` +
        `You are about to PERMANENTLY DELETE:\n` +
        `• Job ${originalJobNumber} (${client})\n` +
        `• ALL fieldwork entries for this job\n` +
        `• ALL related data\n\n` +
        `THIS CANNOT BE REVERSED!\n\n` +
        `Click OK to permanently delete forever, or Cancel to abort.`,
    );

    if (!finalConfirm) {
      return; // User got cold feet
    }

    try {
      // Show loading state
      this.showLoading();

      const response = await fetch(
        `/api/jobs/${currentJobNumber}/permanent-delete`,
        {
          method: "DELETE",
        },
      );

      const result = await response.json();

      if (response.ok) {
        this.showSuccess(`Job ${originalJobNumber} permanently deleted`);

        // Refresh the deleted jobs display
        this.invalidateCache("deleted-jobs");
        this.invalidateCache("dashboard");

        // Reload the deleted jobs section
        await this.loadAllDeletedJobs();
        this.applyDeletedFilters();
      } else {
        this.showError(result.error || "Failed to permanently delete job");
      }
    } catch (error) {
      console.error("Permanent delete error:", error);
      this.showError("Network error: " + error.message);
    } finally {
      this.hideLoading();
    }
  }
  // =============================================================================
  // SECTION LOADING & CACHING
  // =============================================================================

  async loadSection(section, updateHistory = true) {
    console.log(`Loading section: ${section}`);

    // Don't reload if already current and cached
    if (section === this.currentSection && this.isCacheValid(section)) {
      return;
    }

    this.showLoading();

    try {
      this.updateNavigation(section);
      await this.loadSectionContent(section);

      // Update browser history
      if (updateHistory) {
        const url = `/admin#${section}`;
        history.pushState({ section }, "", url);
      }

      this.currentSection = section;
    } catch (error) {
      console.error("Error loading section:", error);
      this.showError(`Failed to load ${section}: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  async loadSectionContent(section) {
    // Check cache first
    if (this.isCacheValid(section)) {
      console.log(`Using cached data for ${section}`);
      const cachedData = this.cache.get(section);
      this.renderSection(section, cachedData);
      return;
    }

    // Fetch fresh data
    console.log(`Fetching fresh data for ${section}`);
    const data = await this.fetchSectionData(section);

    // Cache the data
    this.cache.set(section, data);
    this.cacheTimestamps.set(section, Date.now());

    this.renderSection(section, data);
  }

  async fetchSectionData(section) {
    const endpoints = {
      dashboard: "/admin/api/dashboard",
      jobs: "/api/jobs?per_page=10000", // Load ALL jobs, no pagination
      "deleted-jobs": "/api/jobs/deleted",
      users: "/api/users",
    };

    const response = await fetch(endpoints[section]);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Store all jobs when loading jobs section
    if (section === "jobs") {
      this.allJobs = data.jobs || [];
      this.filteredJobs = [...this.allJobs]; // Initialize filtered jobs
    }

    if (section === "deleted-jobs") {
      this.allDeletedJobs = data.jobs || [];
      this.filteredDeletedJobs = [...this.allDeletedJobs];
    }

    return data;
  }

  renderSection(section, data) {
    // Hide all sections
    document.querySelectorAll(".content-section").forEach((s) => {
      s.classList.remove("active");
    });

    // Show target section
    const targetSection = document.getElementById(`${section}-section`);
    targetSection.classList.add("active");

    // Render content based on section
    switch (section) {
      case "dashboard":
        this.renderDashboard(data);
        break;
      case "jobs":
        this.renderJobs(data);
        break;
      case "users":
        this.renderUsers(data);
        break;
      case "deleted-jobs":
        this.renderDeletedJobs(data);
        break;
    }
  }

  // =============================================================================
  // REAL-TIME SEARCH & FILTERING - The core functionality
  // =============================================================================

  async performRealTimeSearch(searchTerm) {
    console.log("Performing real-time search for:", searchTerm);

    try {
      this.showSearchLoading(true);
      this.currentFilters.search = searchTerm;

      // If empty search, load all jobs locally
      if (!searchTerm.trim()) {
        await this.loadAllJobs();
        this.applyFilters();
        return;
      }

      // Use the backend search endpoint for fuzzy matching
      const response = await fetch(
        `/api/jobs/search?q=${encodeURIComponent(searchTerm.trim())}`,
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();

      // Store search results as our new "all jobs"
      this.allJobs = data.jobs || [];

      // Apply any additional filters (like status)
      this.applyFilters();
    } catch (error) {
      console.error("Real-time search error:", error);
      this.showError(`Search failed: ${error.message}`);
    } finally {
      this.showSearchLoading(false);
    }
  }

  async loadAllJobs() {
    console.log("Loading all jobs");

    try {
      const response = await fetch("/api/jobs?per_page=10000");
      if (!response.ok) {
        throw new Error(`Failed to load jobs: ${response.status}`);
      }
      const data = await response.json();
      this.allJobs = data.jobs || [];
    } catch (error) {
      console.error("Load all jobs error:", error);
      this.showError(`Failed to load jobs: ${error.message}`);
    }
  }

  applyFilters() {
    console.log("Applying filters:", this.currentFilters);

    // Start with all jobs from current search/load
    let filtered = [...this.allJobs];

    // Apply status filter if selected
    if (this.currentFilters.status) {
      filtered = filtered.filter(
        (job) => job.status === this.currentFilters.status,
      );
    }

    // Store filtered results
    this.filteredJobs = filtered;

    // Update the display immediately
    this.updateJobsDisplay();
  }

  updateJobsDisplay() {
    // Update search results info banner
    this.updateSearchResultsDisplay(
      this.currentFilters.search,
      this.filteredJobs.length,
    );

    // Update the jobs table container with new HTML
    const tableContainer = document.getElementById("jobs-table-container");
    if (tableContainer) {
      tableContainer.innerHTML = this.renderJobsTableSimple(this.filteredJobs);
    }
  }

  // =============================================================================
  // SIMPLIFIED JOBS RENDERING - No pagination complexity
  // =============================================================================

  renderJobs(data) {
    console.log("Rendering jobs section");

    const content = document.getElementById("jobs-content");

    // Status options for dropdown filter
    const statusOptions = [
      "On Hold/Pending",
      "Needs Fieldwork",
      "Fieldwork Complete/Needs Office Work",
      "To Be Printed/Packaged",
      "Survey Complete/Invoice Sent/Unpaid",
      "Set/Flag Pins",
      "Completed/To Be Filed",
      "Ongoing Site Plan",
      "Estimate/Quote Available",
    ];

    content.innerHTML = `
      <!-- Action Buttons -->
      <div class="section-actions" style="margin-bottom: 20px;">
        <button onclick="adminSPA.showCreateJobModal()" class="spa-btn spa-btn-primary">
          + Create New Job
        </button>
      </div>
      
      <!-- Simplified Real-Time Filters - No Apply button needed -->
      <div class="spa-form-card">
        <h3>🔍 Search & Filter Jobs</h3>
        <div style="display: grid; grid-template-columns: 2fr 1fr auto; gap: 16px; align-items: end;">
          <!-- Unified Search Box - searches everything -->
          <div>
            <label for="unified-search" style="display: block; margin-bottom: 4px; font-weight: 500;">Search Everything</label>
            <input 
              type="text" 
              id="unified-search" 
              placeholder="Search job numbers, clients, addresses..." 
              class="spa-input" 
              value="${this.currentFilters.search}"
              >
            
          </div>
          
          <!-- Status Filter Dropdown -->
          <div>
            <label for="status-filter" style="display: block; margin-bottom: 4px; font-weight: 500;">Status Filter</label>
            <select id="status-filter" class="spa-input">
              <option value="">All Statuses</option>
              ${statusOptions
                .map(
                  (status) =>
                    `<option value="${status}" ${this.currentFilters.status === status ? "selected" : ""}>${status}</option>`,
                )
                .join("")}
            </select>
          </div>
          
          <!-- Clear All Button -->
          <div>
            <button type="button" onclick="adminSPA.clearAllFilters()" class="spa-btn spa-btn-secondary">
              Clear All
            </button>
          </div>
        </div>
      </div>
      
      <!-- Search Results Info Banner -->
      <div id="search-results-info"></div>
      
      <!-- Jobs Table - No Pagination -->
      <div class="spa-form-card">
        <h3>All Jobs (${this.filteredJobs.length} shown)</h3>
        <div id="jobs-table-container">
          ${this.renderJobsTableSimple(data.jobs || [])}
        </div>
      </div>
      
      <!-- Modals for job creation/editing -->
      ${this.renderJobModals(statusOptions)}
    `;

    // Setup real-time event listeners
    this.setupRealTimeFiltering();

    // Load all jobs initially and apply any existing filters
    this.loadAllJobs().then(() => {
      this.applyFilters();
    });
  }

  renderDeletedJobs(data) {
    console.log("Rendering deleted jobs section");

    const content = document.getElementById("deleted-jobs-content");

    content.innerHTML = `
    <!-- Info Banner -->
    <div class="spa-form-card" style="background: linear-gradient(135deg, #fee2e2, #fef2f2); border-left: 4px solid #ef4444;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 24px;">🗑️</span>
        <div>
          <h3 style="margin: 0; color: #dc2626;">Deleted Jobs Management</h3>
          <p style="margin: 4px 0 0 0; color: #7f1d1d;">
            Jobs are soft-deleted and can be restored. Original job numbers are preserved.
          </p>
        </div>
      </div>
    </div>

    <!-- Search & Actions -->
    <div class="spa-form-card">
      <h3>🔍 Search Deleted Jobs</h3>
      <div style="display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: end;">
        <!-- Search Box -->
        <div>
          <label for="deleted-jobs-search" style="display: block; margin-bottom: 4px; font-weight: 500;">
            Search deleted jobs
          </label>
          <input 
            type="text" 
            id="deleted-jobs-search" 
            placeholder="Search by job number, client, or address..." 
            class="spa-input" 
            value="${this.currentDeletedFilters.search}"
          >
        </div>
        
        <!-- Clear Button -->
        <div>
          <button type="button" onclick="adminSPA.clearDeletedFilters()" class="spa-btn spa-btn-secondary">
            Clear Search
          </button>
        </div>
      </div>
    </div>

    <!-- Search Results Info -->
    <div id="deleted-search-results-info"></div>

    <!-- Deleted Jobs Table -->
    <div class="spa-form-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3>Deleted Jobs (${this.filteredDeletedJobs.length} shown)</h3>
        ${
          this.filteredDeletedJobs.length > 0
            ? `
          <div style="color: #6b7280; font-size: 0.875rem;">
            💡 Tip: Use the Restore button to bring jobs back to active status
          </div>
        `
            : ""
        }
      </div>
      
      <div id="deleted-jobs-table-container">
        ${this.renderDeletedJobsTable(data.jobs || [])}
      </div>
    </div>

    <!-- Restore Confirmation Modal -->
    ${this.renderRestoreModal()}
  `;

    // Setup search functionality
    this.setupDeletedJobsSearch();

    // Load and apply any existing filters
    this.applyDeletedFilters();
  }
  renderDeletedJobsTable(deletedJobs) {
    // Show empty state if no deleted jobs
    if (!deletedJobs || deletedJobs.length === 0) {
      return `
      <div class="no-results" style="text-align: center; padding: 60px; color: #6b7280;">
        <div style="font-size: 48px; margin-bottom: 16px;">✨</div>
        <h3 style="margin: 0 0 8px 0;">No deleted jobs found</h3>
        <p style="margin: 0;">
          ${
            this.currentDeletedFilters.search
              ? "Try adjusting your search terms"
              : "All your jobs are active - that's great!"
          }
        </p>
      </div>
    `;
    }

    // Render deleted jobs table
    return `
    <table class="spa-table">
      <thead>
        <tr>
          <th>Original Job #</th>
          <th>Current Job #</th>
          <th>Client</th>
          <th>Address</th>
          <th>County</th>
          <th>Deleted Date</th>
          <th>Deleted By</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${deletedJobs
          .map(
            (job) => `
          <tr>
            <td>
              <strong style="color: #dc2626;">${job.original_job_number || job.job_number}</strong>
            </td>
            <td>
              <code style="font-size: 0.875rem; color: #6b7280;">${job.job_number}</code>
            </td>
            <td>${job.client}</td>
            <td>${job.address}</td>
            <td>${job.county || "N/A"}</td>
            <td>
              ${
                job.deleted_at
                  ? new Date(job.deleted_at + "Z").toLocaleDateString() +
                    " " +
                    new Date(job.deleted_at + "Z").toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "N/A"
              }
            </td>
            <td>${job.deleted_by || "System"}</td>
            <td>
              <div class="action-buttons">
                <button 
                onclick="adminSPA.showRestoreJobModal('${job.original_job_number || job.job_number}', '${job.job_number}', '${job.client}')" 
                class="spa-btn spa-btn-small spa-btn-success"
                title="Restore this job to active status"
                >
                Restore
                </button>
                <button 
                onclick="adminSPA.viewDeletedJobDetails('${job.job_number}')" 
                class="spa-btn spa-btn-small spa-btn-secondary"
                >
                View
                </button>
                <button 
                onclick="adminSPA.permanentDeleteJob('${job.job_number}', '${job.original_job_number || job.job_number}', '${job.client}')" 
                class="spa-btn spa-btn-small spa-btn-danger"
                title="Permanently delete this job - cannot be undone!"
                style="background-color: #dc2626; border-color: #dc2626;"
                >
                Delete Forever
                </button>
              </div>
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
  }

  setupDeletedJobsSearch() {
    const searchInput = document.getElementById("deleted-jobs-search");

    if (searchInput) {
      console.log("Setting up deleted jobs search");

      // Main search input - triggers debounced search
      searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value;
        this.currentDeletedFilters.search = searchTerm;

        if (searchTerm.trim()) {
          // Use backend search for deleted jobs
          this.performDeletedJobsSearch(searchTerm);
        } else {
          // For empty search, just filter locally with debounce
          this.debouncedFilterDeleted();
        }
      });

      // Enter key for immediate search
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.debouncedFilterDeleted.cancel &&
            this.debouncedFilterDeleted.cancel();
          if (e.target.value.trim()) {
            this.performDeletedJobsSearch(e.target.value);
          } else {
            this.applyDeletedFilters();
          }
        }
      });

      // Visual focus feedback
      searchInput.addEventListener("focus", () => {
        searchInput.style.borderColor = "#dc2626";
        searchInput.style.boxShadow = "0 0 0 3px rgba(220, 38, 38, 0.1)";
      });

      searchInput.addEventListener("blur", () => {
        searchInput.style.borderColor = "";
        searchInput.style.boxShadow = "";
      });
    }
  }
  async performDeletedJobsSearch(searchTerm) {
    console.log("Performing deleted jobs search for:", searchTerm);

    try {
      this.showDeletedSearchLoading(true);
      this.currentDeletedFilters.search = searchTerm;

      // If empty search, load all deleted jobs locally
      if (!searchTerm.trim()) {
        await this.loadAllDeletedJobs();
        this.applyDeletedFilters();
        return;
      }

      // Use the backend search endpoint for deleted jobs
      const response = await fetch(
        `/api/jobs/deleted?q=${encodeURIComponent(searchTerm.trim())}`,
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();

      // Store search results as our new "all deleted jobs"
      this.allDeletedJobs = data.jobs || [];

      // Apply filters (though there aren't any additional ones for deleted jobs yet)
      this.applyDeletedFilters();
    } catch (error) {
      console.error("Deleted jobs search error:", error);
      this.showError(`Search failed: ${error.message}`);
    } finally {
      this.showDeletedSearchLoading(false);
    }
  }
  async loadAllDeletedJobs() {
    console.log("Loading all deleted jobs");

    try {
      const response = await fetch("/api/jobs/deleted");
      if (!response.ok) {
        throw new Error(`Failed to load deleted jobs: ${response.status}`);
      }
      const data = await response.json();
      this.allDeletedJobs = data.jobs || [];
    } catch (error) {
      console.error("Load all deleted jobs error:", error);
      this.showError(`Failed to load deleted jobs: ${error.message}`);
    }
  }
  applyDeletedFilters() {
    console.log("Applying deleted jobs filters:", this.currentDeletedFilters);

    // Start with all deleted jobs from current search/load
    let filtered = [...this.allDeletedJobs];

    // No additional filters for deleted jobs yet, but could add status filters later

    // Store filtered results
    this.filteredDeletedJobs = filtered;

    // Update the display immediately
    this.updateDeletedJobsDisplay();
  }

  updateDeletedJobsDisplay() {
    // Update search results info banner
    this.updateDeletedSearchResultsDisplay(
      this.currentDeletedFilters.search,
      this.filteredDeletedJobs.length,
    );

    // Update the deleted jobs table container with new HTML
    const tableContainer = document.getElementById(
      "deleted-jobs-table-container",
    );
    if (tableContainer) {
      tableContainer.innerHTML = this.renderDeletedJobsTable(
        this.filteredDeletedJobs,
      );
    }

    // Update section title with count
    const sectionTitle = document.querySelector("#deleted-jobs-section h3");
    if (sectionTitle) {
      sectionTitle.textContent = `Deleted Jobs (${this.filteredDeletedJobs.length} shown)`;
    }
  }
  updateDeletedSearchResultsDisplay(searchTerm, totalResults = null) {
    const searchInfo = document.getElementById("deleted-search-results-info");
    if (!searchInfo) return;

    if (searchTerm && searchTerm.trim()) {
      const resultText =
        totalResults !== null
          ? `Found ${totalResults} deleted jobs matching "${searchTerm}"`
          : `Searching deleted jobs for "${searchTerm}"...`;

      searchInfo.innerHTML = `
      <div class="search-results-notice" style="color: #dc2626; background: linear-gradient(135deg, #fee2e2, #fef2f2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #dc2626;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🗑️</span>
          <span style="font-weight: 500;">${resultText}</span>
        </div>
      </div>
    `;
    } else {
      searchInfo.innerHTML = "";
    }
  }
  showDeletedSearchLoading(show) {
    const searchInput = document.getElementById("deleted-jobs-search");
    if (searchInput) {
      if (show) {
        searchInput.style.background =
          '#f3f4f6 url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEwIDNWN00xMCAxN1YxM00xNyAxMEgxM00zIDEwSDciIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIHR5cGU9InJvdGF0ZSIgdmFsdWVzPSIwIDEwIDEwOzM2MCAxMCAxMCIgZHVyPSIxcyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiLz48L3N2Zz4=") no-repeat right 12px center';
        searchInput.style.backgroundSize = "16px 16px";
      } else {
        searchInput.style.background = "";
        searchInput.style.backgroundSize = "";
      }
    }
  }
  clearDeletedFilters() {
    console.log("Clearing deleted jobs filters");

    // Clear form inputs
    const searchInput = document.getElementById("deleted-jobs-search");
    if (searchInput) searchInput.value = "";

    // Reset filter state
    this.currentDeletedFilters = { search: "" };

    // Load all deleted jobs and show them
    this.loadAllDeletedJobs().then(() => {
      this.applyDeletedFilters();
    });
  }
  renderRestoreModal() {
    return `
    <!-- Restore Job Modal -->
    <div id="restoreJobModal" class="spa-modal">
      <div class="spa-modal-content">
        <span class="spa-close" onclick="adminSPA.closeModal('restoreJobModal')">&times;</span>
        <h2>🔄 Restore Deleted Job</h2>
        
        <div id="restore-job-info" class="spa-form-card" style="background: #f0fdf4;color: #333333; border: 1px solid #bbf7d0;">
          <!-- Job info will be populated here -->
        </div>
        
        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" onclick="adminSPA.confirmRestoreJob()" class="spa-btn spa-btn-success">
            ✅ Yes, Restore Job
          </button>
          <button type="button" onclick="adminSPA.closeModal('restoreJobModal')" class="spa-btn spa-btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;
  }
  showRestoreJobModal(originalJobNumber, currentJobNumber, client) {
    // Store restore info for confirmation
    this.restoreJobInfo = {
      originalJobNumber,
      currentJobNumber,
      client,
    };

    // Populate modal info
    const infoDiv = document.getElementById("restore-job-info");
    infoDiv.innerHTML = `
    <h4 style="margin: 0 0 12px 0; color: #15803d;">Restore Job Confirmation</h4>
    <div style="margin-bottom: 8px;">
      <strong>Original Job Number:</strong> ${originalJobNumber}
    </div>
    <div style="margin-bottom: 8px;">
      <strong>Client:</strong> ${client}
    </div>
    <div style="margin-bottom: 16px;">
      <strong>Current Status:</strong> <code style="color: #dc2626;">DELETED</code>
    </div>
    <div style="padding: 12px; background: #fef3c7; border-radius: 6px; color: #92400e; font-size: 0.875rem;">
      <strong>⚠️ Note:</strong> This will restore the job to active status with job number <strong>${originalJobNumber}</strong>. 
      Make sure no active job already exists with this number.
    </div>
  `;

    this.openModal("restoreJobModal");
  }

  async confirmRestoreJob() {
    if (!this.restoreJobInfo) {
      this.showError("No job selected for restore");
      return;
    }

    const { originalJobNumber, currentJobNumber, client } = this.restoreJobInfo;

    try {
      const response = await fetch(`/api/jobs/${currentJobNumber}/restore`, {
        method: "POST",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess(`Job ${originalJobNumber} restored successfully!`);
        this.closeModal("restoreJobModal");

        // Clear the restore info
        this.restoreJobInfo = null;

        // Refresh the deleted jobs display
        this.invalidateCache("deleted-jobs");
        this.invalidateCache("dashboard"); // Dashboard might show different counts

        // Reload the deleted jobs section
        await this.loadAllDeletedJobs();
        this.applyDeletedFilters();
      } else {
        this.showError(result.error || "Failed to restore job");
      }
    } catch (error) {
      console.error("Restore job error:", error);
      this.showError("Network error: " + error.message);
    }
  }
  async viewDeletedJobDetails(jobNumber) {
    try {
      const response = await fetch(
        `/api/jobs/${jobNumber}?include_deleted=true`,
      );
      const job = await response.json();

      if (response.ok) {
        // Show job details in a modal or alert (simple implementation)
        const details = `
Job Details:
━━━━━━━━━━━━━━━━━━━━
Original Job #: ${job.original_job_number || job.job_number}
Current Job #: ${job.job_number}
Client: ${job.client}
Address: ${job.address}
County: ${job.county || "N/A"}
Status: DELETED
Deleted: ${job.deleted_at ? new Date(job.deleted_at).toLocaleString() : "N/A"}
${job.notes ? `\nNotes: ${job.notes}` : ""}
      `;

        alert(details);
      } else {
        this.showError("Failed to load job details");
      }
    } catch (error) {
      console.error("View deleted job error:", error);
      this.showError("Network error: " + error.message);
    }
  }

  renderJobsTableSimple(jobs) {
    // Show empty state if no jobs
    if (!jobs || jobs.length === 0) {
      return `
        <div class="no-results" style="text-align: center; padding: 40px; color: #6b7280;">
          <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
          <h3 style="margin: 0 0 8px 0;">No jobs found</h3>
          <p style="margin: 0;">Try adjusting your search or filters</p>
        </div>
      `;
    }

    // Render jobs table - no pagination controls
    return `
      <table class="spa-table">
        <thead>
          <tr>
            <th>Job #</th>
            <th>Client</th>
            <th>Status</th>
            <th>Address</th>
            <th>County</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${jobs
            .map(
              (job) => `
            <tr>
              <td>${job.job_number}</td>
              <td>${job.client}</td>
              <td>${job.status || "N/A"}</td>
              <td>${job.address}</td>
              <td>${job.county || "N/A"}</td>
              <td>
                <div class="action-buttons">
                  <button onclick="adminSPA.toggleFieldwork('${job.job_number}')" class="spa-btn spa-btn-small spa-btn-secondary">Fieldwork</button>
                  <button onclick="adminSPA.editJob('${job.job_number}')" class="spa-btn spa-btn-small spa-btn-primary">Edit</button>
                  <button onclick="adminSPA.deleteJob('${job.job_number}')" class="spa-btn spa-btn-small spa-btn-danger">Delete</button>
                </div>
              </td>
            </tr>
            <!-- Expandable fieldwork row (hidden by default) -->
            <tr id="fieldwork-${job.job_number}" class="fieldwork-row" style="display: none;">
              <td colspan="6" class="fieldwork-content">
                <div id="fieldwork-content-${job.job_number}"></div>
              </td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  // =============================================================================
  // EVENT SETUP FOR REAL-TIME FILTERING
  // =============================================================================

  setupRealTimeFiltering() {
    const searchInput = document.getElementById("unified-search");
    const statusSelect = document.getElementById("status-filter");

    if (searchInput) {
      console.log("Setting up real-time search input");

      // Main search input - triggers debounced search
      searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value;
        this.currentFilters.search = searchTerm;

        if (searchTerm.trim()) {
          // Cancel any pending filter and search immediately
          this.debouncedFilter.cancel && this.debouncedFilter.cancel();
          this.performRealTimeSearch(searchTerm);
        } else {
          // For empty search, just filter locally with debounce
          this.debouncedFilter();
        }
      });

      // Enter key for immediate search (no debounce)
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.debouncedFilter.cancel && this.debouncedFilter.cancel();
          if (e.target.value.trim()) {
            this.performRealTimeSearch(e.target.value);
          } else {
            this.applyFilters();
          }
        }
      });

      // Visual focus feedback
      searchInput.addEventListener("focus", () => {
        searchInput.style.borderColor = "#2563eb";
        searchInput.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
      });

      searchInput.addEventListener("blur", () => {
        searchInput.style.borderColor = "";
        searchInput.style.boxShadow = "";
      });
    }

    if (statusSelect) {
      // Status filter - immediate application (no debounce needed)
      statusSelect.addEventListener("change", (e) => {
        this.currentFilters.status = e.target.value;
        this.applyFilters();
      });
    }
  }

  clearAllFilters() {
    console.log("Clearing all filters");

    // Clear form inputs
    const searchInput = document.getElementById("unified-search");
    const statusSelect = document.getElementById("status-filter");

    if (searchInput) searchInput.value = "";
    if (statusSelect) statusSelect.value = "";

    // Reset filter state
    this.currentFilters = { search: "", status: "" };

    // Load all jobs and show them
    this.loadAllJobs().then(() => {
      this.applyFilters();
    });
  }

  // =============================================================================
  // SEARCH UI HELPERS
  // =============================================================================

  updateSearchResultsDisplay(searchTerm, totalResults = null) {
    const searchInfo = document.getElementById("search-results-info");
    if (!searchInfo) return;

    if (searchTerm && searchTerm.trim()) {
      const resultText =
        totalResults !== null
          ? `Found ${totalResults} jobs matching "${searchTerm}"`
          : `Searching for "${searchTerm}"...`;

      searchInfo.innerHTML = `
        <div class="search-results-notice" style="color: #10b981; background: linear-gradient(135deg, #dcfce7, #f0fdf4); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #10b981;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🔍</span>
            <span style="font-weight: 500;">${resultText}</span>
          </div>
        </div>
      `;
    } else {
      searchInfo.innerHTML = "";
    }
  }

  showSearchLoading(show) {
    const searchInput = document.getElementById("unified-search");
    if (searchInput) {
      if (show) {
        // Add spinning icon to search input
        searchInput.style.background =
          '#f3f4f6 url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEwIDNWN00xMCAxN1YxM00xNyAxMEgxM00zIDEwSDciIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIHR5cGU9InJvdGF0ZSIgdmFsdWVzPSIwIDEwIDEwOzM2MCAxMCAxMCIgZHVyPSIxcyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiLz48L3N2Zz4=") no-repeat right 12px center';
        searchInput.style.backgroundSize = "16px 16px";
      } else {
        // Remove loading icon
        searchInput.style.background = "";
        searchInput.style.backgroundSize = "";
      }
    }
  }

  // =============================================================================
  // DASHBOARD RENDERING
  // =============================================================================

  renderDashboard(data) {
    const sectionHeader = document.querySelector("#dashboard-section h2");
    if (sectionHeader) {
      sectionHeader.textContent = "Dashboard Overview";
    }

    // Filter out estimates for dashboard analytics
    const filteredData = this.filterEstimatesFromData(data);

    const content = document.getElementById("dashboard-content");
    content.innerHTML = `
      <div class="dashboard-grid">
        <div class="metric-card">
          <div class="metric-number">${data.total_jobs}</div>
          <div>Total Jobs (All)</div>
        </div>
        <div class="metric-card">
          <div class="metric-number">${filteredData.total_active_jobs}</div>
          <div>Active Jobs</div>
        </div>
        <div class="metric-card">
          <div class="metric-number">${data.total_users}</div>
          <div>Total Users</div>
        </div>
      </div>
      
      <div class="spa-form-card">
        <h3>Recent Jobs (Excluding Estimates)</h3>
        <table class="spa-table">
          <thead>
            <tr>
              <th>Job #</th>
              <th>Client</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${filteredData.recent_jobs
              .map(
                (job) => `
                <tr>
                  <td>${job.job_number}</td>
                  <td>${job.client}</td>
                  <td>${job.address}</td>
                  <td>${job.status || "N/A"}</td>
                </tr>
              `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      
      <div class="spa-form-card">
        <h3>Job Status Distribution (Excluding Estimates)</h3>
        <div class="donut-chart-container">
          <div class="donut-chart-wrapper">
            <canvas id="statusDonutChart"></canvas>
          </div>
          <div class="donut-legend">
            ${Object.entries(filteredData.status_counts)
              .map(([status, count]) => {
                const percentage = (
                  (count / filteredData.total_active_jobs) *
                  100
                ).toFixed(1);
                const color = this.getStatusColor(status);
                return `
                  <div class="legend-item">
                    <span class="legend-color" style="background-color: ${color}"></span>
                    <span class="legend-text">
                      <strong>${this.getStatusDisplayName(status)}</strong>
                      <span class="legend-count">${count} jobs (${percentage}%)</span>
                    </span>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      </div>
    `;

    // Draw the donut chart after DOM is updated
    setTimeout(
      () =>
        this.drawDonutChart(
          filteredData.status_counts,
          filteredData.total_active_jobs,
        ),
      100,
    );
  }

  // Helper method to filter out estimates for dashboard analytics
  filterEstimatesFromData(data) {
    const filteredStatusCounts = {};
    Object.entries(data.status_counts || {}).forEach(([status, count]) => {
      if (status !== "Estimate/Quote Available") {
        filteredStatusCounts[status] = count;
      }
    });

    const filteredRecentJobs = (data.recent_jobs || []).filter(
      (job) => job.status !== "Estimate/Quote Available",
    );

    return {
      ...data,
      status_counts: filteredStatusCounts,
      recent_jobs: filteredRecentJobs,
      total_active_jobs: Object.values(filteredStatusCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    };
  }

  // Status color mapping
  getStatusColor(status) {
    const colorMap = {
      "On Hold/Pending": "#C0C0C0",
      "Needs Fieldwork": "#FFA500",
      "Fieldwork Complete/Needs Office Work": "#8A2BE2",
      "To Be Printed/Packaged": "#1E90FF",
      "Survey Complete/Invoice Sent/Unpaid": "#FFFF00",
      "Set/Flag Pins": "#FF0000",
      "Completed/To Be Filed": "#9ACD32",
      "Ongoing Site Plan": "#FF69B4",
      "Estimate/Quote Available": "#FFB6C1",
    };
    return colorMap[status] || "#999999";
  }

  // Status display name mapping
  getStatusDisplayName(status) {
    const nameMap = {
      "On Hold/Pending": "On Hold",
      "Needs Fieldwork": "Needs Fieldwork",
      "Fieldwork Complete/Needs Office Work": "Office Work",
      "To Be Printed/Packaged": "To Print",
      "Survey Complete/Invoice Sent/Unpaid": "Invoice Sent",
      "Set/Flag Pins": "Set Pins",
      "Completed/To Be Filed": "Completed",
      "Ongoing Site Plan": "Site Plan",
      "Estimate/Quote Available": "Estimate",
    };
    return nameMap[status] || status;
  }

  // Draw donut chart using Canvas
  drawDonutChart(statusCounts, total) {
    const canvas = document.getElementById("statusDonutChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const size = 300;

    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = 100;
    const innerRadius = 60;

    ctx.clearRect(0, 0, size, size);

    let currentAngle = -Math.PI / 2;

    Object.entries(statusCounts).forEach(([status, count]) => {
      const sliceAngle = (count / total) * 2 * Math.PI;
      const color = this.getStatusColor(status);

      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        outerRadius,
        currentAngle,
        currentAngle + sliceAngle,
      );
      ctx.arc(
        centerX,
        centerY,
        innerRadius,
        currentAngle + sliceAngle,
        currentAngle,
        true,
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      currentAngle += sliceAngle;
    });

    // Draw center circle with total count
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius - 5, 0, 2 * Math.PI);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#334155";
    ctx.font =
      'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(total, centerX, centerY - 5);

    ctx.font =
      '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = "#64748b";
    ctx.fillText("Active Jobs", centerX, centerY + 15);
  }

  // =============================================================================
  // USERS RENDERING
  // =============================================================================

  renderUsers(data) {
    const content = document.getElementById("users-content");
    content.innerHTML = `
      <!-- Create User Form -->
      <div class="spa-form-card">
        <h3>Create New User</h3>
        <form id="create-user-form" class="spa-form">
          <input type="text" id="user-name" placeholder="Full Name" required class="spa-input">
          <input type="text" id="user-username" placeholder="Username" required class="spa-input">
          <input type="password" id="user-password" placeholder="Password" required class="spa-input">
          <select id="user-role" required class="spa-input">
            <option value="">Select Role</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button type="button" onclick="adminSPA.createUser()" class="spa-btn spa-btn-primary">Create User</button>
        </form>
      </div>
      
      <!-- Users Table -->
      <div class="spa-form-card">
        <h3>Users</h3>
        <table class="spa-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Role</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(data.users || data || [])
              .map(
                (user) => `
                <tr>
                  <td>${user.username}</td>
                  <td>${user.name}</td>
                  <td><span class="role-badge ${user.role}">${user.role}</span></td>
                  <td>${user.last_login || "Never"}</td>
                  <td>
                    <div class="action-buttons">
                      <button onclick="adminSPA.resetUserPassword(${user.id})" class="spa-btn spa-btn-small spa-btn-secondary">
                        Reset Password
                      </button>
                      <button onclick="adminSPA.toggleUserRole(${user.id})" class="spa-btn spa-btn-small spa-btn-warning">
                        Make ${user.role === "user" ? "Admin" : "User"}
                      </button>
                      ${
                        user.username !== "admin"
                          ? `
                          <button onclick="adminSPA.deleteUser(${user.id}, '${user.username}')" class="spa-btn spa-btn-small spa-btn-danger">
                            Delete
                          </button>
                      `
                          : ""
                      }
                    </div>
                  </td>
                </tr>
              `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // =============================================================================
  // FIELDWORK MANAGEMENT
  // =============================================================================

  async toggleFieldwork(jobNumber) {
    const row = document.getElementById(`fieldwork-${jobNumber}`);
    const content = document.getElementById(`fieldwork-content-${jobNumber}`);

    if (row.style.display === "none" || !row.style.display) {
      row.style.display = "table-row";
      content.innerHTML = "<p>Loading fieldwork entries...</p>";
      await this.loadFieldwork(jobNumber);
    } else {
      row.style.display = "none";
    }
  }

  async loadFieldwork(jobNumber) {
    const content = document.getElementById(`fieldwork-content-${jobNumber}`);

    try {
      const response = await fetch(`/api/jobs/${jobNumber}/fieldwork`);
      const entries = await response.json();

      if (response.ok) {
        this.renderFieldwork(jobNumber, entries);
      } else {
        content.innerHTML = "<p>Failed to load fieldwork entries</p>";
      }
    } catch (error) {
      content.innerHTML = "<p>Error loading fieldwork entries</p>";
    }
  }

  renderFieldwork(jobNumber, entries) {
    const content = document.getElementById(`fieldwork-content-${jobNumber}`);

    let html = `
      <div class="fieldwork-header">
        <button onclick="adminSPA.showAddFieldworkModal('${jobNumber}')" class="spa-btn spa-btn-small spa-btn-primary">
          + Add Fieldwork
        </button>
      </div>
    `;

    if (!entries || entries.length === 0) {
      html += "<p class='empty-state'>No fieldwork entries yet.</p>";
    } else {
      html += `
        <table class="spa-table fieldwork-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Start</th>
              <th>End</th>
              <th>Crew</th>
              <th>Drone</th>
              <th>Total Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .map(
                (entry) => `
                <tr>
                  <td>${entry.work_date}</td>
                  <td>${entry.start_time}</td>
                  <td>${entry.end_time}</td>
                  <td>${entry.crew || "N/A"}</td>
                  <td>${entry.drone_card || "N/A"}</td>
                  <td>${entry.total_time || 0} hrs</td>
                  <td>
                    <div class="action-buttons">
                      <button onclick="adminSPA.editFieldwork(${entry.id})" class="spa-btn spa-btn-small spa-btn-primary">Edit</button>
                      <button onclick="adminSPA.deleteFieldwork(${entry.id}, '${jobNumber}')" class="spa-btn spa-btn-small spa-btn-danger">Delete</button>
                    </div>
                  </td>
                </tr>
              `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    content.innerHTML = html;
  }

  // =============================================================================
  // JOB & USER CRUD OPERATIONS
  // =============================================================================

  showCreateJobModal() {
    this.openModal("createJobModal");
  }

  async createJob() {
    const jobNumber = document.getElementById("new-job-number").value.trim();
    const client = document.getElementById("new-client").value.trim();
    const address = document.getElementById("new-address").value.trim();
    const status = document.getElementById("new-status").value;

    if (!jobNumber || !client || !address) {
      this.showError("Job number, client, and address are required");
      return;
    }

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_number: jobNumber,
          client: client,
          address: address,
          status: status,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Job created successfully");
        this.closeModal("createJobModal");
        document.getElementById("createJobForm").reset();
        this.invalidateCache("jobs");
        this.invalidateCache("dashboard");

        // Refresh the jobs display
        await this.loadAllJobs();
        this.applyFilters();
      } else {
        this.showError(result.error || "Failed to create job");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async editJob(jobNumber) {
    try {
      const response = await fetch(`/api/jobs/${jobNumber}`);
      const job = await response.json();

      if (response.ok) {
        // Populate edit form
        document.getElementById("edit-job-number-hidden").value =
          job.job_number;
        document.getElementById("edit-job-number").value = job.job_number;
        document.getElementById("edit-client").value = job.client || "";
        document.getElementById("edit-address").value = job.address || "";
        document.getElementById("edit-county").value = job.county || "";
        document.getElementById("edit-status").value = job.status || "";
        document.getElementById("edit-notes").value = job.notes || "";
        document.getElementById("edit-prop-appr-link").value =
          job.prop_appr_link || "";
        document.getElementById("edit-plat-link").value = job.plat_link || "";
        document.getElementById("edit-fema-link").value = job.fema_link || "";
        document.getElementById("edit-document-url").value =
          job.document_url || "";

        this.openModal("editJobModal");
      } else {
        this.showError("Failed to load job details");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async updateJob() {
    const jobNumber = document.getElementById("edit-job-number-hidden").value;
    const client = document.getElementById("edit-client").value.trim();
    const address = document.getElementById("edit-address").value.trim();
    const county = document.getElementById("edit-county").value.trim();
    const status = document.getElementById("edit-status").value;
    const notes = document.getElementById("edit-notes").value.trim();
    const propApprLink = document
      .getElementById("edit-prop-appr-link")
      .value.trim();
    const platLink = document.getElementById("edit-plat-link").value.trim();
    const femaLink = document.getElementById("edit-fema-link").value.trim();
    const documentUrl = document
      .getElementById("edit-document-url")
      .value.trim();

    if (!client || !address) {
      this.showError("Client and address are required");
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${jobNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: client,
          address: address,
          county: county,
          status: status,
          notes: notes,
          prop_appr_link: propApprLink,
          plat_link: platLink,
          fema_link: femaLink,
          document_url: documentUrl,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Job updated successfully");
        this.closeModal("editJobModal");
        this.invalidateCache("jobs");
        this.invalidateCache("dashboard");

        // Refresh the jobs display
        await this.loadAllJobs();
        this.applyFilters();
      } else {
        this.showError(result.error || "Failed to update job");
      }
    } catch (error) {
      console.error("Update job error:", error);
      this.showError("Network error: " + error.message);
    }
  }

  async deleteJob(jobNumber) {
    if (!confirm(`Are you sure you want to delete job "${jobNumber}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${jobNumber}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess(`Job ${jobNumber} deleted successfully`);
        this.invalidateCache("jobs");
        this.invalidateCache("dashboard");

        // Refresh the jobs display
        await this.loadAllJobs();
        this.applyFilters();
      } else {
        this.showError(result.error || "Failed to delete job");
      }
    } catch (error) {
      console.error("Delete job error:", error);
      this.showError("Network error: " + error.message);
    }
  }

  // =============================================================================
  // FIELDWORK CRUD OPERATIONS
  // =============================================================================

  async showAddFieldworkModal(jobNumber) {
    document.getElementById("fieldwork-job-number").value = jobNumber;
    this.openModal("addFieldworkModal");
  }

  async addFieldwork() {
    const jobNumber = document.getElementById("fieldwork-job-number").value;
    const workDate = document.getElementById("fieldwork-date").value;
    const startTime = document.getElementById("fieldwork-start").value;
    const endTime = document.getElementById("fieldwork-end").value;
    const crew = document.getElementById("fieldwork-crew").value.trim();
    const droneCard = document.getElementById("fieldwork-drone").value.trim();

    if (!workDate || !startTime || !endTime) {
      this.showError("Date, start time, and end time are required");
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${jobNumber}/fieldwork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          crew: crew,
          drone_card: droneCard,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Fieldwork entry added");
        this.closeModal("addFieldworkModal");
        document.getElementById("addFieldworkForm").reset();
        await this.loadFieldwork(jobNumber);
      } else {
        this.showError(result.error || "Failed to add fieldwork entry");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async editFieldwork(fieldworkId) {
    try {
      const response = await fetch(`/api/fieldwork/${fieldworkId}`);
      const entry = await response.json();

      if (response.ok) {
        document.getElementById("edit-fieldwork-id").value = entry.id;
        document.getElementById("edit-fieldwork-date").value = entry.work_date;
        document.getElementById("edit-fieldwork-start").value =
          entry.start_time;
        document.getElementById("edit-fieldwork-end").value = entry.end_time;
        document.getElementById("edit-fieldwork-crew").value = entry.crew || "";
        document.getElementById("edit-fieldwork-drone").value =
          entry.drone_card || "";

        this.openModal("editFieldworkModal");
      } else {
        this.showError("Failed to load fieldwork details");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async updateFieldwork() {
    const fieldworkId = document.getElementById("edit-fieldwork-id").value;
    const workDate = document.getElementById("edit-fieldwork-date").value;
    const startTime = document.getElementById("edit-fieldwork-start").value;
    const endTime = document.getElementById("edit-fieldwork-end").value;
    const crew = document.getElementById("edit-fieldwork-crew").value.trim();
    const droneCard = document
      .getElementById("edit-fieldwork-drone")
      .value.trim();

    if (!workDate || !startTime || !endTime) {
      this.showError("Date, start time, and end time are required");
      return;
    }

    try {
      const response = await fetch(`/api/fieldwork/${fieldworkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          crew: crew,
          drone_card: droneCard,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Fieldwork entry updated");
        this.closeModal("editFieldworkModal");
        if (result.fieldwork && result.fieldwork.job_number) {
          await this.loadFieldwork(result.fieldwork.job_number);
        } else {
          this.invalidateCache("jobs");
          await this.loadAllJobs();
          this.applyFilters();
        }
      } else {
        this.showError(result.error || "Failed to update fieldwork entry");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async deleteFieldwork(fieldworkId, jobNumber) {
    if (!confirm("Are you sure you want to delete this fieldwork entry?")) {
      return;
    }

    try {
      const response = await fetch(`/api/fieldwork/${fieldworkId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Fieldwork entry deleted");
        await this.loadFieldwork(jobNumber);
      } else {
        this.showError(result.error || "Failed to delete fieldwork entry");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  // =============================================================================
  // USER MANAGEMENT CRUD OPERATIONS
  // =============================================================================

  async createUser() {
    const name = document.getElementById("user-name").value.trim();
    const username = document.getElementById("user-username").value.trim();
    const password = document.getElementById("user-password").value.trim();
    const role = document.getElementById("user-role").value;

    if (!name || !username || !password || !role) {
      this.showError("All fields are required");
      return;
    }

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password, role }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("User created successfully");
        document.getElementById("create-user-form").reset();
        this.invalidateCache("users");
        this.loadSection("users", false);
      } else {
        this.showError(result.error || "Failed to create user");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess(result.message || "User deleted successfully");
        this.invalidateCache("users");
        this.loadSection("users", false);
      } else {
        this.showError(result.error || "Failed to delete user");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async resetUserPassword(userId) {
    const newPassword = prompt("Enter new password:");
    if (!newPassword) return;

    try {
      const response = await fetch(`/api/users/${userId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Password reset successfully");
      } else {
        this.showError(result.error || "Failed to reset password");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async toggleUserRole(userId) {
    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PUT",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess(result.message || "Role updated successfully");
        this.invalidateCache("users");
        this.loadSection("users", false);
      } else {
        this.showError(result.error || "Failed to toggle role");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  // =============================================================================
  // MODAL UTILITIES
  // =============================================================================

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = "block";
      setTimeout(() => modal.classList.add("show"), 10);
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("show");
      setTimeout(() => (modal.style.display = "none"), 300);
    }
  }

  // =============================================================================
  // MODAL HTML RENDERING
  // =============================================================================

  renderJobModals(statusOptions) {
    return `
      <!-- Job Creation Modal -->
      <div id="createJobModal" class="spa-modal">
        <div class="spa-modal-content">
          <span class="spa-close" onclick="adminSPA.closeModal('createJobModal')">&times;</span>
          <h2>Create New Job</h2>
          <form id="createJobForm" class="spa-form">
            <input type="text" id="new-job-number" placeholder="Job Number" required class="spa-input">
            <input type="text" id="new-client" placeholder="Client" required class="spa-input">
            <input type="text" id="new-address" placeholder="Address" required class="spa-input">
            <select id="new-status" class="spa-input">
              <option value="">Select Status</option>
              ${statusOptions.map((status) => `<option value="${status}">${status}</option>`).join("")}
            </select>
            <div class="modal-actions">
              <button type="button" onclick="adminSPA.createJob()" class="spa-btn spa-btn-primary">Create Job</button>
              <button type="button" onclick="adminSPA.closeModal('createJobModal')" class="spa-btn spa-btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Job Edit Modal -->
      <div id="editJobModal" class="spa-modal">
        <div class="spa-modal-content">
          <span class="spa-close" onclick="adminSPA.closeModal('editJobModal')">&times;</span>
          <h2>Edit Job</h2>
          <form id="editJobForm" class="spa-form">
            <input type="hidden" id="edit-job-number-hidden">
            <input type="text" id="edit-job-number" placeholder="Job Number" readonly class="spa-input">
            <input type="text" id="edit-client" placeholder="Client" required class="spa-input">
            <input type="text" id="edit-address" placeholder="Address" required class="spa-input">
            <input type="text" id="edit-county" placeholder="County" class="spa-input">
            <select id="edit-status" class="spa-input">
              <option value="">Select Status</option>
              ${statusOptions.map((status) => `<option value="${status}">${status}</option>`).join("")}
            </select>
            <textarea id="edit-notes" placeholder="Notes" rows="3" class="spa-input"></textarea>
            <input type="url" id="edit-prop-appr-link" placeholder="Property Appraiser Link" class="spa-input">
            <input type="url" id="edit-plat-link" placeholder="Plat Link" class="spa-input">
            <input type="url" id="edit-fema-link" placeholder="FEMA Link" class="spa-input">
            <input type="url" id="edit-document-url" placeholder="Document URL" class="spa-input">
            <div class="modal-actions">
              <button type="button" onclick="adminSPA.updateJob()" class="spa-btn spa-btn-primary">Update Job</button>
              <button type="button" onclick="adminSPA.closeModal('editJobModal')" class="spa-btn spa-btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Add Fieldwork Modal -->
      <div id="addFieldworkModal" class="spa-modal">
        <div class="spa-modal-content">
          <span class="spa-close" onclick="adminSPA.closeModal('addFieldworkModal')">&times;</span>
          <h2>Add Fieldwork Entry</h2>
          <form id="addFieldworkForm" class="spa-form">
            <input type="hidden" id="fieldwork-job-number">
            <input type="date" id="fieldwork-date" required class="spa-input">
            <input type="time" id="fieldwork-start" required class="spa-input">
            <input type="time" id="fieldwork-end" required class="spa-input">
            <input type="text" id="fieldwork-crew" placeholder="Crew" class="spa-input">
            <input type="text" id="fieldwork-drone" placeholder="Drone Card" class="spa-input">
            <div class="modal-actions">
              <button type="button" onclick="adminSPA.addFieldwork()" class="spa-btn spa-btn-primary">Add Entry</button>
              <button type="button" onclick="adminSPA.closeModal('addFieldworkModal')" class="spa-btn spa-btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Edit Fieldwork Modal -->
      <div id="editFieldworkModal" class="spa-modal">
        <div class="spa-modal-content">
          <span class="spa-close" onclick="adminSPA.closeModal('editFieldworkModal')">&times;</span>
          <h2>Edit Fieldwork Entry</h2>
          <form id="editFieldworkForm" class="spa-form">
            <input type="hidden" id="edit-fieldwork-id">
            <input type="date" id="edit-fieldwork-date" required class="spa-input">
            <input type="time" id="edit-fieldwork-start" required class="spa-input">
            <input type="time" id="edit-fieldwork-end" required class="spa-input">
            <input type="text" id="edit-fieldwork-crew" placeholder="Crew" class="spa-input">
            <input type="text" id="edit-fieldwork-drone" placeholder="Drone Card" class="spa-input">
            <div class="modal-actions">
              <button type="button" onclick="adminSPA.updateFieldwork()" class="spa-btn spa-btn-primary">Update Entry</button>
              <button type="button" onclick="adminSPA.closeModal('editFieldworkModal')" class="spa-btn spa-btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  debounce(func, delay) {
    let timeout;
    const debounced = function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };

    // Add cancel method for immediate execution
    debounced.cancel = function () {
      clearTimeout(timeout);
    };

    return debounced;
  }

  updateNavigation(activeSection) {
    document.querySelectorAll(".spa-nav-item").forEach((item) => {
      item.classList.remove("active");
      if (item.dataset.section === activeSection) {
        item.classList.add("active");
      }
    });
  }

  // Loading states
  showLoading() {
    document.getElementById("loading-overlay").classList.add("show");
  }

  hideLoading() {
    document.getElementById("loading-overlay").classList.remove("show");
  }

  // Notification methods
  showError(message) {
    this.showFlashMessage(message, "error");
  }

  showSuccess(message) {
    this.showFlashMessage(message, "success");
  }

  showFlashMessage(message, type = "success") {
    const container = document.getElementById("flash-messages");
    const messageEl = document.createElement("div");
    messageEl.className = `flash-message ${type}`;
    messageEl.textContent = message;

    container.appendChild(messageEl);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      messageEl.remove();
    }, 5000);
  }

  // Cache management
  isCacheValid(section) {
    if (!this.cache.has(section)) return false;

    const timestamp = this.cacheTimestamps.get(section);
    const age = Date.now() - timestamp;

    return age < this.cacheTTL;
  }

  invalidateCache(section) {
    this.cache.delete(section);
    this.cacheTimestamps.delete(section);
  }
}

// =============================================================================
// INITIALIZE THE SPA WHEN DOM IS READY
// =============================================================================

document.addEventListener("DOMContentLoaded", () => {
  window.adminSPA = new AdminSPA();
});
