using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Application.Common;
using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.LedgerSync;

/// <summary>
/// Accepts a batch of bookings, payments and reversals from one phone, in a single transaction under the
/// yatra's lock. Each entry is answered on its own: a rejected entry does not stop the rest of the batch.
/// Entries are append-only, so there is no conflict policy: an id the server already holds is a duplicate
/// (same content) or a mistake (different content), never an edit.
/// </summary>
public sealed class PushLedgerEntries
{
    public const int MaxEntries = 300;

    /// <summary>₹1 crore. Anything larger is a typing slip, not a seva.</summary>
    public const long MaxAmountPaise = 1_00_00_000_00;

    /// <summary>Phone clocks drift; an entry dated further ahead than this is refused.</summary>
    public static readonly TimeSpan MaxClockAhead = TimeSpan.FromDays(1);

    private readonly ILedgerStore _store;
    private readonly ICurrentUser _user;
    private readonly IYatraContext _yatra;
    private readonly TimeProvider _time;

    public PushLedgerEntries(ILedgerStore store, ICurrentUser user, IYatraContext yatra, TimeProvider time)
    {
        _store = store;
        _user = user;
        _yatra = yatra;
        _time = time;
    }

    public async Task<Result<LedgerPushResponse>> HandleAsync(LedgerPushRequest request, CancellationToken ct)
    {
        if (!_yatra.Role.Allows(MemberRole.Volunteer))
        {
            return Error.Forbidden("Viewers cannot record entries.");
        }

        if (request.DeviceId == Guid.Empty)
        {
            return Error.Validation("device_missing", "deviceId is required.");
        }

        var bookings = request.Bookings ?? [];
        var payments = request.Payments ?? [];
        var reversals = request.Reversals ?? [];
        if (bookings.Count + payments.Count + reversals.Count > MaxEntries)
        {
            return Error.TooLarge("batch_too_large", $"A push carries at most {MaxEntries} entries.");
        }

        var now = _time.GetUtcNow();
        return await _store.InYatraTransactionAsync(async token =>
        {
            var batch = new Batch(request.DeviceId, now);
            var yatra = await _store.GetYatraAsync(token);

            foreach (var booking in bookings)
            {
                batch.Add(await ApplyBookingAsync(booking, yatra, batch, token));
            }

            foreach (var payment in payments)
            {
                batch.Add(await ApplyPaymentAsync(payment, batch, token));
            }

            foreach (var reversal in reversals)
            {
                batch.Add(await ApplyReversalAsync(reversal, batch, token));
            }

            return new LedgerPushResponse(batch.Results, batch.HighestSeq);
        }, ct);
    }

