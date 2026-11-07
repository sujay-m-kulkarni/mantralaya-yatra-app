namespace MantralayaYatra.Application.LedgerSync;

// Wire shapes for /api/v1/yatras/{yatraId}/sync. See docs/architecture/ledger-and-sync-design.md.
// Money is integer paise everywhere, as in Money Trail.

public static class EntryKinds
{
    public const string Booking = "booking";
    public const string Payment = "payment";
    public const string Reversal = "reversal";
    public const string SevaType = "sevaType";
}

public static class EntryStatus
{
    public const string Applied = "applied";
    public const string Duplicate = "duplicate";
    public const string Rejected = "rejected";
}

public static class EntryWarnings
{
    /// <summary>The booking was accepted but takes the seva over its daily limit; it is flagged for the accountant.</summary>
    public const string DailyLimitExceeded = "daily_limit_exceeded";

    /// <summary>The amount is not the seva's set rate. Accepted: devotees may give more.</summary>
    public const string AmountDiffersFromRate = "amount_differs_from_rate";
}

/// <param name="DeviceId">The phone's install id.</param>
/// <param name="Bookings">Applied first, so a payment in the same push can refer to a booking in it.</param>
/// <param name="Payments">Applied after the bookings.</param>
/// <param name="Reversals">Applied last. Only the accountant's are accepted.</param>
public sealed record LedgerPushRequest(
    Guid DeviceId,
    IReadOnlyList<BookingIn>? Bookings,
    IReadOnlyList<PaymentIn>? Payments,
    IReadOnlyList<ReversalIn>? Reversals);

public sealed record SankalpaDto(string? OnBehalfOf, string? Gotra, string? Nakshatra, string? Rashi, string? Occasion);

/// <param name="Id">Made on the phone; the idempotency key. A retried push with the same id is a duplicate.</param>
/// <param name="SevaCode">The seva's code, e.g. SRV.</param>
/// <param name="DraftReceiptNo">The number the phone printed before sync.</param>
public sealed record BookingIn(
    Guid Id,
    string? SevaCode,
    DateOnly SevaDate,
    string? DevoteeName,
    string? DevoteePhone,
    SankalpaDto? Sankalpa,
    long AmountPaise,
    string? DraftReceiptNo,
    DateTimeOffset RecordedAt);

/// <param name="Mode">cash, upi or bank.</param>
public sealed record PaymentIn(
    Guid Id,
    Guid BookingId,
    long AmountPaise,
    string? Mode,
    string? Reference,
    DateTimeOffset RecordedAt);

/// <param name="EntryId">The booking or payment to cancel.</param>
public sealed record ReversalIn(
    Guid Id,
    Guid EntryId,
    string? Reason,
    DateTimeOffset RecordedAt);

/// <param name="Kind">One of <see cref="EntryKinds"/>.</param>
/// <param name="Status">One of <see cref="EntryStatus"/>.</param>
/// <param name="Seq">The entry's sequence number (applied, or duplicate of an accepted entry).</param>
/// <param name="ReceiptNo">For a booking: the final receipt number to replace the draft on the phone.</param>
/// <param name="Warnings">Accepted, but worth showing; see <see cref="EntryWarnings"/>.</param>
/// <param name="Error">Why a rejected entry was refused.</param>
public sealed record EntryResult(
    Guid Id,
    string Kind,
    string Status,
    long? Seq = null,
    string? ReceiptNo = null,
    IReadOnlyList<string>? Warnings = null,
    string? Error = null);

/// <param name="HighestSeq">The highest sequence number this push wrote; 0 when it wrote nothing.</param>
public sealed record LedgerPushResponse(IReadOnlyList<EntryResult> Results, long HighestSeq);

public sealed record BookingOut(
    Guid Id,
    string SevaCode,
    DateOnly SevaDate,
    string DevoteeName,
    string? DevoteePhone,
    SankalpaDto? Sankalpa,
    long AmountPaise,
    string DraftReceiptNo,
    string? ReceiptNo,
    bool NeedsReview,
    string? ReviewReason,
    Guid RecordedBy,
    DateTimeOffset RecordedAt);

public sealed record PaymentOut(
    Guid Id,
    Guid BookingId,
    long AmountPaise,
    string Mode,
    string? Reference,
    Guid RecordedBy,
    DateTimeOffset RecordedAt);

public sealed record ReversalOut(
    Guid Id,
    Guid EntryId,
    string EntryKind,
    string Reason,
    Guid RecordedBy,
    DateTimeOffset RecordedAt);

public sealed record SevaTypeOut(
    Guid Id,
    string Code,
    string Name,
    long? RatePaise,
    int? DailyLimit,
    bool RequiresSankalpa,
    bool IsActive,
    int SortOrder);

/// <summary>One changed row. Exactly one of the payload fields is set, matching <see cref="Kind"/>.</summary>
public sealed record PulledChange(
    string Kind,
    long Seq,
    BookingOut? Booking = null,
    PaymentOut? Payment = null,
    ReversalOut? Reversal = null,
    SevaTypeOut? SevaType = null);

/// <param name="NextAfter">Pass as <c>after</c> on the next pull. Equal to the request's <c>after</c> when nothing came back.</param>
public sealed record LedgerPullResponse(IReadOnlyList<PulledChange> Changes, long NextAfter, bool HasMore);
