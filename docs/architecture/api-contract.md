# API contract

Base path `/api/v1`. JSON with camelCase names. Dates are `yyyy-MM-dd`; times are ISO 8601 with offset. Money is integer paise (`100100` = ₹1,001). Every response carries `X-Contract-Version: 1`.

All endpoints need a bearer token from Entra External ID (in Development, the `X-Dev-User` header instead). Routes under `/yatras/{yatraId}` also need membership of that yatra; a non-member gets 404.

## Endpoints

| Method and path | Role | What it does |
|---|---|---|
| `GET /yatras` | any signed-in | Your yatras and your role in each. Claims invitations sent to your email |
| `POST /yatras` | any signed-in | Creates a yatra; you become its accountant; the four sevas are seeded without rates |
| `GET /yatras/{id}/members` | Viewer | Members, roles, whether they have signed in |
| `POST /yatras/{id}/members` | Accounts | Adds a member by email |
| `GET /yatras/{id}/seva-types` | Viewer | The yatra's sevas |
| `PUT /yatras/{id}/seva-types/{code}` | Accounts | Creates or updates a seva: name, rate, daily limit, sankalpa, active, order |
| `POST /yatras/{id}/sync/push` | Volunteer | Bookings, payments, reversals from one phone |
| `GET /yatras/{id}/sync/pull?after=&limit=` | Viewer | Changes after the cursor |
| `GET /yatras/{id}/register?date=` | Viewer | One day's register |
| `GET /yatras/{id}/register/priest-list?date=` | Viewer | The priest's list for one day |

## Push

```json
{
  "deviceId": "6f1c2a52-…",
  "bookings": [{
    "id": "0b8d1f7a-…", "sevaCode": "SRV", "sevaDate": "2026-12-04",
    "devoteeName": "Venkatesh Kulkarni", "devoteePhone": null,
    "sankalpa": { "onBehalfOf": "Venkatesh Kulkarni & family", "gotra": "Vasishta", "nakshatra": "Ashwini", "rashi": "Mesha", "occasion": null },
    "amountPaise": 100100, "draftReceiptNo": "SRV-D-RAM-0001", "recordedAt": "2026-12-01T09:15:00+05:30"
  }],
  "payments": [{ "id": "2c4e6a8b-…", "bookingId": "0b8d1f7a-…", "amountPaise": 100100, "mode": "upi", "reference": "412345", "recordedAt": "2026-12-01T09:16:00+05:30" }],
  "reversals": [{ "id": "…", "entryId": "…", "reason": "Booked twice", "recordedAt": "…" }]
}
```

Response:

```json
{
  "results": [
    { "id": "0b8d1f7a-…", "kind": "booking", "status": "applied", "seq": 41, "receiptNo": "SRV-0033", "warnings": null, "error": null },
    { "id": "2c4e6a8b-…", "kind": "payment", "status": "applied", "seq": 42 }
  ],
  "highestSeq": 42
}
```

`status` is `applied`, `duplicate` or `rejected` (with `error`). Warnings: `daily_limit_exceeded`, `amount_differs_from_rate`. At most 300 entries per push.

## Pull

```json
{
  "changes": [
    { "kind": "sevaType", "seq": 3, "sevaType": { "id": "…", "code": "HST", "name": "Hastodaka", "ratePaise": null, "dailyLimit": 1, "requiresSankalpa": true, "isActive": true, "sortOrder": 3 } },
    { "kind": "booking", "seq": 41, "booking": { "…": "as pushed, plus receiptNo, needsReview, reviewReason, recordedBy" } },
    { "kind": "payment", "seq": 42, "payment": { "…": "…" } },
    { "kind": "reversal", "seq": 50, "reversal": { "id": "…", "entryId": "…", "entryKind": "booking", "reason": "…" } }
  ],
  "nextAfter": 50,
  "hasMore": false
}
```

## Register

`GET /yatras/{id}/register?date=2026-12-04` returns `date`, `dayNumber`, `totals` (`cashPaise`, `upiPaise`, `bankPaise`, `collectedPaise`, `pendingPaise`, `refundDuePaise`, `bookingCount`), `sevas` (per seva: count, amount, daily limit, full) and `lines` (per booking: receipt, devotee, sankalpa, amount, paid, pending, modes, reversed, refund due, needs review, recorded by).

## Status codes

| Code | When |
|---|---|
| 200 | Success. A push with some rejected entries is still 200; read each result |
| 401 | No or invalid token |
| 403 | Your role does not allow it (`code: forbidden`) |
| 404 | No such yatra, or you are not a member |
| 409 | Conflict, e.g. a member with that email already exists |
| 413 | Push too large |
| 422 | Validation failed; `code` says which rule |
| 429 | Rate limit (120 a minute per user); see `Retry-After` |

Errors are RFC 7807 problem details with a stable `code` extension.
