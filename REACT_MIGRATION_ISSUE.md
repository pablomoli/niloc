# Migrate Frontend to React (Vite + TypeScript + shadcn/ui)

## Overview
Migrate frontend from Jinja templates + vanilla JavaScript to React frontend while maintaining Flask backend. Flask will serve React build in production; separate dev servers run locally. Full separation of frontend/backend codebases with unified deployment.

## Phase 1: Project Setup & Infrastructure

### 1.1 Python Virtual Environment Setup
- Create Python virtual environment: `python3 -m venv venv`
- Add `venv/` to `.gitignore` (if not already present)
- Document venv activation in setup instructions
- Ensure all Python commands use venv Python interpreter

### 1.2 Create React Frontend Structure
- Create `frontend/` directory at repo root
- Initialize Vite + React + TypeScript project: `npm create vite@latest frontend -- --template react-ts`
- Install dependencies: React Router, shadcn/ui, Leaflet React wrapper
- Set up folder structure:
  ```
  frontend/
  ├── src/
  │   ├── components/
  │   │   ├── ui/          # shadcn components
  │   │   ├── Map.tsx
  │   │   ├── JobModal.tsx
  │   │   └── FABMenu.tsx
  │   ├── pages/
  │   │   ├── MapPage.tsx
  │   │   └── AdminPage.tsx
  │   ├── lib/
  │   │   ├── api.ts       # API client utilities (session-based)
  │   │   └── auth.ts      # Auth utilities (session-based)
  │   ├── App.tsx
  │   └── main.tsx
  ├── public/
  ├── package.json
  ├── vite.config.ts
  └── tsconfig.json
  ```

### 1.3 Configure Vite for Dev & Prod
- **vite.config.ts**: 
  - Build output: `outDir: '../static/react-build'`
  - Dev proxy: proxy `/api`, `/login`, `/logout` to `http://localhost:5000`
  - Base path: `base: '/'` (relative paths)
  - Environment variables: `VITE_API_URL` for API base URL
- **Environment files**:
  - `.env.development`: `VITE_API_URL=http://localhost:5000`
  - `.env.production`: `VITE_API_URL=` (empty = relative URLs)

### 1.4 Update .gitignore
- Add `venv/` (Python virtual environment)
- Add `static/react-build/` (React build output)
- Keep `node_modules/` (already ignored)
- Keep `frontend/node_modules/` (separate from root)

## Phase 2: Flask Integration

### 2.1 Update Flask Routes
- **app.py**: Add catch-all route to serve React app:
  ```python
  @app.route("/", defaults={"path": ""})
  @app.route("/<path:path>")
  @login_required
  def serve_react_app(path):
      # Skip API routes, static files, login/logout
      if path.startswith("api/") or path.startswith("static/") or path in ["login", "logout"]:
          abort(404)
      
      react_build_path = os.path.join(app.root_path, "static", "react-build")
      index_path = os.path.join(react_build_path, "index.html")
      
      if os.path.exists(index_path):
          return send_file(index_path)
      
      # Fallback to old template during migration
      return render_template("map.html")
  ```
- Keep existing `/login` and `/logout` routes (can migrate to React later)
- Keep all `/api/*` routes unchanged

### 2.2 Update Static File Serving
- Ensure Flask serves `static/react-build/assets/*` correctly
- Keep existing `static/` files (CSS, JS, icons) for backward compatibility during migration

## Phase 3: Development Workflow

### 3.1 Create Makefile with venv Support
- **Makefile** with targets:
  - `make venv`: Create Python virtual environment if it doesn't exist
  - `make install`: Create venv + install Python deps (in venv) + Node deps (root + frontend)
  - `make install-python`: Install Python dependencies in venv
  - `make install-node`: Install Node dependencies (root + frontend)
  - `make dev`: Activate venv, run Flask dev server + React dev server concurrently
  - `make dev-backend`: Run Flask dev server (with venv activation)
  - `make dev-frontend`: Run React dev server
  - `make build`: Build React for production
  - `make run`: Activate venv, run Flask with production React build
  - `make clean`: Clean build artifacts (optional: clean venv)
  - `make db-migrate`: Run Flask migrations (with venv)
  - `make db-upgrade`: Apply migrations (with venv)
  - `make help`: Show all targets

**Makefile structure:**
```makefile
VENV = venv
PYTHON = $(VENV)/bin/python
PIP = $(VENV)/bin/pip

venv:
	@if [ ! -d "$(VENV)" ]; then \
		python3 -m venv $(VENV); \
		echo "Virtual environment created."; \
	fi

install: venv install-python install-node

install-python: venv
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

install-node:
	npm install
	cd frontend && npm install

dev-backend: venv
	$(PYTHON) -m flask --app app run --reload

dev-frontend:
	cd frontend && npm run dev
```

### 3.2 Development Setup
- **Local dev workflow**:
  1. First time: `make install` (creates venv, installs all deps)
  2. Daily: `make dev` (runs both servers) or run separately:
     - Terminal 1: `make dev-backend` (Flask on :5000 with venv)
     - Terminal 2: `make dev-frontend` (React on :5173)
- **Venv activation**: Makefile handles activation automatically, or manually: `source venv/bin/activate`

