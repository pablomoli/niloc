# Epic Map Project Management

**Status:** In Development  
**Last Updated:** June 07, 2025  
**Version:** 1.0

---

## CORE

keep implementations reusable
reduce duplicated
abstract files into components when possible

need to define mobile view for map. very important to be able to use it on the phone. Iphone 16 pro max

need to set up document upload on supabase/render
need to implement row level security (dont understand this but ik its important)

---

## MAP

- satellite base layer
- get detailed florida counties shapefile from FDOT website and add that as a toggle-able layer
- use svg for markers, color based on status attribute. no shadows on markers
- make minimal job details (can edit/mark for deletion) panel with fieldwork entries (add/edit)
- static sites like office and clients and suppliers (selectable for routing)

- all modals are snappy, clean-looking, and Architecture is easy to evolve

### map controls

- search address, fly to it and create a popup to create a job
- mode selection to create a job wherever I click, (need to check logic and edge cases)
- filter markers on map based on status
- filter by a search (should search client and jobnumber)
- be able to select jobs and route between them (redirect to google maps for now)

### Leaflet Add Ons

- job clusters
- full screen
- filtering

---

## ADMIN SPA

### dashboard

show high level overview
perhaps some basic insights. (donut graphs of all jobs based on status)
vary high level

### jobs

table view of jobs

- CRUD via a modal
- can query for fieldwork entries per each row (only on demand)

### deleted (jobs)

- can bring back soft deleted jobs (handle logic for duplicate keys if necessary)
- delete permanently with scary popups to ensure deletion

### user

- CRUD on users (admin cannot be deleted)
- toggle users role

---

## API

need to develop how to handle jobs with parcel number / account numbers (no address)

- perhaps with property appraiser sites (Orange, Brevard, Seminole)
- need to implement endpoint to get property appraiser website link for jobs _with_ addresses
- need to create document upload per job
- need to implement tags feature (could be downgraded to a multiselect field for simplicity)

## PROJECT NOTES

### Current Architecture

- **Frontend:** Bootstrap 5 + Leaflet.js + Vanilla JavaScript
- **Backend:** Flask + SQLAlchemy + PostgreSQL
- **Authentication:** Session-based with role management
- **Deployment:** Development server (local), Production deployed on Render

### Dependencies

- Bootstrap 5.3.0
- Leaflet 1.9.4
- Flask + SQLAlchemy
- PostgreSQL database

---

## IMPLEMENTATION PLAN

**Timeline:** 15 working days (3 weeks)
**Developer:** Solo development
**Approach:** Desktop-first with mobile considerations

### WEEK 1: Core Foundation (Days 1-5)

**Day 1: Map Foundation & Mobile Definition**
- Morning: Clean up current barebones map.html implementation
- Afternoon: Define responsive breakpoints and mobile layout patterns
- Deliverable: Mobile UI wireframes and responsive CSS framework
- Evening: Test current map on iPhone 16 Pro Max, document issues

**Day 2: SVG Markers & Status System**
- Morning: Create SVG marker system with status-based colors
- Afternoon: Implement marker switching logic (pending=blue, in-progress=orange, completed=green, cancelled=red)
- Deliverable: Dynamic SVG markers working on desktop and mobile
- Testing: Verify marker touch targets are 44px+ on mobile

**Day 3: Address Search & Job Creation Popup**
- Morning: Implement address search with geocoding
- Afternoon: Create "fly to location" functionality with popup
- Evening: Build job creation modal triggered from search popup
- Deliverable: Complete address search to job creation workflow
- Mobile test: Ensure search input and modal work on touch devices

**Day 4: Job Details Panel**
- Morning: Design minimal job details panel (desktop: sidebar, mobile: full overlay)
- Afternoon: Implement job selection and details display
- Evening: Add edit/delete buttons and basic fieldwork entries list
- Deliverable: Working job details panel with CRUD buttons
- Responsive test: Panel transforms properly on mobile breakpoint

**Day 5: Click-to-Create Mode**
- Morning: Implement map click mode toggle
- Afternoon: Add click-to-create job functionality with edge case handling
- Evening: Test mode switching and validation logic
- Deliverable: Complete click-anywhere-to-create-job feature
- Mobile optimization: Ensure touch events work properly

