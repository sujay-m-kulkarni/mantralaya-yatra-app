namespace MantralayaYatra.Domain.Ledger;

/// <summary>Where one booking stands once its payments and any reversals are taken into account.</summary>
/// <param name="ActivePayments">Payments that have not been reversed.</param>
/// <param name="PaidPaise">Money actually held for this booking.</param>
/// <param name="PendingPaise">Still to collect. Zero for a reversed booking.</param>
/// <param name="RefundDuePaise">Money held for a reversed booking, to be returned to the devotee.</param>
public sealed record BookingPosition(
    SevaBooking Booking,
    bool IsReversed,
    IReadOnlyList<SevaPayment> ActivePayments,
    long PaidPaise,
    long PendingPaise,
    long RefundDuePaise)
{
    public bool IsFullyPaid => !IsReversed && PendingPaise == 0;

    /// <summary>
    /// Works out a booking's position. <paramref name="payments"/> and <paramref name="reversals"/> may hold
    /// entries for other bookings too; only this booking's are used.
    /// </summary>
    public static BookingPosition Of(SevaBooking booking, IEnumerable<SevaPayment> payments, IEnumerable<Reversal> reversals)
    {
        var reversed = reversals.Select(r => r.ReversedEntryId).ToHashSet();
        var active = payments
            .Where(p => p.BookingId == booking.Id && !reversed.Contains(p.Id))
            .OrderBy(p => p.ServerSeq)
            .ToList();
        var paid = active.Sum(p => p.AmountPaise);
        var isReversed = reversed.Contains(booking.Id);

        return new BookingPosition(
            booking,
            isReversed,
            active,
            paid,
            PendingPaise: isReversed ? 0 : Math.Max(0, booking.AmountPaise - paid),
            RefundDuePaise: isReversed ? paid : 0);
    }
}
