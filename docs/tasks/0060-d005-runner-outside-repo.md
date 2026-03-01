# Task 0060: D-005 — Self-Hosted Runner Outside Repo Tree (LOW/INFRA)

## Source Finding IDs
D-005

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Development |
| Severity | LOW |
| Confidence | HIGH |
| Evidence | `actions-runner/` directory exists at repo root containing `.credentials` (OAuth client ID), `.credentials_rsaparams` (RSA private key material), and a 98MB runner zip; while `.gitignore` excludes these, the directory sits inside the working tree |
| Impact | Any accidental `git add -A` or `.gitignore` misconfiguration could commit credential files to the repository; 98MB binary in working tree inflates workspace size |
| Recommendation | Stop the runner service, move the installation directory outside the repo working tree, re-register with GitHub pointing to the new external path; remove `actions-runner/` from repo root |

## Objective
Move the self-hosted GitHub Actions runner installation out of the repository working tree to prevent accidental credential exposure and reduce workspace clutter.

## Acceptance Criteria
- [ ] GitHub Actions runner service stopped gracefully
- [ ] `actions-runner/` directory moved to a path outside the repository root (e.g., `C:/actions-runner/`)
- [ ] Runner re-registered with GitHub using credentials from the new external path
- [ ] Runner service restarted and verified online in GitHub repo settings
- [ ] `actions-runner/` no longer present in the repository working tree
- [ ] `.gitignore` entry for `actions-runner/` may be removed once directory is gone

## Status
BLOCKED — infra-only operation requiring runner service downtime window, external path provisioning, and re-registration credentials; cannot be resolved in code
