# Epic Map - Comprehensive Development Documentation

## Project Overview

Epic Map is a field service management application for tracking and managing location-based jobs with geographic visualization. The application provides a mobile-friendly map interface with simplified workflow for field crews and a comprehensive admin dashboard for management oversight.

**Hosting & Infrastructure:**

- **Backend**: Flask application hosted on Render
- **Database**: Supabase (PostgreSQL with PostGIS extensions)
- **Frontend**: Bootstrap 5/Tailwind CSS + DaisyUI, Alpine.js, Leaflet.js
- **Authentication**: Session-based with bcrypt password hashing

## Types of Jobs (User Defined)

Epic Surveying has two types of sites they work on: Address and Parcel Jobs.
Address jobs have an existing address on the world and thus is indexable in various APIs as such.
Address jobs use the Google Maps API to be geocoded. This, unless there is user error has a 100% chance
of returning the correct address/coordinates.

Epic develops construction sites (aka sites, jobs) from a stage where its just a parcel of and
hence the parcel jobs. These job sites do not have an address yet but once our service in over they will.

# TODO

We need to develop a system to allow parcel jobs to be able to be promoted to address jobs.
Also we need to create a pipeline or a hierarchy to make this possible.

It would be Parcel Job -> Address job but never the other way. That would be a downgrade.

Address jobs will remain address jobs once they are created/upgraded

## Database Schemas (Supabase PostgreSQL)

### Jobs Table (`jobs`)

The main entity representing field service jobs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing job ID |
| `job_number` | VARCHAR(50) | UNIQUE, NOT NULL | Human-readable job identifier |
| `client` | VARCHAR(100) | NOT NULL | Client/customer name |
| `address` | TEXT | NOT NULL | Job location address |
| `status` | VARCHAR(100) | | Current job status (see status options below) |
| `county` | VARCHAR(50) | | Geographic county |
| `notes` | TEXT | | Additional job notes |
| `lat` | VARCHAR(20) | | Latitude coordinate |
| `long` | VARCHAR(20) | | Longitude coordinate |
| `prop_appr_link` | VARCHAR(500) | | Property appraiser link |
| `plat_link` | VARCHAR(500) | | Plat document link |
| `fema_link` | VARCHAR(500) | | FEMA flood zone link |
| `document_url` | VARCHAR(500) | | Job document URL |
| `visited` | INTEGER | DEFAULT 0 | Number of site visits |
| `total_time_spent` | FLOAT | DEFAULT 0.0 | Total fieldwork hours |
| `is_parcel_job` | BOOLEAN | DEFAULT FALSE | Created via parcel lookup |
| `parcel_data` | JSON | | Parcel lookup metadata |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Job creation timestamp |
| `created_by_id` | INTEGER | FK users.id | Creating user ID |
| `deleted_at` | TIMESTAMP | | Soft deletion timestamp |
| `deleted_by_id` | INTEGER | FK users.id | Deleting user ID |
| `original_job_number` | VARCHAR(50) | | Original number for deleted jobs |

**Job Status Options:**

- `Completed/To be Filed` (Green)
- `Fieldwork Complete` (Purple)
- `To Be Printed` (Blue)
- `Survey Complete/Invoice Sent` (Yellow)
- `Needs Fieldwork` (Orange)
- `Set/Flag Pins` (Red)
- `On Hold/Pending Estimate` (Grey)
- `Site Plan` (Pink)

### FieldWork Table (`fieldwork`)

Time tracking entries for field work performed on jobs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing entry ID |
| `job_id` | INTEGER | FK jobs.id, NOT NULL | Associated job |
| `work_date` | DATE | NOT NULL | Date work was performed |
| `start_time` | TIME | NOT NULL | Work start time |
| `end_time` | TIME | NOT NULL | Work end time |
| `total_time` | FLOAT | NOT NULL | Calculated hours worked |
| `crew` | VARCHAR(100) | | Crew/worker identifier |
| `drone_card` | VARCHAR(100) | | Drone card/equipment ID |
| `notes` | TEXT | | Work notes |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Entry creation timestamp |

### Users Table (`users`)

System user accounts and authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing user ID |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Login username |
| `name` | VARCHAR(100) | NOT NULL | Display name |
| `password` | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| `role` | VARCHAR(20) | DEFAULT 'user' | User role (user/admin) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| `last_login` | TIMESTAMP | | Last login timestamp |
| `last_ip` | VARCHAR(45) | | Last login IP address |

### Tags Table (`tags`)

Categorization system for jobs (currently unused but available).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing tag ID |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL | Tag name |
| `color` | VARCHAR(7) | DEFAULT '#007bff' | Hex color code |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Tag creation timestamp |

## API Routes Documentation

### Job Management APIs

#### Core Job Operations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/jobs` | List all active jobs | Yes |
| `GET` | `/api/jobs/<job_number>` | Get specific job details | Yes |
| `POST` | `/api/jobs` | Create new job | Yes |
| `PUT` | `/api/jobs/<job_number>` | Update job details | Yes |
| `DELETE` | `/api/jobs/<job_number>` | Soft delete job | Yes |

#### Job Deletion & Recovery

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/jobs/deleted` | List deleted jobs | Admin |
| `POST` | `/api/jobs/<job_number>/restore` | Restore deleted job | Admin |
| `DELETE` | `/api/jobs/<job_number>/permanent-delete` | Permanently delete job | Admin |

#### Job Search & Discovery

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/jobs/search` | Search jobs by criteria | Yes |
| `GET` | `/api/jobs/search/autocomplete` | Autocomplete suggestions | Yes |

