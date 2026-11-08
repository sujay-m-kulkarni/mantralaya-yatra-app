# Ledger and sync design

## The books are append-only

Every money event is a ledger entry: a **booking** (a devotee's seva and what it costs), a **payment** against a booking (cash, UPI or bank), or a **reversal** that cancels one booking or payment. Once the server accepts an entry it is never edited or deleted.

- A wrong amount: the accountant reverses the booking and the volunteer books it again.
- Cash entered as UPI: the accountant reverses the payment and it is recorded again with the right mode.
- Only the accountant can reverse, each entry at most once, and a reversal cannot itself be reversed.
- A reversed booking owes nothing more; money already taken for it shows as **refund due** until handed back.

This gives the committee a full trail: who took the money, on which phone, when, and who cancelled what and why.

## Ids and idempotency

Phones make each entry's id (a GUID) when it is recorded. Pushing the same entry again returns `duplicate` with the same sequence and receipt number. Pushing an existing id with different details is rejected: entries cannot be edited.

## Receipt numbers

Two phones booking offline cannot agree on the next number, so there are two:

| | Made by | Example | When |
|---|---|---|---|
| Draft | The phone | `SRV-D-RAM-0007` | Shown on the booking at once, even offline |
| Final | The server | `SRV-0033` | Issued when the booking syncs; the phone replaces the draft |

Final numbers run per seva per yatra, without gaps or repeats, because they are issued inside the yatra's lock from `receipt_counter`. Both numbers are stored, so a devotee holding a draft receipt can be found.

## Daily limits

A seva may have a daily limit (for example one Hastodaka a day). The phone warns when the limit is reached, using what it has pulled. If two phones offline both book the last slot, the server accepts both (the money has already been taken) and flags the later one `needsReview` with a reason, and the push result carries the warning `daily_limit_exceeded`. A reversed booking frees its slot.

## Push

`POST /yatras/{id}/sync/push` carries bookings, payments and reversals from one phone. They are applied in that order, one transaction under the yatra's lock, each saved before the next so a payment can refer to a booking in the same push. Each entry gets its own result (`applied`, `duplicate` or `rejected`); a rejected entry does not stop the rest.

```mermaid
sequenceDiagram
  participant P as Volunteer's phone
  participant A as API
  participant D as SQL Server
  P->>P: Record booking + payment offline, print draft receipt
  P->>A: push {bookings, payments}
  A->>D: begin; sp_getapplock yatra:{id}
  loop each entry
    A->>D: duplicate? validate; next sync_seq; next receipt number
    A->>D: insert, save
  end
  A->>D: commit
  A-->>P: results: applied + final receipt numbers, warnings
  P->>P: Replace drafts with final numbers
  P->>A: pull ?after=cursor
  A-->>P: other phones' entries and seva changes
```

Checks on a booking: known seva code, seva day within the yatra, devotee name, draft number, sankalpa when the seva needs it, amount between ₹0.01 and ₹1 crore, recorded time not more than a day ahead of the server. An amount different from the seva's set rate is accepted with the warning `amount_differs_from_rate` (devotees may give more).

Checks on a payment: an accepted, unreversed booking; mode cash, upi or bank; not more than what is still due.

## Pull

`GET /yatras/{id}/sync/pull?after=<cursor>` returns seva types and entries from every member's phone with a sequence above the cursor, lowest first, in pages of up to 500. `nextAfter` is the next cursor; `hasMore` says whether to call again. A new phone pulls from 0 to get everything.

Because pushes hold the yatra lock until commit and take sequence numbers inside it, rows become visible in sequence order, so a cursor never skips a row that was still being written.

## Which day money belongs to

The register shows two different days on purpose:

- **Lines and seva counts** are the sevas performed that day (`sevaDate`), for the priest and the slot limits.
- **Cash, UPI and bank totals** are money recorded that day in IST (`recordedAt`), for the cash box, including advances for later sevas.

The yatra stores its UTC offset (+05:30) so the day boundary is midnight in India, not UTC.
