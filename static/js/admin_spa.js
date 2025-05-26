// Admin SPA Controller - Updated to handle estimate filtering per section
class AdminSPA {
  constructor() {
    this.currentSection = "dashboard";
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.currentJobFilters = {}; // Store current filters
    this.currentPage = 1;
    this.perPage = 20;
    this.allJobsCache = []; // Store all jobs for frontend filtering
    this.hasAllJobs = false; // Track if we have loaded all jobs

    // Create debounced search function that only updates the display
    this.debouncedSearch = this.debounce((searchTerm) => {
      this.updateSearchDisplay(searchTerm);
    }, 300);

    this.init();
  }

  init() {
    // Set up navigation event listeners
    this.setupNavigation();

    // Handle browser back/forward
    window.addEventListener("popstate", (e) => {
      const section = e.state?.section || "dashboard";
      this.loadSection(section, false);
    });

    // Load initial section based on hash
    const initialSection = window.location.hash.replace("#", "") || "dashboard";
    this.loadSection(initialSection, true);
  }

  setupNavigation() {
    const navItems = document.querySelectorAll(".spa-nav-item");
    navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        const section = item.dataset.section;

        // Only handle SPA navigation if this item has a data-section
        if (section) {
          e.preventDefault();
          this.loadSection(section, true);
        }
        // If no data-section, let the browser handle normal navigation
      });
    });
  }

  debounce(func, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  async loadSection(section, updateHistory = true) {
    console.log(`Loading section: ${section}`);

    // Don't reload if already current
    if (section === this.currentSection && this.isCacheValid(section)) {
      return;
    }

    // Show loading
    this.showLoading();

    try {
      // Update navigation
      this.updateNavigation(section);

      // Load content
      await this.loadSectionContent(section);

      // Update browser history
      if (updateHistory) {
        const url = `/admin#${section}`;
        history.pushState({ section }, "", url);
      }

      // Update current section
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

    // Render the section
    this.renderSection(section, data);
  }

  async fetchSectionData(section) {
    // Use consolidated API endpoints
    const endpoints = {
      dashboard: "/admin/api/dashboard",
      jobs: this.buildJobsURL(),
      users: "/api/users",
    };

    const response = await fetch(endpoints[section]);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  buildJobsURL() {
    const params = new URLSearchParams();

    // Always use pagination for the main API calls
    // We'll handle "all jobs" loading separately when needed
    params.append("page", this.currentPage);
    params.append("per_page", this.perPage);

    // Send backend-supported filters
    Object.entries(this.currentJobFilters).forEach(([key, value]) => {
      if (value && value.trim() && key !== "job_address") {
        params.append(key, value.trim());
      }
    });

    return `/api/jobs?${params}`;
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
    }
  }

  // Helper method to filter out estimates for dashboard analytics
  filterEstimatesFromData(data) {
    // Filter out estimates from status counts for analysis
    const filteredStatusCounts = {};
    Object.entries(data.status_counts || {}).forEach(([status, count]) => {
      if (status !== "Estimate/Quote Available") {
        filteredStatusCounts[status] = count;
      }
    });

    // Filter out estimates from recent jobs
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

  renderDashboard(data) {
    // Fix the header text
    const sectionHeader = document.querySelector("#dashboard-section h2");
    if (sectionHeader) {
      sectionHeader.textContent = "Dashboard Overview";
    }

    // Apply estimate filtering for dashboard analytics
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
                <td>${job.status || "N/A"}</td>
                <td>${job.created_at ? new Date(job.created_at).toLocaleDateString() : "N/A"}</td>
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

    // Draw the donut chart after DOM is updated - using filtered data
    setTimeout(
      () =>
        this.drawDonutChart(
          filteredData.status_counts,
          filteredData.total_active_jobs,
        ),
      100,
    );
  }

  // Status color mapping (using your existing EPIC colors)
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
      "Estimate/Quote Available": "#FFB6C1", // Light pink for estimates
    };
    return colorMap[status] || "#999999";
  }

  // Status display name mapping (shorter names for better display)
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

  // Draw donut chart using Canvas with high-DPI support
  drawDonutChart(statusCounts, total) {
    const canvas = document.getElementById("statusDonutChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Get the device pixel ratio for high-DPI displays
    const dpr = window.devicePixelRatio || 1;

    // Set the canvas size in CSS pixels
    const size = 300;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";

    // Scale the canvas for high-DPI displays
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    // Scale the drawing context so everything draws at the correct size
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = 100;
    const innerRadius = 60;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    let currentAngle = -Math.PI / 2; // Start at top

    Object.entries(statusCounts).forEach(([status, count]) => {
      const sliceAngle = (count / total) * 2 * Math.PI;
      const color = this.getStatusColor(status);

      // Draw slice
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

      // Add subtle border
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

    // Add center text
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

  renderJobs(data) {
    // DEBUG: Log the hasAllJobs state
    console.log("renderJobs - hasAllJobs:", this.hasAllJobs);

    // Store jobs from current API call
    this.allJobsCache = data.jobs || [];
    const content = document.getElementById("jobs-content");

    // For display, always use the jobs from the API response
    const displayJobs = data.jobs || [];

    // Status options for dropdowns - INCLUDING estimates
    const statusOptions = [
      "On Hold/Pending",
      "Needs Fieldwork",
      "Fieldwork Complete/Needs Office Work",
      "To Be Printed/Packaged",
      "Survey Complete/Invoice Sent/Unpaid",
      "Set/Flag Pins",
      "Completed/To Be Filed",
      "Ongoing Site Plan",
      "Estimate/Quote Available", // Include estimates in jobs section
    ];

    content.innerHTML = `
    <div class="section-actions" style="margin-bottom: 20px; display: flex; gap: 10px; align-items: center;">
      <button onclick="adminSPA.showCreateJobModal()" class="spa-btn spa-btn-primary">
        + Create New Job
      </button>
      ${
        !this.hasAllJobs
          ? `
      <button onclick="adminSPA.loadAllJobsForSearch()" class="spa-btn spa-btn-secondary" style="background: #6366f1; color: white;">
        Filter All Jobs
      </button>
      <small style="color: #6b7280;">Currently showing page ${data.current_page || 1} of ${data.pages || 1} (search limited to current page)</small>
      `
          : `
      <button onclick="adminSPA.returnToPagination()" class="spa-btn spa-btn-secondary">
        Filter Per Page
      </button>
      <span class="search-status" style="color: #10b981; font-weight: bold;">✅ Searching all ${this.allJobsCache.length} jobs</span>
      `
      }
    </div>
    
    <!-- Compact Filters -->
    <div class="spa-form-card">
      <h3>Filter Jobs</h3>
      <form id="job-filters" class="filter-form">
        <div class="filter-grid">
          <div>
            <input type="text" id="filter-job-address" placeholder="Job #, Address, or Client${!this.hasAllJobs ? " (current page only)" : ""}" class="spa-input" 
       value="${this.currentJobFilters.job_address || ""}">
          </div>
          <div>
            <input type="text" id="filter-client" placeholder="Client" class="spa-input"
                   value="${this.currentJobFilters.client || ""}">
          </div>
          <div>
            <select id="filter-status" class="spa-input">
              <option value="">All Statuses</option>
              ${statusOptions
                .map(
                  (status) =>
                    `<option value="${status}" ${this.currentJobFilters.status === status ? "selected" : ""}>${status}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div class="filter-actions">
            <button type="button" onclick="adminSPA.applyJobFilters()" class="spa-btn spa-btn-primary">Filter</button>
            <button type="button" onclick="adminSPA.clearJobFilters()" class="spa-btn spa-btn-secondary">Clear</button>
          </div>
        </div>
      </form>
    </div>
    
    <!-- Jobs Table with Integrated Pagination -->
    <div class="spa-form-card">
      <h3>Jobs (Including All Statuses)</h3>
      <div id="search-results-info"></div>
      <div id="jobs-table-container">
        ${this.renderJobsTable(displayJobs, data)}
      </div>
    </div>
    
    <!-- Modals -->
    ${this.renderJobModals(statusOptions)}
  `;
    this.setupSearchInput();
  }

  // New method for integrated pagination
  renderIntegratedPagination(data) {
    if (!data.pages || data.pages <= 1) {
      return `
        <div class="pagination-integrated">
          <div class="pagination-left">
            <label>Show:</label>
            <select id="per-page-select" onchange="adminSPA.changePerPage(this.value)" class="spa-input">
              <option value="10" ${this.perPage === 10 ? "selected" : ""}>10</option>
              <option value="20" ${this.perPage === 20 ? "selected" : ""}>20</option>
              <option value="50" ${this.perPage === 50 ? "selected" : ""}>50</option>
              <option value="100" ${this.perPage === 100 ? "selected" : ""}>100</option>
            </select>
          </div>
          <div class="pagination-center">
            Showing ${(data.jobs || []).length} of ${data.total || 0} jobs
          </div>
          <div class="pagination-right">
            <!-- No pagination needed for single page -->
          </div>
        </div>
      `;
    }

    const currentPage = data.current_page || 1;
    const totalPages = data.pages;

    let paginationHTML = `
      <div class="pagination-integrated">
        <div class="pagination-left">
          <label>Show:</label>
          <select id="per-page-select" onchange="adminSPA.changePerPage(this.value)" class="spa-input">
            <option value="10" ${this.perPage === 10 ? "selected" : ""}>10</option>
            <option value="20" ${this.perPage === 20 ? "selected" : ""}>20</option>
            <option value="50" ${this.perPage === 50 ? "selected" : ""}>50</option>
            <option value="100" ${this.perPage === 100 ? "selected" : ""}>100</option>
          </select>
        </div>
        <div class="pagination-center">
          Showing ${(data.jobs || []).length} of ${data.total || 0} jobs (Page ${currentPage} of ${totalPages})
        </div>
        <div class="pagination-right">
    `;

    // Previous button
    if (currentPage > 1) {
      paginationHTML += `<button onclick="adminSPA.goToPage(${currentPage - 1})" class="spa-btn spa-btn-small spa-btn-secondary">‹</button>`;
    }

    // Page numbers (show max 5 pages around current)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
      paginationHTML += `<button onclick="adminSPA.goToPage(1)" class="spa-btn spa-btn-small spa-btn-secondary">1</button>`;
      if (startPage > 2) {
        paginationHTML += '<span class="pagination-ellipsis">…</span>';
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const isActive =
        i === currentPage ? "spa-btn-primary" : "spa-btn-secondary";
      paginationHTML += `<button onclick="adminSPA.goToPage(${i})" class="spa-btn spa-btn-small ${isActive}">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += '<span class="pagination-ellipsis">…</span>';
      }
      paginationHTML += `<button onclick="adminSPA.goToPage(${totalPages})" class="spa-btn spa-btn-small spa-btn-secondary">${totalPages}</button>`;
    }

    // Next button
    if (currentPage < totalPages) {
      paginationHTML += `<button onclick="adminSPA.goToPage(${currentPage + 1})" class="spa-btn spa-btn-small spa-btn-secondary">›</button>`;
    }

    paginationHTML += `
        </div>
      </div>
    `;

    return paginationHTML;
  }

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

  // Pagination Methods - Updated to handle frontend filtering
  async goToPage(page) {
    this.currentPage = page;

    // If we have frontend filters, just re-render with the cached data
    if (this.currentJobFilters.job_address && this.cache.has("jobs")) {
      const cachedData = this.cache.get("jobs");
      this.renderJobs(cachedData);
    } else {
      // Otherwise, fetch new page from backend
      this.invalidateCache("jobs");
      await this.loadSection("jobs", false);
    }
  }

  async changePerPage(perPage) {
    this.perPage = parseInt(perPage);
    this.currentPage = 1; // Reset to first page

    // If we have frontend filters, just re-render with the cached data
    if (this.currentJobFilters.job_address && this.cache.has("jobs")) {
      const cachedData = this.cache.get("jobs");
      this.renderJobs(cachedData);
    } else {
      // Otherwise, fetch fresh data with new per_page
      this.invalidateCache("jobs");
      await this.loadSection("jobs", false);
    }
  }

  setupSearchInput() {
    const searchInput = document.getElementById("filter-job-address");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        // Only enable instant search if we have all jobs loaded
        if (this.hasAllJobs) {
          this.debouncedSearch(e.target.value);
        } else {
          // Just update the filter value without searching
          this.currentJobFilters.job_address = e.target.value;
        }
      });
    }
  }

  renderJobsTable(jobs, originalData) {
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
          <tr id="fieldwork-${job.job_number}" class="fieldwork-row" style="display: none;">
            <td colspan="6" class="fieldwork-content">
              <div id="fieldwork-content-${job.job_number}"></div>
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
      <tfoot class="table-footer">
        <tr>
          <td colspan="6">
            ${this.renderIntegratedPagination({ ...originalData, jobs: jobs, total: jobs.length })}
          </td>
        </tr>
      </tfoot>
    </table>
  `;
  }

  // New method to load all jobs for searching
  async loadAllJobsForSearch() {
    try {
      this.showLoading();

      // Fetch ALL jobs without pagination
      const response = await fetch("/api/jobs");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.allJobsCache = data.jobs || [];
      this.hasAllJobs = true;

      this.showSuccess(`Loaded ${this.allJobsCache.length} jobs for searching`);

      // Re-render to update the UI with all jobs and no pagination
      this.renderJobs({
        jobs: this.allJobsCache,
        total: this.allJobsCache.length,
        pages: 1,
        current_page: 1,
        has_next: false,
        has_prev: false,
      });
    } catch (error) {
      this.showError("Failed to load all jobs: " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  // Method to return to paginated view
  async returnToPagination() {
    this.hasAllJobs = false;
    this.allJobsCache = [];
    this.currentJobFilters = {}; // Clear any search filters
    this.currentPage = 1;

    // Clear form inputs
    const searchInput = document.getElementById("filter-job-address");
    const clientInput = document.getElementById("filter-client");
    const statusSelect = document.getElementById("filter-status");

    if (searchInput) searchInput.value = "";
    if (clientInput) clientInput.value = "";
    if (statusSelect) statusSelect.value = "";

    // Reload with pagination
    this.invalidateCache("jobs");
    await this.loadSection("jobs", false);
  }

  // Simple method that just updates the table display without any API calls
  updateSearchDisplay(searchTerm) {
    this.currentJobFilters.job_address = searchTerm;

    // Only proceed if we have jobs data
    if (this.allJobsCache.length === 0) return;

    // Filter the jobs
    const filteredJobs = this.applyFrontendFilters(this.allJobsCache);

    // Update the table
    const tableContainer = document.getElementById("jobs-table-container");
    if (tableContainer) {
      const paginationInfo = {
        jobs: filteredJobs,
        total: filteredJobs.length,
        pages: 1,
        current_page: 1,
        has_next: false,
        has_prev: false,
      };
      tableContainer.innerHTML = this.renderJobsTable(
        filteredJobs,
        paginationInfo,
      );
    }

    // Update search info
    const searchInfo = document.getElementById("search-results-info");
    if (searchInfo) {
      if (searchTerm) {
        searchInfo.innerHTML = `<p class="filter-notice" style="color: #10b981; background: #dcfce7; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px;">✅ Found ${filteredJobs.length} jobs matching "${searchTerm}" across all jobs</p>`;
      } else {
        searchInfo.innerHTML = "";
      }
    }
  }

  applyFrontendFilters(jobs) {
    const searchTerm = this.currentJobFilters.job_address?.toLowerCase() || "";

    if (!searchTerm) {
      return jobs; // No search term, return all jobs
    }

    // Filter jobs using the same logic as your map
    return jobs.filter((job) => {
      const searchMatch =
        job.job_number.toLowerCase().includes(searchTerm) ||
        job.address.toLowerCase().includes(searchTerm) ||
        job.client.toLowerCase().includes(searchTerm);

      return searchMatch;
    });
  }

  // Updated filter methods - much simpler approach
  async applyJobFilters() {
    // Get filter values
    this.currentJobFilters = {
      job_address: document.getElementById("filter-job-address").value,
      client: document.getElementById("filter-client").value,
      status: document.getElementById("filter-status").value,
    };

    // Reset to first page when applying new filters
    this.currentPage = 1;

    // Always invalidate and reload when using the filter button
    // This ensures we get fresh data with the right scope (all jobs vs paginated)
    this.invalidateCache("jobs");
    await this.loadSection("jobs", false);
  }

  async clearJobFilters() {
    this.currentJobFilters = {};
    this.currentPage = 1;

    // If we had all jobs loaded, go back to normal pagination
    if (this.hasAllJobs) {
      this.hasAllJobs = false;
      this.allJobsCache = [];
    }

    this.invalidateCache("jobs");
    await this.loadSection("jobs", false);
  }

  // Pagination Methods - Updated to handle frontend filtering
  async goToPage(page) {
    this.currentPage = page;

    // If we have frontend filters, just re-render with the cached data
    if (this.currentJobFilters.job_address && this.cache.has("jobs")) {
      const cachedData = this.cache.get("jobs");
      this.renderJobs(cachedData);
    } else {
      // Otherwise, fetch new page from backend
      this.invalidateCache("jobs");
      await this.loadSection("jobs", false);
    }
  }

  async changePerPage(perPage) {
    this.perPage = parseInt(perPage);
    this.currentPage = 1; // Reset to first page

    // If we have frontend filters, just re-render with the cached data
    if (this.currentJobFilters.job_address && this.cache.has("jobs")) {
      const cachedData = this.cache.get("jobs");
      this.renderJobs(cachedData);
    } else {
      // Otherwise, fetch fresh data with new per_page
      this.invalidateCache("jobs");
      await this.loadSection("jobs", false);
    }
  }

  // Fieldwork Methods - Fixed to not auto-load
  async toggleFieldwork(jobNumber) {
    const row = document.getElementById(`fieldwork-${jobNumber}`);
    const content = document.getElementById(`fieldwork-content-${jobNumber}`);

    if (row.style.display === "none" || !row.style.display) {
      // Show and load fieldwork ONLY when toggled
      row.style.display = "table-row";
      content.innerHTML = "<p>Loading fieldwork entries...</p>";
      await this.loadFieldwork(jobNumber);
    } else {
      // Hide fieldwork
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

  // CRUD Operations
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
        this.loadSection("jobs", false);
      } else {
        this.showError(result.error || "Failed to delete job");
      }
    } catch (error) {
      console.error("Delete job error:", error);
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
        this.loadSection("jobs", false);
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
        this.loadSection("jobs", false);
      } else {
        this.showError(result.error || "Failed to update job");
      }
    } catch (error) {
      console.error("Update job error:", error);
      this.showError("Network error: " + error.message);
    }
  }

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
        // We need to get the job number to reload fieldwork
        if (result.fieldwork && result.fieldwork.job_number) {
          await this.loadFieldwork(result.fieldwork.job_number);
        } else {
          // Fallback: close modal and refresh jobs section
          this.invalidateCache("jobs");
          this.loadSection("jobs", false);
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

  // Modal utility methods
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

  // Utility Methods
  updateNavigation(activeSection) {
    document.querySelectorAll(".spa-nav-item").forEach((item) => {
      item.classList.remove("active");
      if (item.dataset.section === activeSection) {
        item.classList.add("active");
      }
    });
  }

  showLoading() {
    document.getElementById("loading-overlay").classList.add("show");
  }

  hideLoading() {
    document.getElementById("loading-overlay").classList.remove("show");
  }

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

// Initialize the SPA when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.adminSPA = new AdminSPA();
});
