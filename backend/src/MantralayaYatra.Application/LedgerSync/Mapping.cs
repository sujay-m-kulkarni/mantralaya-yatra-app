using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;

namespace MantralayaYatra.Application.LedgerSync;

internal static class Mapping
{
    public static string ToWire(this EntryKind kind) => kind switch
    {
        EntryKind.Booking => EntryKinds.Booking,
        EntryKind.Payment => EntryKinds.Payment,
        EntryKind.Reversal => EntryKinds.Reversal,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    public static SankalpaDto? ToDto(this Sankalpa? sankalpa) =>
        sankalpa is null ? null : new SankalpaDto(sankalpa.OnBehalfOf, sankalpa.Gotra, sankalpa.Nakshatra, sankalpa.Rashi, sankalpa.Occasion);

    public static BookingOut ToOut(this SevaBooking b, string sevaCode) => new(
        b.Id, sevaCode, b.SevaDate, b.DevoteeName, b.DevoteePhone, b.Sankalpa.ToDto(), b.AmountPaise,
        b.DraftReceiptNo, b.ReceiptNo, b.NeedsReview, b.ReviewReason, b.RecordedBy, b.RecordedAt);

    public static PaymentOut ToOut(this SevaPayment p) => new(
        p.Id, p.BookingId, p.AmountPaise, p.Mode.ToWire(), p.Reference, p.RecordedBy, p.RecordedAt);

    public static ReversalOut ToOut(this Reversal r) => new(
        r.Id, r.ReversedEntryId, r.ReversedKind.ToWire(), r.Reason, r.RecordedBy, r.RecordedAt);

    public static SevaTypeOut ToOut(this SevaType s) => new(
        s.Id, s.Code, s.Name, s.RatePaise, s.DailyLimit, s.RequiresSankalpa, s.IsActive, s.SortOrder);
}