### WEEK 2: Enhanced Functionality (Days 6-10)

**Day 6: Satellite Basemap**
- Morning: Research and implement satellite tile layer options
- Afternoon: Add basemap switcher (Streets/Satellite toggle)
- Deliverable: Working satellite basemap with toggle control
- Mobile test: Basemap switcher accessible on mobile

**Day 7: Job Filtering System**
- Morning: Implement status-based marker filtering
- Afternoon: Add search filtering (client name + job number)
- Evening: Create filter UI controls and state management
- Deliverable: Complete job filtering by status and search terms
- Mobile optimization: Filter controls in collapsible mobile menu

**Day 8: Florida Counties Shapefile**
- Morning: Download and process FDOT counties shapefile
- Afternoon: Implement counties layer with toggle control
- Evening: Optimize shapefile for web performance
- Deliverable: Toggle-able Florida counties overlay layer
- Testing: Performance test on mobile devices

**Day 9: Modal Architecture Cleanup**
- Morning: Standardize modal system for job CRUD operations
- Afternoon: Implement consistent modal styling and animations
- Evening: Ensure all modals work properly on mobile
- Deliverable: Clean, consistent modal system across all features
- Mobile focus: Touch-friendly modal interactions and sizing

**Day 10: Job Selection & Routing**
- Morning: Implement multi-job selection functionality
- Afternoon: Create "Route Selected Jobs" feature (Google Maps redirect)
- Evening: Add job selection UI and state management
- Deliverable: Working job selection and routing to Google Maps
- Mobile test: Selection interface works on touch devices

### WEEK 3: Advanced Features & Polish (Days 11-15)

**Day 11: Document Upload System**
- Morning: Set up Supabase storage bucket and authentication
- Afternoon: Implement file upload API endpoints
- Evening: Create document upload UI in job details panel
- Deliverable: Working document upload/download per job
- Mobile consideration: File picker and upload progress on mobile

**Day 12: Property Appraiser Integration**
- Morning: Research Orange, Brevard, Seminole property appraiser APIs
- Afternoon: Implement property lookup by address
- Evening: Create property appraiser link generation
- Deliverable: Automatic property appraiser links for jobs with addresses
- Testing: Links work properly on mobile browsers

**Day 13: Job Clustering & Performance**
- Morning: Implement Leaflet.markercluster for job markers
- Afternoon: Optimize clustering settings for performance
- Evening: Test clustering behavior on mobile devices
- Deliverable: Performant job clustering on map
- Mobile optimization: Cluster touch targets and zoom behavior

**Day 14: Admin SPA Enhancements**
- Morning: Implement dashboard with job status donut charts
- Afternoon: Enhance jobs table with on-demand fieldwork queries
- Evening: Add deleted jobs recovery functionality
- Deliverable: Enhanced admin dashboard and job management
- Mobile responsive: Admin tables work on mobile (horizontal scroll)

**Day 15: Final Polish & Mobile Testing**
- Morning: Comprehensive mobile testing on iPhone 16 Pro Max
- Afternoon: Fix any mobile-specific issues and performance problems
- Evening: Final testing of complete workflow on desktop and mobile
- Deliverable: Production-ready application with defined mobile experience
- Documentation: Update project notes with mobile usage patterns

### DAILY TESTING PROTOCOL
- **End of each day:** Test new features on iPhone 16 Pro Max
- **Every 3 days:** Full regression testing on desktop and mobile
- **Weekly:** Complete user workflow testing (job creation to completion)

### MOBILE EXPERIENCE CHECKPOINTS
- **Day 1:** Mobile layout framework defined
- **Day 5:** Core mobile interactions working
- **Day 10:** Advanced mobile features functional
- **Day 15:** Complete mobile experience polished

### RISK MITIGATION
- **FDOT shapefile complexity:** Have simplified county boundaries backup
- **Property appraiser API limits:** Implement graceful fallbacks
- **Mobile performance:** Monitor and optimize at each checkpoint
- **Scope creep:** Strict daily deliverable focus

