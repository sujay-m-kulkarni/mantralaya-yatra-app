# Project notes

Last updated 7 Nov 2026.

## Goal

A mobile app for the accountant of a group pilgrimage to Mantralaya (about 200 people) to keep one honest set of books: seva bookings and contributions, travel, daily breakfast, lunch and dinner, and groceries. Several volunteers take money on their own phones, often without network; the accountant needs every rupee traceable to a person, a receipt and a day.

## Scope

**Seva Register (built first)**
- Four sevas: Sarva Samarpana Seva, Sarva Seva, Hastodaka, Ashtottara. The accountant can add more.
- Each booking carries the devotee, the seva day and sankalpa details (on behalf of, gotra, nakshatra, rashi, occasion) for the priest.
- Payments by cash, UPI or bank; part payments allowed; unpaid bookings show as pending.
- A numbered receipt per booking, shared on WhatsApp.
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
| Stack | Same as Money Trail: Ionic + Angular + Capacitor, ASP.NET Core minimal APIs in four layers, SQL Server / Azure SQL |
| Approach | Offline-first: phones record without network and sync later |
| Repository | Its own repo, `mantralaya-yatra-app` (not inside Money Trail) |
| Data ownership | Shared by a yatra's members, not owned by one user. Every row carries the yatra id |
| Money entries | Append-only. Never edited or deleted; a mistake is cancelled with a reversal, recorded by the accountant only |
| Receipt numbers | The phone prints a draft number offline; the server issues the final number (SRV-0001, …) when the booking syncs. Gap-free per seva per yatra |
| Daily limits | A booking over a seva's daily limit is accepted and flagged for review, not refused, so collected cash always has a record |
| Roles | Accounts (the accountant), Volunteer (books and takes payments), Viewer (committee, read only) |
| Identity | Microsoft Entra External ID, email one-time passcode. The accountant adds members by email; access starts when they first sign in with it |
| Money | Integer paise on the phone, on the wire and on the server |
| Seva rates | Not assumed. Seeded empty; the accountant enters the real rates and limits |
| Testing | Unit, integration (SQL Server in Docker) and architecture tests, as in Money Trail |
| Git workflow | Feature branch `YYYY-MM-DD-<short-name>`, pull request to `main`, owner approves; each PR states the version it builds |

## Open decisions

- [ ] Real rate for each seva, or "devotee gives what they wish"
- [ ] Daily limits (for example, one Hastodaka a day?)
- [ ] Where seva money goes: handed to the mutt or temple, kept for group expenses, or split
- [ ] Do local devotees outside the group also book sevas
- [ ] Draft receipt format on the phone (proposed: `SRV-D-<volunteer initials>-<phone counter>`)

## Next steps

1. Generate the first EF migration on a laptop (see `backend/README.md`) and turn on the migration check in CI.
2. Ionic app: Seva Register and Book a seva screens, local SQLite, push and pull.
3. Receipt sharing on WhatsApp (image or PDF from the phone).
4. Entra External ID tenant and app registrations.
5. Pilgrim register, then expenses and cash wallets.
