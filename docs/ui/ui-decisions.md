# UI decisions

## Screens designed

The mockups are on the "Seva Register" design canvas in Claude (private to the owner): https://claude.ai/artifact/RRaB2NEcFS7qusGcs4sYxZ

| Screen | What it shows | API it uses |
|---|---|---|
| Seva Register (daily list) | Day switcher; collected today (cash, UPI, pending); seva filter chips; slot usage per seva with "Full"; bookings with receipt, devotee, sankalpa, amount and payment mode; "Priest list" button; "Book seva" button | `GET /register`, `GET /register/priest-list`, local SQLite between syncs |
| Book a seva | Seva choice (full ones disabled), pilgrim search or walk-in, sankalpa fields, amount, cash / UPI / bank with UTR, collected by, "Save & send receipt on WhatsApp" | Writes locally, then `POST /sync/push` |

Rates, names and limits in the mockups are sample data, not the group's real figures.

## Visual direction

- Warm saffron accent (`#B45309`) on an off-white ground, dark summary card for the day's money.
- Inter for text, Space Grotesk for headings.
- Touch targets at least 44 px; payment modes told apart by text and colour lightness, not hue alone.

## To decide

- Receipt layout for WhatsApp (image or PDF).
- Kannada / Telugu / Hindi labels for volunteers.
- Whether the app follows Money Trail's dark theme or keeps this light one.
