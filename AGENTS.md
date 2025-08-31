# Repository Guidelines

## Project Structure & Module Organization
- Core app: `app.py` (Flask app/bootstrap), `api_routes.py` (API Blueprint at `/api`), `models.py` (SQLAlchemy models).
- Supporting modules: `auth_utils.py`, `db_utils.py`, `utils.py`, `admin/` (admin blueprint), `python_scripts/` (one‑off scripts).
- Web assets: `templates/` (Jinja), `static/` (CSS/JS/data), `migrations/` (Flask‑Migrate/Alembic).
- Deployment: `Procfile` (Gunicorn), `.env` for secrets (not committed).

## Build, Test, and Development Commands
- Setup: `python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`.
- Run (dev): `flask --app app run --reload` (requires `.env` vars).
- Run (prod): `gunicorn app:app` (matches `Procfile`).
- DB migrate: `flask --app app db migrate -m "message"` then `flask --app app db upgrade`.
- Health check: `curl http://localhost:5000/api/health`.

## Coding Style & Naming Conventions
- Python: PEP 8, 4‑space indentation, UTF‑8, line length ≤ 100 where practical.
- Naming: `snake_case` for functions/vars, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.
- Types/docstrings: prefer type hints and concise docstrings on public functions and endpoints.
- API: add routes to `api_routes.py` under the `/api` blueprint; return JSON via `jsonify`, use `login_required` as appropriate.

## Testing Guidelines
- No formal suite yet; add targeted tests when changing behavior.
- Prefer `pytest` with files named `test_*.py` under a new `tests/` directory.
- Validate critical flows manually: create job, fieldwork CRUD, soft delete/restore, and `/api/health`.

## Commit & Pull Request Guidelines
- Commits: imperative mood, concise (e.g., "Add parcel geocoding"), reference issues (`closes #9`, `Issue #7`) when relevant.
- PRs: include a clear description, linked issues, screenshots/GIFs for UI changes, and DB notes (migrations required? rollback plan?).
- Scope: one feature/fix per PR; keep diffs focused and self‑contained.

## Security & Configuration
- Required env vars: `DATABASE_URL`, `SESSION_KEY`, optional `GOOGLE_GEOCODING_API_KEY`.
- Never commit secrets or `.env`. Use timeouts for network calls (see geocoding logic) and prefer soft‑delete helpers in models over hard deletes.

