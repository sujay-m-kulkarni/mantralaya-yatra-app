using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Application.Common;
using MantralayaYatra.Domain.Ledger;

namespace MantralayaYatra.Application.Register;

/// <summary>
/// The list the priest reads from each morning: the day's sevas grouped by type, with sankalpa details.
/// Reversed bookings are left out; unpaid ones stay in, since the seva is still to be performed.
/// </summary>
public sealed class GetPriestList
{
    private readonly ILedgerStore _store;

    public GetPriestList(ILedgerStore store)
    {
        _store = store;
    }

    public async Task<Result<PriestListResponse>> HandleAsync(DateOnly date, CancellationToken ct)
    {
        var yatra = await _store.GetYatraAsync(ct);
        var sevaTypes = (await _store.ListSevaTypesAsync(ct)).OrderBy(s => s.SortOrder).ThenBy(s => s.Code).ToList();
        var day = await _store.ReadBookingsForDayAsync(date, ct);
        var active = day.Bookings
            .Select(b => BookingPosition.Of(b, day.Payments, day.Reversals))
            .Where(p => !p.IsReversed)
            .Select(p => p.Booking)
            .ToList();

        var groups = sevaTypes
            .Select(type => new PriestListSeva(
                type.Code,
                type.Name,
                active
                    .Where(b => b.SevaTypeId == type.Id)
                    .OrderBy(b => b.ServerSeq)
                    .Select(b => new PriestListEntry(
                        b.ReceiptNo ?? b.DraftReceiptNo,
                        b.DevoteeName,
                        b.Sankalpa?.OnBehalfOf,
                        b.Sankalpa?.Gotra,
                        b.Sankalpa?.Nakshatra,
                        b.Sankalpa?.Rashi,
                        b.Sankalpa?.Occasion))
                    .ToList()))
            .Where(g => g.Entries.Count > 0)
            .ToList();

        return new PriestListResponse(date, yatra.DayNumber(date), yatra.Name, groups);
    }
}
