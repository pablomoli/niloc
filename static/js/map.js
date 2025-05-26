// Enhanced Map with Advanced Leaflet Plugins
// Map Configuration
const INITIAL_CENTER = [28.5383, -81];
const INITIAL_ZOOM = 10;

// Enhanced Application State
const AppState = {
  map: null,
  markerCluster: null,
  allJobs: [], // Store all jobs
  filteredJobs: [], // Currently visible jobs
  selectedJobs: new Set(), // Multi-selected jobs
  selectedJobNumber: null,
  searchMarker: null,
  tempMarkers: [], // Temporary click markers
  mapMode: "pan", // 'pan' or 'click'
  activeFilters: new Set(["all"]), // Active status filters
};

// Epic Color System
const EPIC_COLORS = {
  "On Hold/Pending": "#C0C0C0",
  "Needs Fieldwork": "#FFA500",
  "Fieldwork Complete/Needs Office Work": "#8A2BE2",
  "To Be Printed/Packaged": "#1E90FF",
  "Survey Complete/Invoice Sent/Unpaid": "#FFFF00",
  "Set/Flag Pins": "#FF0000",
  "Completed/To Be Filed": "#9ACD32",
  "Ongoing Site Plan": "#FF69B4",
  "Estimate/Quote Available": "#607080",
};

// Status Display Names
const STATUS_NAMES = {
  "On Hold/Pending": "On Hold",
  "Needs Fieldwork": "Needs Field",
  "Fieldwork Complete/Needs Office Work": "Office Work",
  "To Be Printed/Packaged": "To Print",
  "Survey Complete/Invoice Sent/Unpaid": "Invoice Sent",
  "Set/Flag Pins": "Set Pins",
  "Completed/To Be Filed": "Completed",
  "Ongoing Site Plan": "Site Plan",
  "Estimate/Quote Available": "Quote Ready",
};

// Utility Functions
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Enhanced SVG Marker Creation
function createEpicMarkerSVG(
  status,
  isSelected = false,
  isHighlighted = false,
) {
  const color = EPIC_COLORS[status] || EPIC_COLORS["To Be Printed/Packaged"];
  const strokeColor = isSelected
    ? "#ff0000"
    : isHighlighted
      ? "#ffff00"
      : "#333";
  const strokeWidth = isSelected ? "3" : isHighlighted ? "2.5" : "1.5";

  return `
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="marker-shadow-${isSelected ? "selected" : "normal"}" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="1" dy="2" stdDeviation="${isSelected ? "2" : "1"}" flood-opacity="0.3"/>
        </filter>
      </defs>
      
      <ellipse cx="12.5" cy="38" rx="8" ry="3" fill="rgba(0,0,0,0.3)"/>
      
      <path d="M12.5 2C6.7 2 2 6.7 2 12.5c0 7.3 10.5 26.5 10.5 26.5s10.5-19.2 10.5-26.5C23 6.7 18.3 2 12.5 2z" 
            fill="${color}" 
            stroke="${strokeColor}" 
            stroke-width="${strokeWidth}"
            filter="url(#marker-shadow-${isSelected ? "selected" : "normal"})"/>
      
      <circle cx="12.5" cy="12.5" r="6" fill="white" stroke="${strokeColor}" stroke-width="1"/>
      <circle cx="12.5" cy="12.5" r="3" fill="${color}"/>
      
      ${isSelected ? '<circle cx="12.5" cy="12.5" r="2" fill="red"/>' : ""}
    </svg>
  `;
}

