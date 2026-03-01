# Walkthrough 0060: D-005 — Self-Hosted Runner Outside Repo Tree (LOW/INFRA)

## Source Finding IDs
D-005

## Execution Journal

### Confirm Finding Validity
Inspected the repository root to confirm the `actions-runner/` directory exists and contains the reported files.

**Commands run:**
```
ls actions-runner/
```

**Result:** Directory confirmed present. Contents include `.credentials`, `.credentials_rsaparams`, and the runner distribution zip (~98MB). All are covered by `.gitignore` entries, so they are not tracked by git.

### Assess Scope
Determined this finding cannot be resolved by any code change:
- Stopping and moving the runner requires shell access to the host machine and a service management operation
- Re-registration requires GitHub PAT or OAuth flow with runner registration token
- Neither operation is scriptable within the repository itself

**Result:** Scope confirmed as infra-only.

### Document Required Steps for Infra Team
The following steps are required to resolve this finding:

1. Stop the runner service:
   ```
   cd actions-runner
   ./svc.sh stop
   ./svc.sh uninstall
   ```

2. Copy the runner installation to an external path:
   ```
   cp -r actions-runner/ C:/actions-runner/
   ```

3. Re-configure the runner at the new path with a fresh registration token from GitHub (Settings > Actions > Runners > New self-hosted runner).

4. Install and start the service from the new location:
   ```
   cd C:/actions-runner
   ./svc.sh install
   ./svc.sh start
   ```

5. Delete the `actions-runner/` directory from the repository working tree.

6. Verify the runner shows as Online in GitHub repository settings.

### No Action Taken
No changes were made to the repository. The finding is tracked and the remediation steps are documented above for the infra team.

**Result:** BLOCKED pending infra team availability.

## Verification Evidence
- `actions-runner/` directory confirmed present at repo root
- `.gitignore` confirmed to exclude sensitive runner files
- Credential files not tracked by git (confirmed via `git status`)
- Remediation steps documented; no code changes possible

## Closure Decision
**Status:** BLOCKED
**Residual risk:** Credential files in working tree with gitignore protection only; risk of accidental commit if gitignore is modified; 98MB binary inflates workspace
**Date:** 2026-03-01