    private async Task<EntryResult> ApplyBookingAsync(BookingIn input, Yatra yatra, Batch batch, CancellationToken ct)
    {
        const string kind = EntryKinds.Booking;
        if (input.Id == Guid.Empty)
        {
            return Rejected(input.Id, kind, "id is required.");
        }

        var sevaType = input.SevaCode is null ? null : await _store.FindSevaTypeByCodeAsync(input.SevaCode, ct);

        var existing = await _store.FindEntryAsync(input.Id, ct);
        if (existing is not null)
        {
            return existing is SevaBooking stored && sevaType is not null && SameBooking(stored, input, sevaType)
                ? new EntryResult(input.Id, kind, EntryStatus.Duplicate, stored.ServerSeq, stored.ReceiptNo)
                : Immutable(input.Id, kind);
        }

        if (sevaType is null)
        {
            return Rejected(input.Id, kind, $"Unknown seva code \"{input.SevaCode}\".");
        }

        // Bookings recorded before the seva was deleted (offline, sent later) are still accepted.
        if (sevaType.DeletedAt is DateTimeOffset deletedAt && input.RecordedAt >= deletedAt)
        {
            return Rejected(input.Id, kind, $"{sevaType.Name} was deleted; it cannot be booked.");
        }

        if (!yatra.Covers(input.SevaDate))
        {
            return Rejected(input.Id, kind, $"sevaDate must fall between {yatra.StartsOn:yyyy-MM-dd} and {yatra.EndsOn:yyyy-MM-dd}.");
        }

        var name = Text.Clean(input.DevoteeName);
        if (name is null)
        {
            return Rejected(input.Id, kind, "devoteeName is required.");
        }

        var phone = Text.Clean(input.DevoteePhone);
        var draft = Text.Clean(input.DraftReceiptNo);
        var sankalpa = Text.Clean(input.Sankalpa);
        var problem =
            Text.TooLong(name, SevaBooking.MaxNameLength, "devoteeName")
            ?? Text.TooLong(phone, SevaBooking.MaxPhoneLength, "devoteePhone")
            ?? (draft is null ? "draftReceiptNo is required." : Text.TooLong(draft, SevaBooking.MaxReceiptLength, "draftReceiptNo"))
            ?? Text.TooLong(sankalpa, Sankalpa.MaxFieldLength)
            ?? CheckAmount(input.AmountPaise)
            ?? CheckRecordedAt(input.RecordedAt, batch.Now);
        if (problem is not null)
        {
            return Rejected(input.Id, kind, problem);
        }

        if (sevaType.RequiresSankalpa && sankalpa is null)
        {
            return Rejected(input.Id, kind, $"{sevaType.Name} needs sankalpa details for the priest.");
        }

        var warnings = new List<string>();
        if (sevaType.RatePaise is long rate && rate != input.AmountPaise)
        {
            warnings.Add(EntryWarnings.AmountDiffersFromRate);
        }

        var bookedThatDay = await _store.CountActiveBookingsAsync(sevaType.Id, input.SevaDate, ct);
        var overLimit = sevaType.IsFullWith(bookedThatDay);
        if (overLimit)
        {
            // Refusing would leave cash in a volunteer's hand with no record. Accept it and flag it instead.
            warnings.Add(EntryWarnings.DailyLimitExceeded);
        }

        var booking = new SevaBooking
        {
            Id = input.Id,
            SevaTypeId = sevaType.Id,
            SevaDate = input.SevaDate,
            DevoteeName = name,
            DevoteePhone = phone,
            Sankalpa = sankalpa,
            AmountPaise = input.AmountPaise,
            DraftReceiptNo = draft!,
            ReceiptNo = ReceiptNumber.Format(sevaType.Code, await _store.NextReceiptNumberAsync(sevaType.Id, ct)),
            NeedsReview = overLimit,
            ReviewReason = overLimit ? $"Over the daily limit of {sevaType.DailyLimit} for {sevaType.Name}." : null,
        };

        await StampAndSaveAsync(booking, input.RecordedAt, batch, ct);
        return new EntryResult(input.Id, kind, EntryStatus.Applied, booking.ServerSeq, booking.ReceiptNo, warnings.Count > 0 ? warnings : null);
    }

    private async Task<EntryResult> ApplyPaymentAsync(PaymentIn input, Batch batch, CancellationToken ct)
    {
        const string kind = EntryKinds.Payment;
        if (input.Id == Guid.Empty)
        {
            return Rejected(input.Id, kind, "id is required.");
        }

        var parsedMode = PaymentModes.TryParse(input.Mode, out var mode);

        var existing = await _store.FindEntryAsync(input.Id, ct);
        if (existing is not null)
        {
            return existing is SevaPayment stored && parsedMode
                   && stored.BookingId == input.BookingId && stored.AmountPaise == input.AmountPaise && stored.Mode == mode
                ? new EntryResult(input.Id, kind, EntryStatus.Duplicate, stored.ServerSeq)
                : Immutable(input.Id, kind);
        }

        if (!parsedMode)
        {
            return Rejected(input.Id, kind, $"Unknown payment mode \"{input.Mode}\"; expected cash, upi or bank.");
        }

        var reference = Text.Clean(input.Reference);
        var problem =
            Text.TooLong(reference, SevaPayment.MaxReferenceLength, "reference")
            ?? CheckAmount(input.AmountPaise)
            ?? CheckRecordedAt(input.RecordedAt, batch.Now);
        if (problem is not null)
        {
            return Rejected(input.Id, kind, problem);
        }

        if (await _store.FindEntryAsync(input.BookingId, ct) is not SevaBooking booking)
        {
            return Rejected(input.Id, kind, "bookingId does not match an accepted booking.");
        }

        if (await _store.FindReversalOfAsync(booking.Id, ct) is not null)
        {
            return Rejected(input.Id, kind, "The booking has been reversed.");
        }

        var paid = await PaidSoFarAsync(booking.Id, ct);
        var pending = booking.AmountPaise - paid;
        if (input.AmountPaise > pending)
        {
            return Rejected(input.Id, kind, $"The payment is more than the {pending} paise still due on the booking.");
        }

        var payment = new SevaPayment
        {
            Id = input.Id,
            BookingId = booking.Id,
            AmountPaise = input.AmountPaise,
            Mode = mode,
            Reference = reference,
        };

        await StampAndSaveAsync(payment, input.RecordedAt, batch, ct);
        return new EntryResult(input.Id, kind, EntryStatus.Applied, payment.ServerSeq);
    }

