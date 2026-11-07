using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Application.Common;
using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;

namespace MantralayaYatra.Application.LedgerSync;

/// <summary>
/// Returns seva types and ledger entries written after the phone's cursor, from every member's phone.
/// A pull with no cursor returns everything, which is how a new volunteer's phone gets the day's register.
/// </summary>
public sealed class PullLedgerChanges
{
    public const int MaxLimit = 500;

    private readonly ILedgerStore _store;

    public PullLedgerChanges(ILedgerStore store)
    {
        _store = store;
    }

    public async Task<Result<LedgerPullResponse>> HandleAsync(long? after, int? limit, CancellationToken ct)
    {
        var cursor = after ?? 0;
        if (cursor < 0)
        {
            return Error.Validation("after_invalid", "after cannot be negative.");
        }

        var take = limit ?? MaxLimit;
        if (take is < 1 or > MaxLimit)
        {
            return Error.Validation("limit_invalid", $"limit must be between 1 and {MaxLimit}.");
        }

        // One extra row tells whether another page exists.
        var rows = await _store.ReadChangesAfterAsync(cursor, take + 1, ct);
        var codes = (await _store.ListSevaTypesAsync(ct)).ToDictionary(s => s.Id, s => s.Code);

        var page = rows.Take(take).Select(row => row switch
        {
            SevaBooking b => new PulledChange(EntryKinds.Booking, b.ServerSeq, Booking: b.ToOut(codes[b.SevaTypeId])),
            SevaPayment p => new PulledChange(EntryKinds.Payment, p.ServerSeq, Payment: p.ToOut()),
            Reversal r => new PulledChange(EntryKinds.Reversal, r.ServerSeq, Reversal: r.ToOut()),
            SevaType s => new PulledChange(EntryKinds.SevaType, s.ServerSeq, SevaType: s.ToOut()),
            _ => throw new InvalidOperationException($"No pull mapping for {row.GetType().Name}."),
        }).ToList();
        var nextAfter = page.Count > 0 ? page[^1].Seq : cursor;

        return new LedgerPullResponse(page, nextAfter, rows.Count > take);
    }
}