## Phase 4: Production Build Configuration

### 4.1 Update render.yaml
- Modify build command to build React:
  ```yaml
  buildCommand: |
    pip install -r requirements.txt
    npm install
    npm run build  # Build Tailwind CSS
    cd frontend
    npm install
    npm run build  # Build React
    cd ..
  ```
- Keep start command: `gunicorn app:app`
- Ensure `NODE_VERSION` env var is set (18+)

### 4.2 Build Verification
- React build outputs to `static/react-build/`
- Flask serves React files correctly
- API endpoints remain functional
- Static assets (CSS, JS, images) load correctly

## Phase 5: API Client & Authentication

### 5.1 Create API Client (Session-based)
- **frontend/src/lib/api.ts**:
  - Base API client with `credentials: 'include'` for session cookies
  - Helper functions: `fetchJobs()`, `createJob()`, `updateJob()`, etc.
  - Error handling and response parsing
  - Uses `VITE_API_URL` env var or relative URLs
  - Handle Flask redirects (login_required redirects to /login)
  - No JWT token handling - relies on Flask session cookies

### 5.2 Authentication Flow (Session-based)
- Keep Flask session-based auth (no JWT migration)
- React includes cookies automatically with `credentials: 'include'`
- Login: POST to `/login` with FormData
- Logout: GET `/logout` then redirect
- Protected routes: Flask `@login_required` decorator handles redirects
- No UX difference - sessions work transparently

## Phase 6: Component Migration Strategy

### 6.1 Phase 6a: Proof of Concept
- Migrate one simple component (e.g., job creation modal)
- Verify API integration works
- Test dev and prod builds

### 6.2 Phase 6b: Admin Panel Migration
- Migrate admin SPA to React
- Use shadcn/ui components
- Keep Flask `/admin` route, serve React app

### 6.3 Phase 6c: Map Page Migration
- Migrate map functionality:
  - Leaflet map integration (`react-leaflet`)
  - Job markers and clustering
  - FAB menu
  - Search modals
  - Job detail modals
- Migrate existing JavaScript utilities to TypeScript

### 6.4 Phase 6d: Cleanup
- Remove old Jinja templates (keep `login.html` initially)
- Remove old JavaScript files (`static/js/*`)
- Update documentation

## Phase 7: Styling Migration

### 7.1 Tailwind Integration
- Keep existing Tailwind build for now (runs alongside React)
- Migrate Tailwind config to React project later
- Use shadcn/ui components (built on Tailwind)
- Maintain existing DaisyUI theme colors

### 7.2 CSS Strategy
- React components use Tailwind classes
- shadcn/ui components styled with Tailwind
- Keep existing `static/css/theme.css` for global styles
- Eventually consolidate all CSS into React build

## Phase 8: Testing & Validation

### 8.1 Development Testing
- Verify React dev server proxies API correctly
- Test hot reload for both frontend and backend
- Verify authentication flow works
- Test all API endpoints from React

### 8.2 Production Testing
- Build React locally: `make build`
- Test Flask serving React: `make run`
- Verify all routes work (SPA routing)
- Test on Render.com deployment
- Verify static assets load correctly

## Key Files to Create/Modify

### New Files:
- `frontend/` (entire directory)
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/.env.development`
- `frontend/.env.production`
- `frontend/src/lib/api.ts` (session-based)
- `frontend/src/lib/auth.ts` (session-based)
- `Makefile` (with venv support)
- `venv/` (created by Makefile, gitignored)

### Modified Files:
- `app.py` (add React serving route)
- `render.yaml` (update build command - venv not needed on Render)
- `.gitignore` (add `venv/` and `static/react-build/`)
- `package.json` (add scripts for concurrent dev, or keep minimal)

### Files to Keep (During Migration):
- `templates/` (fallback during migration)
- `static/js/` (gradually replace)
- `static/css/` (migrate to React later)
- `auth_utils.py` (keep session-based auth)

## Success Criteria

1. ✅ Python venv created and used for all Python commands
2. ✅ React app runs in dev mode with hot reload
3. ✅ Flask API works independently (with venv)
4. ✅ Production build creates `static/react-build/`
5. ✅ Flask serves React app correctly
6. ✅ All API endpoints accessible from React
7. ✅ Authentication works (session-based, no JWT)
8. ✅ Render.com deployment succeeds (venv created automatically)
9. ✅ Makefile provides easy local development with venv

## Migration Timeline

- **Week 1**: Setup (Phases 1-3) - Infrastructure, venv, and dev workflow
- **Week 2**: Integration (Phases 4-5) - Production builds and API client (sessions)
- **Week 3**: Migration (Phase 6a-6b) - Proof of concept + admin panel
- **Week 4**: Migration (Phase 6c) - Map page migration
- **Week 5**: Cleanup (Phase 6d-7) - Remove old code, consolidate styles

## Notes

- Render.com does NOT use Makefile (uses `render.yaml`), but Makefile is valuable for local dev
- Render.com creates its own Python environment automatically - no need to commit venv
- Keep Tailwind build process during migration (both run in parallel)
- Can deploy incrementally - Flask fallback ensures old templates work until React is ready
- Session auth works because React and Flask are same domain in production
- Venv is only for local development

