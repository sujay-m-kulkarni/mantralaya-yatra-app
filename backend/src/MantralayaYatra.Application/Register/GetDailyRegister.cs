using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Application.Common;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Domain.Ledger;

namespace MantralayaYatra.Application.Register;

/// <summary>
/// The Seva Register screen for one day: collections by mode, seva counts against their limits,
/// and every booking with what is paid and pending.
/// </summary>
/// <remarks>
/// Two different days meet here on purpose. The lines and seva counts are the sevas performed that day
/// (what the priest does). The cash, UPI and bank totals are money recorded that day (what the cash box
/// should hold), which includes advance payments for later sevas.
/// </remarks>
public sealed class GetDailyRegister
{
    private readonly ILedgerStore _store;
    private readonly IYatraDirectory _directory;
    private readonly IYatraContext _yatra;

    public GetDailyRegister(ILedgerStore store, IYatraDirectory directory, IYatraContext yatra)
    {
        _store = store;
        _directory = directory;
        _yatra = yatra;
    }

    public async Task<Result<DailyRegisterResponse>> HandleAsync(DateOnly date, CancellationToken ct)
    {
        var yatra = await _store.GetYatraAsync(ct);
        var sevaTypes = (await _store.ListSevaTypesAsync(ct)).OrderBy(s => s.SortOrder).ThenBy(s => s.Code).ToList();
        var typesById = sevaTypes.ToDictionary(s => s.Id);
        var names = (await _directory.ListMembersAsync(_yatra.YatraId, ct))
            .Where(m => m.UserId is not null)
            .ToDictionary(m => m.UserId!.Value, m => m.DisplayName);

        var day = await _store.ReadBookingsForDayAsync(date, ct);
        var positions = day.Bookings
            .Select(b => BookingPosition.Of(b, day.Payments, day.Reversals))
            .OrderBy(p => typesById[p.Booking.SevaTypeId].SortOrder)
            .ThenBy(p => p.Booking.ServerSeq)
            .ToList();

        var lines = positions.Select(p =>
        {
            var type = typesById[p.Booking.SevaTypeId];
            return new RegisterLine(
                p.Booking.Id,
                type.Code,
                type.Name,
                p.Booking.ReceiptNo ?? p.Booking.DraftReceiptNo,
                p.Booking.DevoteeName,
                p.Booking.Sankalpa.ToDto(),
                p.Booking.AmountPaise,
                p.PaidPaise,
                p.PendingPaise,
                p.ActivePayments.Select(x => x.Mode.ToWire()).Distinct().ToList(),
                p.IsReversed,
                p.RefundDuePaise,
                p.Booking.NeedsReview,
                p.Booking.ReviewReason,
                names.GetValueOrDefault(p.Booking.RecordedBy, "Unknown member"));
        }).ToList();

        var active = positions.Where(p => !p.IsReversed).ToList();
        // Inactive sevas only appear on days they still have bookings.
        var sevas = sevaTypes
            .Select(type => (Type: type, Mine: active.Where(p => p.Booking.SevaTypeId == type.Id).ToList()))
            .Where(x => x.Type.IsActive || x.Mine.Count > 0)
            .Select(x => new SevaDaySummary(
                x.Type.Code,
                x.Type.Name,
                x.Mine.Count,
                x.Mine.Sum(p => p.Booking.AmountPaise),
                x.Type.DailyLimit,
                x.Type.IsFullWith(x.Mine.Count)))
            .ToList();

        var (from, to) = yatra.UtcBoundsOf(date);
        var (recorded, recordedReversals) = await _store.ReadPaymentsRecordedAsync(from, to, ct);
        var reversedIds = recordedReversals.Select(r => r.ReversedEntryId).ToHashSet();
        var collected = recorded.Where(p => !reversedIds.Contains(p.Id)).ToList();
        long SumOf(PaymentMode mode) => collected.Where(p => p.Mode == mode).Sum(p => p.AmountPaise);

        var totals = new RegisterTotals(
            CashPaise: SumOf(PaymentMode.Cash),
            UpiPaise: SumOf(PaymentMode.Upi),
            BankPaise: SumOf(PaymentMode.Bank),
            CollectedPaise: collected.Sum(p => p.AmountPaise),
            PendingPaise: positions.Sum(p => p.PendingPaise),
            RefundDuePaise: positions.Sum(p => p.RefundDuePaise),
            BookingCount: active.Count);

        return new DailyRegisterResponse(date, yatra.DayNumber(date), totals, sevas, lines);
    }
}
