# Build pipelines

Two separate pipelines on GitHub Actions. Each runs only when its own part of the repo changes.

| Workflow | File | Runs when these change |
|---|---|---|
| **API** | `.github/workflows/api.yml` | `backend/`, the workflow, `.github/scripts/` |
| **App** | `.github/workflows/app.yml` | `ui/`, the workflow, `.github/scripts/` |

## API

| When | What runs | Result |
|---|---|---|
| Pull request | Version rules, build, migration check, unit + integration (SQL Server in Docker) + architecture tests | A check on the PR |
| Merge to `main`, or *Run workflow* | The same, then **package** (publish + migration bundle), then **wait for your approval**, then deploy | API live on Azure, tag `api-vX.Y.Z` |

The deploy job, after you approve it:

1. Signs in to Azure with OIDC (no stored password).
2. Opens the Azure SQL firewall for this runner only.
3. Runs the migration bundle against Azure SQL.
4. Closes the firewall rule again, even if the migration failed.
5. Deploys to App Service.
6. Polls `/health/ready` until it answers 200 **and** its `X-Api-Version` header is the version just built. That proves the new build is the one serving, connected to its database.
7. Tags the commit `api-vX.Y.Z`.

Approvals: open the run on the Actions tab, *Review deployments*, tick `production`, *Approve and deploy*. GitHub also emails you when a run is waiting. A run that is not approved within 30 days expires; nothing is deployed.

Setup: [azure-setup.md](azure-setup.md).

## App

The same scheme as Money Trail.

| When | What runs | Result |
|---|---|---|
| Pull request | Version rules, browser tests, web build, Android debug build | A check on the PR. The debug APK is kept 14 days under the run's *Artifacts* |
| Merge to `main` | All of the above, then a signed release build | A GitHub Release **Mantralaya Yatra X.Y.Z**, tagged `app-vX.Y.Z`, APK attached, marked Latest |
| Tag `app-v1.0.0` pushed, or *Run workflow* with **release** ticked | The same as a merge | A pushed tag is used as it is; a manual run counts as a fix |

The release build bakes in its version (shown on the Set up screen) and the repository variable `API_URL`, which the Set up screen offers as the server.

**Version codes.** Android installs an update only if its version code is higher. Pipeline builds use 1,000,000 plus the run number; laptop builds use the plain version (0.1.0 is 100), always lower. Only the newest 10 fix releases are kept; major and minor releases stay.

**Before the signing key exists**, a merge skips the release with a warning; a tag or manual release fails with "The signing key secrets are missing".

### One-time setup: the signing key

Every release must be signed with the same key, or Android refuses to install it over the previous one. Make it once, on your laptop (PowerShell, one line at a time):

```powershell
& "C:\Users\kulka\.jdks\jbr-21.0.11\bin\keytool.exe" -genkeypair -v -keystore mantralaya-yatra.jks -alias mantralayayatra -keyalg RSA -keysize 2048 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("mantralaya-yatra.jks")) | Set-Clipboard
```

Then in GitHub, **Settings › Secrets and variables › Actions › New repository secret**:

| Secret | Value |
|---|---|
| `MY_KEYSTORE_BASE64` | Paste from the clipboard |
| `MY_KEYSTORE_PASSWORD` | The keystore password you chose |
| `MY_KEY_ALIAS` | `mantralayayatra` |
| `MY_KEY_PASSWORD` | The key password (the same as the keystore password unless you chose another) |

Keep `mantralaya-yatra.jks` and its password in your password manager, never in the repository. **If the key is lost, no later build can update the installed app** on the volunteers' phones.

## Versions

Each part has its own version and tags, worked out from the merged PR's labels (`.github/scripts/next-version.mjs`, tested on every run):

| Label on the merged PR | Example |
|---|---|
| `release: major` | 1.4.2 → 2.0.0 |
| `release: minor` | 1.4.2 → 1.5.0 |
| none (a fix) | 1.4.2 → 1.4.3 |

The label applies to whichever part the PR changes; a PR that changes both bumps both. The first release of each part is the version in the code: `<Version>` in `backend/Directory.Build.props` (API) and `version` in `ui/package.json` (app), both 0.1.0. Create the two labels once under **Issues › Labels** (`release: major`, `release: minor`).
