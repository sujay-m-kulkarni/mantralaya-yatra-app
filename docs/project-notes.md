# Project notes

Last updated 8 Nov 2026.

## Goal

A mobile app for the accountant of a group pilgrimage to Mantralaya (about 200 people) to keep one honest set of books: seva bookings and contributions, travel, daily breakfast, lunch and dinner, and groceries. Several volunteers take money on their own phones, often without network; the accountant needs every rupee traceable to a person, a receipt and a day.

## Scope

**Seva Register (built first)**
- Sevas (Sarva Samarpana Seva, Sarva Seva, Hastodaka, Ashtottara and any others) are created by the accountant on the Sevas screen, each with a fixed price. A new yatra starts with none.
- Each booking carries the devotee, the seva day and sankalpa details (on behalf of, gotra, nakshatra, rashi, occasion) for the priest.
- Payments by cash, UPI or bank; part payments allowed; unpaid bookings show as pending.
- A numbered receipt per booking, kept in the register. The app does not send anything to WhatsApp.
- A daily register (collections by mode, pending, slot usage) and a printable priest's list.

**Later**
- Pilgrim register (families, buses, diet)
- Expenses (travel, food, groceries, accommodation) with bill photos and vendor balances
- Meal headcounts and cost per plate
- Grocery stock in and out
- Cash wallets per volunteer with end-of-day reconciliation
- Final settlement report

## Decisions

| Area | Decision |
|---|---|
| Stack | Same as Money Trail: Ionic + Angular + Capacitor (in `ui/`), ASP.NET Core minimal APIs in four layers, SQL Server / Azure SQL |
| Phone storage | Rows kept as JSON per collection in SQLite (Money Trail's native bridge); localStorage when run in a browser |
| Receipts | Numbered in the register only; the app is not linked to WhatsApp and sends nothing |
| Approach | Offline-first: phones record without network and sync later |
| Repository | Its own repo, `mantralaya-yatra-app` (not inside Money Trail) |
| Data ownership | Shared by a yatra's members, not owned by one user. Every row carries the yatra id |
| Money entries | Append-only. Never edited or deleted; a mistake is cancelled with a reversal, recorded by the accountant only |
| Receipt numbers | The phone prints a draft number offline; the server issues the final number (SRV-0001, …) when the booking syncs. Gap-free per seva per yatra |
| Daily limits | A booking over a seva's daily limit is accepted and flagged for review, not refused, so collected cash always has a record |
| Roles | In the model for later (Accounts, Volunteer, Viewer); today the one user is Accounts |
| Users | One person, the accountant, uses the app. No volunteers sign in (changed 8 Nov 2026) |
| Server access | A long random API key built into the app and sent with every call; stored in the web app setting and the build's secrets, never in the repository. No Azure user directory, no email (Entra External ID was tried and dropped) |
| App lock | The phone's fingerprint, face or PIN unlocks the app at start and after 2 minutes away |
| Money | Integer paise on the phone, on the wire and on the server |
| Seva rates | Every seva has a fixed price, set when the accountant creates it. A booking takes that price and it cannot be changed on the booking form |
| Testing | Unit, integration (SQL Server in Docker) and architecture tests, as in Money Trail |
| CI/CD | Two pipelines. API: tests on PRs; on merge, deploy to Azure App Service + Azure SQL after the owner's approval, OIDC sign-in, migrations in the pipeline, tag `api-vX.Y.Z`. App: tests and debug APK on PRs; signed APK as a GitHub Release on merge, tag `app-vX.Y.Z`. Versions from PR labels, per part |
| Git workflow | Feature branch `YYYY-MM-DD-<short-name>`, pull request to `main`, owner approves; each PR states the version it builds |

## Open decisions

- [ ] Real rate for each seva, or "devotee gives what they wish"
- [ ] Daily limits (for example, one Hastodaka a day?)
- [ ] Where seva money goes: handed to the mutt or temple, kept for group expenses, or split
- [ ] Do local devotees outside the group also book sevas
- [ ] Draft receipt format on the phone (proposed: `SRV-D-<volunteer initials>-<phone counter>`)

## Next steps

1. Generate the first EF migration on a laptop (see `backend/README.md`) and turn on the migration check in CI.
2. ~~Ionic app: Seva Register and Book a seva screens, local SQLite, push and pull.~~ Built in `ui/`.
3. ~~Sign-in~~ API key + fingerprint lock (no Entra).
4. ~~CI/CD pipelines~~ Built (`docs/guides/build-pipeline.md`). One-time setup left: Azure resources and the `production` environment (`docs/guides/azure-setup.md`), the APK signing key, the two release labels.
5. Pilgrim register, then expenses and cash wallets.
