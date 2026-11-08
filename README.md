# Mantralaya Yatra app

Accounts for a group pilgrimage of about 200 people: seva bookings and contributions, travel, meals and groceries. Volunteers record money on their phones, offline if needed; the accountant sees one set of books.

Status: the **Seva Register** is built end to end: the backend ([`backend/`](backend/README.md)) and the offline-first phone app ([`ui/`](ui/README.md)). Expenses, meals, groceries and Entra sign-in are not built yet.

## Stack

Same as Money Trail, with the changes this app needs noted in [docs/architecture/backend-design.md](docs/architecture/backend-design.md).

| Layer | Choice |
|---|---|
| Mobile UI | Ionic + Angular + Capacitor (`ui/`) |
| On-device store | SQLite, offline-first, synced |
| API | ASP.NET Core (.NET 10 LTS), minimal APIs, Clean Architecture |
| Cloud store | Azure SQL Database; SQL Server in Docker for development |
| Identity | Microsoft Entra External ID, email one-time passcode |

## Documentation

Everything is under [`docs/`](docs/README.md). Start with [project-notes.md](docs/project-notes.md).

## Layout

```
docs/      decisions, design, API contract, UI notes
backend/   ASP.NET Core API, four layers, with unit, integration and architecture tests
ui/        Ionic + Angular + Capacitor app, with the Android project
```

## Workflow

Feature branch named `YYYY-MM-DD-<short-name>` (short name up to 10 characters), pull request to `main`, owner approves. Each pull request states the backend version it builds (`<Version>` in `backend/Directory.Build.props`).
