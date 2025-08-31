# Contributing Workflow

This document defines how we work on issues and pull requests, with exact commands
and when to use them. It complements AGENTS.md (agent-specific guidance).

## Roles & Approvals
- Maintainer runs tests after commits and performs all pushes.
- Assistant never pushes; it may suggest commands but does not execute `git push`.

## Branching Strategy
- Base branch: `master`
- Feature branches: `feature/<short-slug>` (e.g., `feature/extract-map-css`)

Commands:
- Update local and create a feature branch:
  - `git checkout master && git pull --ff-only`
  - `git checkout -b feature/<short-slug>`

## Working on an Issue
- Reference the GitHub issue number in the branch name and PR title/body.
- Keep changes focused and scoped to a single issue.

Commands:
- Stage and commit focused changes:
  - `git add -p` (or explicit paths)
  - `git commit -m "<Imperative summary> (refs #<issue>)"`

## Testing (maintainer)
- Run app locally and sanity-check critical flows.
- No formal test suite yet; prefer targeted tests under `tests/` (pytest) when behavior changes.

Commands:
- Dev server: `flask --app app run --reload`
- Health check: `curl http://localhost:5000/api/health`

## Push & Pull Request
- Maintainer pushes branches and opens PRs.

Commands:
- Push branch (first time):
  - `git push -u origin feature/<short-slug>`
- Create PR against `master` (using GitHub CLI):
  - `gh pr create -t "<Title> (closes #<issue>)" -b "<Body>" -H feature/<short-slug> -B master -l refactor -l css`
- Open PR in browser:
  - `gh pr view --web`
- Check PR status:
  - `gh pr status`

## Merging & Issue Closure
- Merge via Web UI (preferred) or gh. Close related issues on merge.

Commands:
- Merge with gh (optional):
  - `gh pr merge <PR#> --squash --delete-branch`
- Close issue with context:
  - `gh issue close <issue#> -r completed -c "Closed via PR #<PR#>."`

## Branch Cleanup
- After merging, delete local and remote feature branches.

Commands:
- Local: `git branch -d feature/<short-slug>`
- Remote: `git push origin --delete feature/<short-slug>`

## Quick Reference
- Start work:
  - `git checkout master && git pull --ff-only && git checkout -b feature/<slug>`
- Commit:
  - `git add -p && git commit -m "<Message> (refs #<issue>)"`
- Push (maintainer):
  - `git push -u origin feature/<slug>`
- PR:
  - `gh pr create -t "<Title> (closes #<issue>)" -b "<Body>" -H feature/<slug> -B master`
- Merge & close:
  - `gh pr merge <PR#> --squash --delete-branch`
  - `gh issue close <issue#> -r completed -c "Closed via PR #<PR#>."`
- Cleanup:
  - `git branch -d feature/<slug>`
  - `git push origin --delete feature/<slug>`

Notes:
- Keep PRs small and focused; include screenshots/GIFs for UI changes.
- Do not commit secrets or `.env`. See AGENTS.md for security and environment details.