function getStatusIcon(status, isSelected = false, isHighlighted = false) {
  return L.divIcon({
    html: createEpicMarkerSVG(status, isSelected, isHighlighted),
    className: `epic-svg-marker ${isSelected ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
}

// Map Setup with Enhanced Controls
const baseMaps = {
  Satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri" },
  ),
  Street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }),
  Terrain: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri" },
  ),
};

// Initialize Enhanced Map
AppState.map = L.map("map", {
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  layers: [baseMaps["Satellite"]],
  fullscreenControl: true,
  fullscreenControlOptions: {
    position: "topleft",
  },
});

// Add layer control
L.control.layers(baseMaps).addTo(AppState.map);

// Add fullscreen control

// Enhanced Map Mode Management
function setMapMode(mode) {
  AppState.mapMode = mode;

  // Update UI
  document
    .querySelectorAll(".mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(mode + "Mode").classList.add("active");

  // Update cursor and instructions
  const mapElement = document.getElementById("map");
  const statusElement = document.getElementById("modeStatus");

  if (mode === "click") {
    mapElement.style.cursor = "crosshair";
    statusElement.textContent =
      "Click mode: Click anywhere on map to place temporary markers";
    statusElement.classList.add("active-mode");
  } else {
    mapElement.style.cursor = "";
    statusElement.textContent = "Pan mode: Normal map navigation enabled";
    statusElement.classList.remove("active-mode");
  }
}

// Enhanced Map Click Handler
AppState.map.on("click", function (e) {
  if (AppState.mapMode === "click") {
    // Create temporary marker at click location
    const tempMarker = L.marker([e.latlng.lat, e.latlng.lng], {
      icon: L.divIcon({
        html: '<div class="temp-marker-dot"></div>',
        className: "temp-marker",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
    }).addTo(AppState.map);

    // Store temporary marker
    AppState.tempMarkers.push(tempMarker);

    // Enhanced popup with modern styling
    tempMarker
      .bindPopup(
        `
        <div class="temp-marker-popup">
          <h4>Temporary Marker</h4>
          <div class="coordinates">
            <strong>Lat:</strong> ${e.latlng.lat.toFixed(6)}<br>
            <strong>Lng:</strong> ${e.latlng.lng.toFixed(6)}
          </div>
          <div class="popup-actions">
            <button onclick="createJobAtLocation(${e.latlng.lat}, ${e.latlng.lng})" class="spa-btn spa-btn-small spa-btn-primary">
              Create Job Here
            </button>
            <button onclick="removeThisMarker(this)" class="spa-btn spa-btn-small spa-btn-danger">
              Remove
            </button>
          </div>
        </div>
      `,
      )
      .openPopup();
  }
});

// Clear temporary markers
function clearTempMarkers() {
  AppState.tempMarkers.forEach((marker) => AppState.map.removeLayer(marker));
  AppState.tempMarkers = [];
}

function removeThisMarker(buttonElement) {
  // Find and remove the specific marker
  const popup = buttonElement.closest(".leaflet-popup");
  if (popup) {
    AppState.map.closePopup();
    // Remove the marker (this is a simplified approach)
    // In a real app, you'd want to track markers more precisely
    clearTempMarkers();
  }
}

// Enhanced Job Fetching and Filtering
async function fetchAllJobs() {
  try {
    const response = await fetch("/api/jobs");
    const data = await response.json();
    AppState.allJobs = data.jobs || data;
    AppState.filteredJobs = [...AppState.allJobs];

    updateMapMarkers();
    updateStats();
    initializeStatusFilters();
  } catch (error) {
    console.error("Error fetching jobs:", error);
  }
}
async function fetchSingleJob(jobNumber) {
  try {
    const response = await fetch(`/api/jobs/${jobNumber}`);
    if (response.ok) {
      const updatedJob = await response.json();

      // Update the job in our local state
      const jobIndex = AppState.allJobs.findIndex(
        (j) => j.job_number === jobNumber,
      );
      if (jobIndex !== -1) {
        AppState.allJobs[jobIndex] = updatedJob;
      }

      // Update filtered jobs too
      const filteredIndex = AppState.filteredJobs.findIndex(
        (j) => j.job_number === jobNumber,
      );
      if (filteredIndex !== -1) {
        AppState.filteredJobs[filteredIndex] = updatedJob;
      }

      // Update map markers to reflect any status changes
      updateMapMarkers();

      return updatedJob;
    }
  } catch (error) {
    console.error("Error fetching single job:", error);
  }
  return null;
}

function initializeStatusFilters() {
  const statusFilters = document.getElementById("statusFilters");
  const statuses = [
    ...new Set(AppState.allJobs.map((job) => job.status).filter(Boolean)),
  ];

  // Clear existing filters (except "All")
  const allButton = statusFilters.querySelector('[data-status="all"]');
  statusFilters.innerHTML = "";
  statusFilters.appendChild(allButton);

  // Add status filters
  statuses.forEach((status) => {
    const button = document.createElement("button");
    button.className = "filter-btn";
    button.dataset.status = status;
    button.onclick = () => toggleStatusFilter(button);

    const color = EPIC_COLORS[status] || "#999";
    const name = STATUS_NAMES[status] || status;

    button.innerHTML = `
      <span class="status-dot" style="background-color: ${color}"></span>
      <span>${name}</span>
    `;

    statusFilters.appendChild(button);
  });
}

function toggleStatusFilter(button) {
  const status = button.dataset.status;

  if (status === "all") {
    // Clear all filters and show all
    AppState.activeFilters.clear();
    AppState.activeFilters.add("all");
    document
      .querySelectorAll(".filter-btn")
      .forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
  } else {
    // Toggle specific status
    AppState.activeFilters.delete("all");
    document.querySelector('[data-status="all"]').classList.remove("active");

    if (AppState.activeFilters.has(status)) {
      AppState.activeFilters.delete(status);
      button.classList.remove("active");
    } else {
      AppState.activeFilters.add(status);
      button.classList.add("active");
    }

    // If no filters active, show all
    if (AppState.activeFilters.size === 0) {
      AppState.activeFilters.add("all");
      document.querySelector('[data-status="all"]').classList.add("active");
    }
  }

  applyFilters();
}

function applyFilters() {
  const searchTerm = document.getElementById("jobSearch").value.toLowerCase();

  AppState.filteredJobs = AppState.allJobs.filter((job) => {
    // Status filter
    const statusMatch =
      AppState.activeFilters.has("all") ||
      AppState.activeFilters.has(job.status);

    // Search filter
    const searchMatch =
      !searchTerm ||
      job.job_number.toLowerCase().includes(searchTerm) ||
      job.client.toLowerCase().includes(searchTerm) ||
      job.address.toLowerCase().includes(searchTerm);

    return statusMatch && searchMatch;
  });

  updateMapMarkers();
  updateStats();
  updateSearchResults();
}

const filterJobs = debounce(applyFilters, 300);

function updateMapMarkers() {
  // Clear existing markers
  if (AppState.markerCluster) {
    AppState.map.removeLayer(AppState.markerCluster);
  }

  // Create new cluster with filtered jobs
  AppState.markerCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
  });

  AppState.filteredJobs.forEach((job) => {
    if (job.latitude && job.longitude) {
      const lat = parseFloat(job.latitude);
      const lng = parseFloat(job.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        const isSelected = AppState.selectedJobs.has(job.job_number);
        const marker = L.marker([lat, lng], {
          icon: getStatusIcon(job.status, isSelected),
        });

        // Store job data on marker
        marker.jobData = job;

        // Enhanced click handler with multi-select
        marker.on("click", function (e) {
          e.originalEvent.stopPropagation();

          if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
            // Multi-select mode
            toggleJobSelection(job);
          } else {
            // Single select mode
            showJobDetails(job);
          }
        });

        AppState.markerCluster.addLayer(marker);
      }
    }
  });

  AppState.map.addLayer(AppState.markerCluster);
}

// Multi-select Job Management
function toggleJobSelection(job) {
  if (AppState.selectedJobs.has(job.job_number)) {
    AppState.selectedJobs.delete(job.job_number);
  } else {
    AppState.selectedJobs.add(job.job_number);
  }

  updateMapMarkers(); // Refresh to show selection state
  updateSelectedJobsPanel();
  updateStats();
}

function updateSelectedJobsPanel() {
  const panel = document.getElementById("selectedJobs");
  const routeBtn = document.getElementById("routeBtn");

  if (AppState.selectedJobs.size === 0) {
    panel.innerHTML = `
      <div class="selection-help">
        Hold Ctrl/Cmd + Click markers to select multiple jobs
      </div>
    `;
    routeBtn.style.display = "none";
  } else {
    const selectedJobsData = AppState.allJobs.filter((job) =>
      AppState.selectedJobs.has(job.job_number),
    );

    panel.innerHTML = selectedJobsData
      .map(
        (job) => `
        <div class="selected-job">
          <span class="job-info">${job.job_number} - ${job.client}</span>
          <button class="remove-job" onclick="toggleJobSelection({job_number: '${job.job_number}'})" title="Remove from selection">
            ×
          </button>
        </div>
      `,
      )
      .join("");

    routeBtn.style.display = AppState.selectedJobs.size >= 2 ? "block" : "none";
  }
}

function clearSelection() {
  AppState.selectedJobs.clear();
  updateMapMarkers();
  updateSelectedJobsPanel();
  updateStats();
}

// Enhanced Address Search
function handleSearchKeypress(event) {
  if (event.key === "Enter") {
    searchAddress();
  }
}

async function searchAddress() {
  const address = document.getElementById("addressSearch").value.trim();
  if (!address) {
    alert("Please enter an address to search");
    return;
  }

  try {
    const response = await fetch(
      `/api/geocode?address=${encodeURIComponent(address)}`,
    );
    const data = await response.json();

    if (data.error) {
      alert(`Could not find address: ${data.error}`);
      return;
    }

    // Remove previous search marker
    if (AppState.searchMarker) {
      AppState.map.removeLayer(AppState.searchMarker);
    }

    // Add new search marker with enhanced popup
    AppState.searchMarker = L.marker([data.lat, data.lng], {
      icon: L.divIcon({
        html: '<div class="search-result-marker-dot"></div>',
        className: "search-result-marker",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(AppState.map);

    AppState.searchMarker
      .bindPopup(
        `
        <div class="search-result-popup">
          <h4>📍 Search Result</h4>
          <div class="address-info">
            ${data.formatted_address}<br>
            ${data.county ? `<em>${data.county} County</em>` : ""}
          </div>
          <div class="popup-actions">
            <button onclick="createJobAtLocation(${data.lat}, ${data.lng}, '${data.formatted_address}')" 
                    class="spa-btn spa-btn-small spa-btn-primary">
              Create Job Here
            </button>
          </div>
        </div>
      `,
      )
      .openPopup();

    // Enhanced fly animation
    AppState.map.flyTo([data.lat, data.lng], 16, {
      animate: true,
      duration: 1.5,
      easeLinearity: 0.25,
    });
  } catch (error) {
    console.error("Search error:", error);
    alert("Search failed. Please try again.");
  }
}

// Create Job at Location
async function createJobAtLocation(lat, lng, address = "") {
  const modal = document.getElementById("createJobModal");
  const addressInput = document.getElementById("job-address");

  if (address) {
    // Address was provided from search
    addressInput.value = address;
  } else {
    // No address - reverse geocode the coordinates
    try {
      const response = await fetch(
        `/api/reverse-geocode?lat=${lat}&lng=${lng}`,
      );
      const data = await response.json();

      if (response.ok) {
        addressInput.value = data.formatted_address;
      } else {
        // Fallback to coordinates if reverse geocoding fails
        addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    } catch (error) {
      // Fallback to coordinates if request fails
      addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

  openModal("createJobModal");
}

// Enhanced Stats Updates
function updateStats() {
  document.getElementById("totalJobs").textContent =
    `Total: ${AppState.allJobs.length} jobs`;
  document.getElementById("visibleJobs").textContent =
    `Visible: ${AppState.filteredJobs.length} jobs`;
  document.getElementById("selectedCount").textContent =
    `Selected: ${AppState.selectedJobs.size} jobs`;
}

function updateSearchResults() {
  const resultsDiv = document.getElementById("searchResults");
  const total = AppState.allJobs.length;
  const visible = AppState.filteredJobs.length;

  if (visible === total) {
    resultsDiv.textContent = `Showing all ${total} jobs`;
    resultsDiv.classList.remove("filtered");
  } else {
    resultsDiv.textContent = `Showing ${visible} of ${total} jobs`;
    resultsDiv.classList.add("filtered");
  }
}

// Route Planning (Google Maps Integration)
function planRoute() {
  if (AppState.selectedJobs.size < 2) {
    alert("Please select at least 2 jobs to plan a route");
    return;
  }

  const selectedJobsData = AppState.allJobs.filter((job) =>
    AppState.selectedJobs.has(job.job_number),
  );

  // Create Google Maps URL with waypoints
  const baseUrl = "https://www.google.com/maps/dir/";
  const waypoints = selectedJobsData
    .map((job) => `${job.latitude},${job.longitude}`)
    .join("/");

  const googleMapsUrl = baseUrl + waypoints;

  // Open in new tab
  window.open(googleMapsUrl, "_blank");

  // Also show route summary
  showRouteSummary(selectedJobsData);
}

function showRouteSummary(jobs) {
  const summary = jobs
    .map(
      (job, index) =>
        `${index + 1}. ${job.job_number} - ${job.client} (${job.address})`,
    )
    .join("\n");

  alert(
    `Route planned for ${jobs.length} jobs:\n\n${summary}\n\nOpening Google Maps...`,
  );
}

// Enhanced Job Details (keep existing functionality)
function showJobDetails(job) {
  AppState.selectedJobNumber = job.job_number;
  document.getElementById("visited-count").textContent = job.visited || 0;
  document.getElementById("total-time-spent").textContent = Number(
    job.total_time_spent || 0,
  ).toFixed(2);

  const panel = document.getElementById("info-panel");
  const content = document.getElementById("info-content");

  content.innerHTML = `
    <div class="job-header">
      <h3>Job #${job.job_number}</h3>
      <div class="job-meta">
        <div class="meta-item">
          <strong>Client:</strong> ${job.client}
        </div>
        <div class="meta-item">
          <strong>Address:</strong> ${job.address}
        </div>
        ${
          job.status
            ? `
          <div class="meta-item">
            <strong>Status:</strong> 
            <span class="status-badge" style="background-color: ${EPIC_COLORS[job.status] || "#999"}">
              ${job.status}
            </span>
          </div>
        `
            : ""
        }
        ${
          job.county
            ? `
          <div class="meta-item">
            <strong>County:</strong> ${job.county}
          </div>
        `
            : ""
        }
      </div>
    </div>
    
    ${
      job.notes
        ? `
      <div class="job-notes">
        <h4>Notes</h4>
        <p>${job.notes}</p>
      </div>
    `
        : ""
    }
    
    <div class="job-actions">
      <button onclick="openModal('editJobModal')" class="spa-btn spa-btn-primary spa-btn-small">
        ✏️ Edit Job
      </button>
      <button onclick="openModal('addFieldworkModal')" class="spa-btn spa-btn-success spa-btn-small">
        ➕ Add Fieldwork
      </button>
      <button onclick="toggleJobSelection({job_number: '${job.job_number}'})" class="spa-btn spa-btn-secondary spa-btn-small">
        ${AppState.selectedJobs.has(job.job_number) ? "✓ Selected" : "+ Select"}
      </button>
    </div>
    
    ${
      job.created_at
        ? `
        <div class="job-footer">
          <small><strong>Created:</strong> ${new Date(job.created_at).toLocaleDateString()}</small>
        </div>
      `
        : ""
    }
  `;

  // Load fieldwork entries
  loadFieldworkForJob(job.job_number);
  panel.classList.add("visible");
}

async function loadFieldworkForJob(jobNumber) {
  try {
    const response = await fetch(`/api/jobs/${jobNumber}/fieldwork`);
    const entries = await response.json();

    const list = document.getElementById("fieldwork-list");
    if (!entries || !entries.length) {
      list.innerHTML = "<li class='empty-state'>No entries yet.</li>";
      return;
    }

    list.innerHTML = entries
      .map(
        (entry) => `
        <li class="fieldwork-entry">
          <div class="entry-content">
            <div class="entry-header">
              <strong>${entry.work_date}</strong>
              <span class="entry-time">${entry.start_time}–${entry.end_time}</span>
            </div>
            ${entry.crew ? `<div class="entry-detail">Crew: ${entry.crew}</div>` : ""}
            ${entry.drone_card ? `<div class="entry-detail">Drone: ${entry.drone_card}</div>` : ""}
          </div>
          <button onclick="openEditFieldworkModal(${entry.id}, '${entry.work_date}', '${entry.start_time}', '${entry.end_time}', '${entry.crew || ""}', '${entry.drone_card || ""}')" 
                  class="spa-btn spa-btn-primary spa-btn-small edit-entry-btn">
            ✏️
          </button>
        </li>
      `,
      )
      .join("");
  } catch (error) {
    console.error("Error loading fieldwork:", error);
    document.getElementById("fieldwork-list").innerHTML =
      "<li class='error-state'>Failed to load fieldwork entries</li>";
  }
}

// Modal Functions (keep existing ones)
function openModal(id) {
  if (id === "editJobModal") {
    populateEditJobModal();
  }
  const modal = document.getElementById(id);
  modal.style.display = "block";
  setTimeout(() => modal.classList.add("show"), 10);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("show");
  setTimeout(() => (modal.style.display = "none"), 300);
}

function populateEditJobModal() {
  const job = AppState.allJobs.find(
    (j) => j.job_number === AppState.selectedJobNumber,
  );
  if (!job) return;

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
  document.getElementById("edit-document-url").value = job.document_url || "";
}
function openEditFieldworkModal(
  id,
  workDate,
  startTime,
  endTime,
  crew,
  droneCard,
) {
  document.getElementById("edit-fieldwork-id").value = id;
  document.getElementById("edit-fieldwork-date").value = workDate;
  document.getElementById("edit-fieldwork-start-time").value = startTime;
  document.getElementById("edit-fieldwork-end-time").value = endTime;
  document.getElementById("edit-fieldwork-crew").value = crew || "";
  document.getElementById("edit-fieldwork-drone-card").value = droneCard || "";

  openModal("editFieldworkModal");
}

// Enhanced Initialization
document.addEventListener("DOMContentLoaded", function () {
  // Initialize the enhanced map
  fetchAllJobs();

  // Set initial mode
  setMapMode("pan");

  // Close panel handler
  document.getElementById("close-panel").addEventListener("click", () => {
    document.getElementById("info-panel").classList.remove("visible");
  });
  const editJobForm = document.getElementById("editJobForm");
  if (editJobForm) {
    editJobForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const jobNumber = formData.get("job_number");
      const submitButton = this.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = "Updating...";
      submitButton.disabled = true;

      // Convert FormData to JSON
      const data = {};
      for (let [key, value] of formData.entries()) {
        data[key] = value.trim();
      }

      try {
        const response = await fetch(`/api/jobs/${jobNumber}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        const result = await response.json();

        if (response.ok) {
          alert("Job updated successfully!");
          closeModal("editJobModal");

          // Fetch the updated job and refresh the panel
          const updatedJob = await fetchSingleJob(jobNumber);
          if (
            updatedJob &&
            document.getElementById("info-panel").classList.contains("visible")
          ) {
            showJobDetails(updatedJob);
          }
        } else {
          alert(result.error || "Failed to update job");
        }
      } catch (error) {
        console.error("Error updating job:", error);
        alert("Failed to update job. Please try again.");
      } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      }
    });
  }

  // Replace your Add Fieldwork Form Handler with this:
  const addFieldworkForm = document.getElementById("addFieldworkForm");
  if (addFieldworkForm) {
    addFieldworkForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const submitButton = this.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = "Adding...";
      submitButton.disabled = true;

      // Convert FormData to JSON
      const data = {};
      for (let [key, value] of formData.entries()) {
        data[key] = value.trim();
      }

      try {
        const response = await fetch(
          `/api/jobs/${AppState.selectedJobNumber}/fieldwork`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          },
        );
        const result = await response.json();

        if (response.ok) {
          alert("Fieldwork added successfully!");
          closeModal("addFieldworkModal");
          this.reset();

          // Fetch the updated job (with new visit count and time)
          const updatedJob = await fetchSingleJob(AppState.selectedJobNumber);
          if (updatedJob) {
            // Refresh the job details panel
            showJobDetails(updatedJob);
          }
        } else {
          alert(result.error || "Failed to add fieldwork");
        }
      } catch (error) {
        console.error("Error adding fieldwork:", error);
        alert("Failed to add fieldwork. Please try again.");
      } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      }
    });
  }

  // Replace your Edit Fieldwork Form Handler with this:
  const editFieldworkForm = document.getElementById("editFieldworkForm");
  if (editFieldworkForm) {
    editFieldworkForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const fieldworkId = document.getElementById("edit-fieldwork-id").value;
      const submitButton = this.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = "Updating...";
      submitButton.disabled = true;

      // Convert FormData to JSON
      const data = {};
      for (let [key, value] of formData.entries()) {
        if (key !== "fieldwork_id") {
          // Skip the hidden ID field
          data[key] = value.trim();
        }
      }

      try {
        const response = await fetch(`/api/fieldwork/${fieldworkId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        const result = await response.json();

        if (response.ok) {
          alert("Fieldwork updated successfully!");
          closeModal("editFieldworkModal");

          // Fetch the updated job (time totals may have changed)
          const updatedJob = await fetchSingleJob(AppState.selectedJobNumber);
          if (updatedJob) {
            // Refresh the job details panel
            showJobDetails(updatedJob);
          }
        } else {
          alert(result.error || "Failed to update fieldwork");
        }
      } catch (error) {
        console.error("Error updating fieldwork:", error);
        alert("Failed to update fieldwork. Please try again.");
      } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      }
    });
  } // Enhanced job creation form
  const createJobForm = document.getElementById("createJobForm");
  if (createJobForm) {
    createJobForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const submitButton = this.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = "Creating...";
      submitButton.disabled = true;
      console.log(formData);

      try {
        const response = await fetch("/api/jobs", {
          method: "POST",
          body: formData,
        });
        const result = await response.json();

        if (response.ok) {
          // Check the HTTP status instead
          alert("Job created successfully!");
          closeModal("createJobModal");
          this.reset();
          fetchAllJobs(); // This should refresh the map
          clearTempMarkers();
        } else {
          const result = await response.json();
          alert(result.error || "Failed to create job");
        }
      } catch (error) {
        console.error("Error creating job:", error);
        alert("Failed to create job. Please try again.");
      } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      }
    });
  }

  // Add keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    // Escape key to clear selection or exit click mode
    if (e.key === "Escape") {
      if (AppState.selectedJobs.size > 0) {
        clearSelection();
      } else if (AppState.mapMode === "click") {
        setMapMode("pan");
      }
    }

    // Delete key to clear temporary markers
    if (e.key === "Delete" || e.key === "Backspace") {
      if (AppState.tempMarkers.length > 0) {
        clearTempMarkers();
      }
    }
  });
});

// Click outside to close modals
window.onclick = function (event) {
  const modals = document.querySelectorAll(".spa-modal");
  modals.forEach((m) => {
    if (event.target === m) {
      closeModal(m.id);
    }
  });
};
