# App (Ionic + Angular + Capacitor)

The volunteers' phone app for the Seva Register. Same stack and versions as Money Trail's app: Angular 20, Ionic 9, Capacitor 8, and Money Trail's own SQLite bridge on Android.

## What it does

| Screen | |
|---|---|
| Set up | Server address, your name and email; choose a yatra or start one (you become its accountant) |
| Seva Register | Day switcher, money collected that day (cash, UPI/bank, pending), seva filter, slots used against daily limits, every booking. Pull down to sync |
| Book a seva | Seva (full ones greyed out), seva date, devotee and mobile, sankalpa, amount, paid now by cash/UPI/bank or not paid. Saves and opens the WhatsApp receipt |
| Booking | Receipt (provisional until synced, then the final number), payments, record a later payment, re-send the receipt; the accountant can reverse a booking or a payment |
| Priest list | The day's sevas by type with sankalpa details; share or print |

## Offline first

Everything is written to the phone first (SQLite on Android, localStorage in a browser) and shown from there, so the app works with no network. Entries wait as "not sent" and are pushed when the network returns, when the app is reopened, every minute while it is open, and on pull-to-refresh. Each push answer gives bookings their final receipt number. Entries the server refuses stay on the phone, marked with the reason. The rules are the backend's: see [docs/architecture/ledger-and-sync-design.md](../docs/architecture/ledger-and-sync-design.md).

```
src/app/
  core/
    models.ts          stored rows and API shapes
    ledger.ts          register, positions, priest list: the server's maths, run on the phone
    sync.ts            building pushes, applying answers and pulls (pure functions)
    ledger.service.ts  the active yatra's books, recording, the sync loop
    api.ts             API client
    store/             LocalStore: SqliteStore (Android), BrowserStore (browser, tests)
    receipt.ts         WhatsApp receipt text and sharing
  pages/               the five screens
android/app/src/main/java/app/mantralayayatra/db/   the SQLite bridge (from Money Trail)
```

## Run it

In a browser, with the API running (see [backend/README.md](../backend/README.md)):

```
npm install
npm start            # http://localhost:4200
```

On the Set up screen leave the server as `http://localhost:5180` and enter any name and email. Sign-in uses the API's Development header for now.

On a phone (Android Studio and a USB-connected phone):

```
npm run android:run
```

Use your laptop's Wi-Fi address as the server (e.g. `http://192.168.1.20:5180`), and start the API with `--urls http://0.0.0.0:5180` so the phone can reach it.

## Tests

`npm test` (watch) or `npm run test:ci` (once, headless). CI runs these, builds the web app and a debug APK on every pull request, and publishes a signed release APK on every merge: `.github/workflows/app.yml`, explained in [docs/guides/build-pipeline.md](../docs/guides/build-pipeline.md).

## Not built yet

- Entra External ID sign-in (the app sends the Development header today)
- Pilgrim register (search a pilgrim instead of typing the name), expenses, cash wallets
