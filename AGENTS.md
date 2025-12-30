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
- Required env vars: `DATABASE_URL`, `SESSION_KEY`, optional `GOOGLE_GEOCODING_API_KEY`, `OPENROUTE_API_KEY`.
- Never commit secrets or `.env`. Use timeouts for network calls (see geocoding logic) and prefer soft‑delete helpers in models over hard deletes.

## Agent Collaboration Workflow
- Audience: This section is for code agents (Codex CLI, Claude Code, etc.). Follow it exactly.
- Never push: Do not push to remote. The maintainer performs all `git push`/merge operations. You may suggest push commands, but never execute them.
- Allowed actions: Create local branches, add/commit files, run local commands, and open PRs using GitHub CLI (`gh`).
- Base branch: `master` (not `main`).
- Branching: Use `feature/<short-slug>` (or `fix/`, `docs/`) and keep commits focused per issue.
- Testing: The maintainer runs tests after commits. Prefer small, targeted validations locally.

### Agent Workflow (Detailed)

1) Sync and branch
- `git fetch origin`
- `git checkout master && git pull --rebase`
- `git checkout -b feature/<short-slug>`

2) Implement with discipline
- Keep scope tight (one purpose per branch). Avoid unrelated refactors.
- Follow structure and style above; add endpoints only in `api_routes.py` under `/api`.
- Parcel rules: Brevard uses `tax_account` only; Orange uses `parcel_id` with dashes.

3) Validate locally
- Run: `flask --app app run --reload` (requires `.env`).
- Health: `curl http://localhost:5000/api/health`.
- Manual flows: job create, fieldwork CRUD, soft delete/restore, FAB flows, parcel searches.

4) Migrations when required
- `flask --app app db migrate -m "<message>"`
- `flask --app app db upgrade`
- Include migration files in commits and note rollback in the PR.

5) Commit etiquette
- Imperative, concise subjects; reference issues (e.g., `refs #19`, `closes #15`).
- Make logical, atomic commits; avoid giant “misc” changes.

6) Open a PR with GitHub CLI (do not push)
- Stage + commit normally, then:
```
gh pr create \
  --base master \
  --title "<Title> (refs/closes #<issue>)" \
  --body  "What/Why/How, screenshots, DB notes (migrations, rollback)" \
  --draft
```
- Helpers: `gh pr edit --add-label <label>`, `gh pr view --web`, `gh pr checks --watch`.

7) Iterate on feedback
- Add commits locally; keep PR updated with `gh`. If needed: `git fetch origin && git rebase origin/master`.

### PR Review Checklist (for agents)
- Scope: Single-purpose, minimal diff; commit messages are clear and linked to issues.
- Style: PEP 8, naming conventions, concise docstrings.
- API: JSON responses via `jsonify`; routes live in `/api` blueprint; timeouts on network I/O.
- Security: No secrets or `.env` committed; respect soft-delete patterns over hard deletes.
- Parcel logic: Brevard tax account only; Orange parcel ID format with dashes.
- UI: DaisyUI/Tailwind; Admin and Map modals consistent; FAB parcel flows tested.
- DB: Migrations included and rollback plan noted.
- Evidence: Screenshots/GIFs for UI; manual test notes.

### Definition of Done
- Critical flows validated locally; code is small and readable.
- PR opened via `gh` (draft by default) with clear What/Why/How and DB notes.
- No direct pushes performed by the agent.
