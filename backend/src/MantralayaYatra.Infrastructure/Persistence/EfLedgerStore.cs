using System.Data.Common;
using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Sync;
using MantralayaYatra.Domain.Yatras;
using Microsoft.EntityFrameworkCore;

namespace MantralayaYatra.Infrastructure.Persistence;

public sealed class EfLedgerStore : ILedgerStore
{
    private static readonly TimeSpan LockTimeout = TimeSpan.FromSeconds(15);

    private readonly YatraDbContext _db;
    private readonly IYatraContext _yatra;

    public EfLedgerStore(YatraDbContext db, IYatraContext yatra)
    {
        _db = db;
        _yatra = yatra;
    }

    public async Task<T> InYatraTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken ct)
    {
        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async token =>
        {
            // A retried attempt must not see rows tracked by the failed one.
            _db.ChangeTracker.Clear();
            await using var transaction = await _db.Database.BeginTransactionAsync(token);
            await AcquireYatraLockAsync(token);
            var result = await work(token);
            await _db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return result;
        }, ct);
    }

    public Task<Yatra> GetYatraAsync(CancellationToken ct) =>
        _db.Yatras.AsNoTracking().SingleAsync(y => y.Id == _yatra.YatraId, ct);

    public Task<long> NextSeqAsync(CancellationToken ct) => _db.NextSeqAsync(ct);

    public async Task<long> NextReceiptNumberAsync(Guid sevaTypeId, CancellationToken ct)
    {
        // Safe without further locking: every caller holds the yatra lock taken in InYatraTransactionAsync.
        var counter = await _db.ReceiptCounters.SingleOrDefaultAsync(c => c.SevaTypeId == sevaTypeId, ct);
        if (counter is null)
        {
            counter = new ReceiptCounter { YatraId = _yatra.YatraId, SevaTypeId = sevaTypeId };
            _db.ReceiptCounters.Add(counter);
        }

        counter.LastNumber++;
        return counter.LastNumber;
    }

    public async Task<IReadOnlyList<SevaType>> ListSevaTypesAsync(CancellationToken ct) =>
        await _db.SevaTypes.ToListAsync(ct);

    public Task<SevaType?> FindSevaTypeByCodeAsync(string code, CancellationToken ct) =>
        _db.SevaTypes.SingleOrDefaultAsync(s => s.Code == code, ct);

    public async Task<LedgerEntry?> FindEntryAsync(Guid id, CancellationToken ct) =>
        (LedgerEntry?)await _db.Bookings.SingleOrDefaultAsync(b => b.Id == id, ct)
        ?? (LedgerEntry?)await _db.Payments.SingleOrDefaultAsync(p => p.Id == id, ct)
        ?? await _db.Reversals.SingleOrDefaultAsync(r => r.Id == id, ct);

    public Task<Reversal?> FindReversalOfAsync(Guid entryId, CancellationToken ct) =>
        _db.Reversals.SingleOrDefaultAsync(r => r.ReversedEntryId == entryId, ct);

    public async Task<IReadOnlyList<SevaPayment>> ListPaymentsForBookingAsync(Guid bookingId, CancellationToken ct) =>
        await _db.Payments.Where(p => p.BookingId == bookingId).ToListAsync(ct);

    public Task<int> CountActiveBookingsAsync(Guid sevaTypeId, DateOnly sevaDate, CancellationToken ct) =>
        _db.Bookings
            .Where(b => b.SevaTypeId == sevaTypeId && b.SevaDate == sevaDate)
            .Where(b => !_db.Reversals.Any(r => r.ReversedEntryId == b.Id))
            .CountAsync(ct);

    public void Add(YatraRow row)
    {
        row.YatraId = _yatra.YatraId;
        _db.Add((object)row);
    }

    public Task SaveChangesAsync(CancellationToken ct) => _db.SaveChangesAsync(ct);

    public async Task<IReadOnlyList<YatraRow>> ReadChangesAfterAsync(long after, int take, CancellationToken ct)
    {
        var rows = new List<YatraRow>(take * 2);
        rows.AddRange(await Page(_db.SevaTypes, after, take).ToListAsync(ct));
        rows.AddRange(await Page(_db.Bookings, after, take).ToListAsync(ct));
        rows.AddRange(await Page(_db.Payments, after, take).ToListAsync(ct));
        rows.AddRange(await Page(_db.Reversals, after, take).ToListAsync(ct));
        return rows.OrderBy(r => r.ServerSeq).Take(take).ToList();
    }

    public async Task<DayBookings> ReadBookingsForDayAsync(DateOnly sevaDate, CancellationToken ct)
    {
        var bookings = await _db.Bookings.AsNoTracking().Where(b => b.SevaDate == sevaDate).ToListAsync(ct);
        var bookingIds = bookings.Select(b => b.Id).ToList();
        var payments = await _db.Payments.AsNoTracking().Where(p => bookingIds.Contains(p.BookingId)).ToListAsync(ct);
        var entryIds = bookingIds.Concat(payments.Select(p => p.Id)).ToList();
        var reversals = await _db.Reversals.AsNoTracking().Where(r => entryIds.Contains(r.ReversedEntryId)).ToListAsync(ct);
        return new DayBookings(bookings, payments, reversals);
    }

    public async Task<(IReadOnlyList<SevaPayment> Payments, IReadOnlyList<Reversal> Reversals)> ReadPaymentsRecordedAsync(
        DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.RecordedAt >= from && p.RecordedAt < to)
            .ToListAsync(ct);
        var ids = payments.Select(p => p.Id).ToList();
        var reversals = await _db.Reversals.AsNoTracking().Where(r => ids.Contains(r.ReversedEntryId)).ToListAsync(ct);
        return (payments, reversals);
    }

    private static IQueryable<T> Page<T>(IQueryable<T> set, long after, int take)
        where T : YatraRow =>
        set.AsNoTracking().Where(r => r.ServerSeq > after).OrderBy(r => r.ServerSeq).Take(take);

    /// <summary>
    /// Serialises this yatra's writes for the length of the transaction, so rows commit in sequence order
    /// (a pull never moves its cursor past a row still being written) and receipt numbers have no gaps
    /// or repeats. Other yatras are not blocked.
    /// </summary>
    private async Task AcquireYatraLockAsync(CancellationToken ct)
    {
        await using var command = _db.CreateCommand(
            "DECLARE @result int; " +
            "EXEC @result = sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @timeout; " +
            "SELECT @result;");
        AddParameter(command, "@resource", $"yatra:{_yatra.YatraId:N}");
        AddParameter(command, "@timeout", (int)LockTimeout.TotalMilliseconds);

        var result = Convert.ToInt32(await command.ExecuteScalarAsync(ct));
        if (result < 0)
        {
            throw new TimeoutException($"Could not take the lock for this yatra (sp_getapplock returned {result}).");
        }
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