### Fieldwork/Time Tracking APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/jobs/<job_number>/fieldwork` | Get all fieldwork entries for job | Yes |
| `POST` | `/api/jobs/<job_number>/fieldwork` | Add new fieldwork entry | Yes |
| `PUT` | `/api/fieldwork/<id>` | Update fieldwork entry | Yes |
| `DELETE` | `/api/fieldwork/<id>` | Delete fieldwork entry | Yes |

**Note:** Fieldwork operations automatically update the job's `total_time_spent` and `visited` counters.

### User Management APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/users` | List all users | Admin |
| `POST` | `/api/users` | Create new user | Admin |
| `PUT` | `/api/users/<id>` | Update user details | Admin |
| `DELETE` | `/api/users/<id>` | Delete user | Admin |
| `PUT` | `/api/users/<id>/password` | Change user password | Admin |
| `PUT` | `/api/users/<id>/role` | Change user role | Admin |

### Geocoding & Location APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/geocode` | Geocode address to coordinates | Yes |
| `GET` | `/api/reverse-geocode` | Reverse geocode coordinates to address | Yes |
| `GET` | `/api/geocode/brevard-parcel` | Brevard County parcel lookup | Yes |
| `GET` | `/api/geocode/orange-parcel` | Orange County parcel lookup | Yes |

### System APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/health` | System health check | No |

## Frontend Routes

### Public Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Main map interface |
| `GET` | `/login` | Login page |
| `POST` | `/logout` | User logout |

### Admin Routes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/admin/` | Admin dashboard SPA | Admin |

## Tech Stack Details

### Backend Framework

- **Flask**: Python web framework
- **SQLAlchemy**: Database ORM
- **Flask-SQLAlchemy**: Flask integration
- **Bcrypt**: Password hashing

### Frontend Technologies  

- **Bootstrap 5**: CSS framework (being migrated to Tailwind)
- **Tailwind CSS + DaisyUI**: Modern CSS framework
- **Alpine.js**: Lightweight JavaScript framework
- **Leaflet.js**: Interactive map library

### Key Files Structure

```
├── app.py                     # Main Flask application entry point
├── models.py                  # SQLAlchemy database models
├── api_routes.py             # REST API endpoints
├── admin/
│   ├── __init__.py           # Admin blueprint initialization  
│   └── routes.py             # Admin view routes
├── templates/
│   ├── map.html              # Main map interface
│   ├── admin_spa.html        # Admin dashboard SPA
│   └── login.html            # Login page
├── static/js/
│   ├── map.js                # Core map functionality
│   ├── simple-modal.js       # Job details modal with fieldwork
│   ├── marker-utils.js       # Map marker utilities
│   ├── create-job-modal.js   # Job creation modal
│   └── fab-menu.js           # Floating action button menu
├── auth_utils.py             # Authentication utilities
├── db_utils.py              # Database utilities
└── utils.py                 # General utilities
```

## Development Workflow

### Running Locally

```bash
python app.py
or 
flask run
# Application runs on http://localhost:5000
```

### Environment Setup

- Uses Supabase for database (PostgreSQL)
- Requires Google Geocoding API key for address lookups
- Session-based authentication

### Key Features

#### Map Interface

- **Interactive Map**: Leaflet.js with custom markers
- **Job Details Modal**: Complete fieldwork time tracking integration
- **Mobile Optimized**: Touch-friendly interface for field crews
- **Real-time Updates**: Live job status and time tracking

#### Admin Dashboard  

- **Job Management**: Complete CRUD operations
- **Time Tracking**: Fieldwork management with totals
- **User Management**: Full user administration
- **Search & Filtering**: Advanced job search capabilities

#### Time Tracking System

- **Field Interface**: Mobile-friendly time entry via job modal
- **Admin Interface**: Comprehensive fieldwork management
- **Automatic Calculations**: Real-time total time updates
- **Data Integrity**: Automatic job total_time_spent synchronization

### Mobile Optimization Notes

- **Target Device**: iPhone 16 Pro Max (and desktop)
- **Touch Targets**: Minimum 44px for accessibility
- **iOS Zoom Prevention**: 16px font-size on form inputs
- **Modal Behavior**: Full-screen on mobile with proper scroll handling
- **Map Interaction**: Enhanced touch area for markers

### Common Development Tasks

#### Testing Fieldwork Functionality

- Test time entry on actual mobile devices
- Verify time calculations are accurate
- Check modal scrolling on various screen sizes
- Validate data synchronization between interfaces

#### Database Operations

- All models use soft deletion where applicable
- Fieldwork automatically updates job totals
- PostgreSQL with PostGIS for geographic data
- Supabase handles database hosting and backups

### Security Considerations

- Session-based authentication with bcrypt
- Admin-only routes properly protected
- API endpoints require authentication
- Input validation on all user data
- SQL injection protection via SQLAlchemy ORM

## Deployment (Render + Supabase)

### Production Environment

- **Web Host**: Render (Python web service)
- **Database**: Supabase (Managed PostgreSQL)
- **Static Assets**: Served via CDN links (Bootstrap, Alpine.js, Leaflet)
- **Environment Variables**: Configured in Render dashboard

### Configuration Requirements

- `DATABASE_URL`: Supabase PostgreSQL connection string
- `SECRET_KEY`: Flask session encryption key
- `GOOGLE_GEOCODING_API_KEY`: For address geocoding
