# Detailed Contributor Workflow

This document expands on CONTRIBUTING.md with a step‑by‑step workflow for day‑to‑day changes. It is optimized for this repository’s policies: contributors may add and commit locally, create PRs via GitHub CLI, but must never push to remote directly. The maintainer performs all pushes and merges.

## Roles & Permissions

- Maintainer
  - Owns protected branches and all pushes/merges.
  - Reviews PRs, runs tests, handles deployment and DB migrations on environments.
- Contributor (you)
  - May create branches locally, add/commit code, and open PRs via `gh`.
  - Must not `git push` directly to any remote branch.

## Prerequisites

- Local setup: `python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
- App run (dev): `flask --app app run --reload` (requires `.env`)
- DB: Postgres reachable via `DATABASE_URL`. Use Flask‑Migrate commands for schema changes.
- GitHub CLI (gh): `brew install gh` (or via your package manager) and `gh auth login`.

## Daily Flow (Small, Focused Changes)

1) Sync the default branch

```bash
git fetch origin
git checkout master   # note: branch is named 'master' in this repo
git pull --rebase
```

2) Create a focused branch

```bash
git checkout -b feature/<short-slug>  # e.g., feature/fix-fab-parcel
```

3) Implement with discipline

- Read AGENTS.md for codebase conventions and agent policies.
- Keep scope tight: 1 feature/fix per branch.
- Prefer small, readable diffs. Avoid drive‑by refactors.

4) Run locally and validate

- Start the app: `flask --app app run --reload`.
- Manual health: `curl http://localhost:5000/api/health`.
- Validate critical flows called out in CONTRIBUTING: job create, fieldwork CRUD, soft delete/restore, parcel search, FAB actions.

5) Database migrations (only when needed)

```bash
flask --app app db migrate -m "<concise message>"
flask --app app db upgrade
```

Include migration files in your PR and document rollback notes.

6) Commit etiquette

- Atomic, imperative subject lines (≤ 72 chars). Reference issues: `refs #15`, `closes #19`.
- Example: `Fix FAB parcel search to call county endpoints (refs #19)`
- Use multiple commits for logical steps; avoid huge “misc” commits.

7) Never push — open a PR via GitHub CLI

```bash
# Stage and commit as usual
git add -A
git commit -m "<message>"

# Create a draft PR against master
gh pr create \
  --base master \
  --title "<concise title>" \
  --body  "<what/why/how, screenshots, DB notes>" \
  --draft

# Optional helpers
gh pr edit --add-label "area:api" --add-assignee @maintainer
gh pr view --web
```

Notes:
- Use GitHub keywords in the PR body to link/close issues.
- Attach screenshots/GIFs for UI work and explicit DB notes (migrations/rollback plan).

8) Iterate on feedback

- Add more commits locally, then use `gh pr status` to confirm your PR is updated (maintainer will push/merge as needed).
- If you need to rebase locally:

```bash
git fetch origin
git rebase origin/master
# resolve conflicts -> git rebase --continue
```

9) Post‑merge follow‑ups

- The maintainer merges and deploys. If a follow‑up is needed, open a new branch and PR.

## GitHub CLI Cookbook

- Authenticate: `gh auth login`
- Create draft PR: `gh pr create --base master --draft`
- Mark ready for review: `gh pr ready`
- Add reviewers: `gh pr edit --add-reviewer <user>`
- Check CI status: `gh pr checks --watch`
- View PR: `gh pr view --web`

## Review Checklist (submit with your PR)

- Scope is single‑purpose and minimal.
- Follows PEP 8, naming conventions, and patterns in AGENTS.md.
- API returns JSON via `jsonify`; Blueprint routes live in `api_routes.py` under `/api`.
- No secrets committed; network calls have reasonable timeouts.
- Parcel logic: Brevard uses tax account only; Orange uses parcel ID with dashes.
- UI: Admin and Map modals follow DaisyUI/Tailwind; FAB flows tested.
- DB: migrations included and safe to roll back.
- Manual test notes + screenshots attached to the PR.

## Definition of Done

- All acceptance criteria satisfied and critical flows tested locally.
- Code is small, readable, and consistent with existing style.
- PR description clearly states what/why, includes screenshots (UI), and DB notes.
- No direct pushes — PR is open via `gh`; maintainer will handle merging.