    private async Task<EntryResult> ApplyReversalAsync(ReversalIn input, Batch batch, CancellationToken ct)
    {
        const string kind = EntryKinds.Reversal;
        if (input.Id == Guid.Empty)
        {
            return Rejected(input.Id, kind, "id is required.");
        }

        var existing = await _store.FindEntryAsync(input.Id, ct);
        if (existing is not null)
        {
            return existing is Reversal stored && stored.ReversedEntryId == input.EntryId
                ? new EntryResult(input.Id, kind, EntryStatus.Duplicate, stored.ServerSeq)
                : Immutable(input.Id, kind);
        }

        if (!_yatra.Role.Allows(MemberRole.Accounts))
        {
            return Rejected(input.Id, kind, "Only the accountant can reverse an entry.");
        }

        var reason = Text.Clean(input.Reason);
        var problem =
            (reason is null ? "reason is required." : Text.TooLong(reason, Reversal.MaxReasonLength, "reason"))
            ?? CheckRecordedAt(input.RecordedAt, batch.Now);
        if (problem is not null)
        {
            return Rejected(input.Id, kind, problem);
        }

        var target = await _store.FindEntryAsync(input.EntryId, ct);
        if (target is null)
        {
            return Rejected(input.Id, kind, "entryId does not match an accepted entry.");
        }

        if (target is Reversal)
        {
            return Rejected(input.Id, kind, "A reversal cannot be reversed; record the entry again instead.");
        }

        if (await _store.FindReversalOfAsync(target.Id, ct) is not null)
        {
            return Rejected(input.Id, kind, "The entry has already been reversed.");
        }

        var reversal = new Reversal
        {
            Id = input.Id,
            ReversedEntryId = target.Id,
            ReversedKind = target.Kind,
            Reason = reason!,
        };

        await StampAndSaveAsync(reversal, input.RecordedAt, batch, ct);
        return new EntryResult(input.Id, kind, EntryStatus.Applied, reversal.ServerSeq);
    }

    private async Task<long> PaidSoFarAsync(Guid bookingId, CancellationToken ct)
    {
        long paid = 0;
        foreach (var payment in await _store.ListPaymentsForBookingAsync(bookingId, ct))
        {
            if (await _store.FindReversalOfAsync(payment.Id, ct) is null)
            {
                paid += payment.AmountPaise;
            }
        }

        return paid;
    }

    private async Task StampAndSaveAsync(LedgerEntry entry, DateTimeOffset recordedAt, Batch batch, CancellationToken ct)
    {
        entry.DeviceId = batch.DeviceId;
        entry.RecordedBy = _user.UserId;
        entry.RecordedAt = recordedAt;
        entry.ReceivedAt = batch.Now;
        entry.ServerSeq = await _store.NextSeqAsync(ct);
        _store.Add(entry);

        // Saved per entry so a later entry in the same batch (a payment for this booking) finds it.
        await _store.SaveChangesAsync(ct);
    }

    private static bool SameBooking(SevaBooking stored, BookingIn input, SevaType sevaType) =>
        stored.SevaTypeId == sevaType.Id
        && stored.SevaDate == input.SevaDate
        && stored.AmountPaise == input.AmountPaise
        && stored.DevoteeName == Text.Clean(input.DevoteeName)
        && stored.DraftReceiptNo == Text.Clean(input.DraftReceiptNo);

    private static string? CheckAmount(long amountPaise) =>
        amountPaise is <= 0 or > MaxAmountPaise ? $"amountPaise must be between 1 and {MaxAmountPaise}." : null;

    private static string? CheckRecordedAt(DateTimeOffset recordedAt, DateTimeOffset now) =>
        recordedAt == default ? "recordedAt is required."
        : recordedAt > now + MaxClockAhead ? "recordedAt is in the future; check the phone's clock."
        : null;

    private static EntryResult Rejected(Guid id, string kind, string reason) =>
        new(id, kind, EntryStatus.Rejected, Error: reason);

    private static EntryResult Immutable(Guid id, string kind) =>
        Rejected(id, kind, "An entry with this id was already accepted with different details. Entries cannot be edited; record a reversal and a new entry.");

    private sealed class Batch(Guid deviceId, DateTimeOffset now)
    {
        private readonly List<EntryResult> _results = [];

        public Guid DeviceId { get; } = deviceId;

        public DateTimeOffset Now { get; } = now;

        public IReadOnlyList<EntryResult> Results => _results;

        public long HighestSeq { get; private set; }

        public void Add(EntryResult result)
        {
            if (result is { Status: EntryStatus.Applied, Seq: long seq })
            {
                HighestSeq = Math.Max(HighestSeq, seq);
            }

            _results.Add(result);
        }
    }
}
