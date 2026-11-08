using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Sync;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.UnitTests;

internal sealed class FixedTime(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;

    public override DateTimeOffset GetUtcNow() => Now;
}

internal sealed class FakeUser : ICurrentUser
{
    public Guid UserId { get; set; } = Guid.NewGuid();

    public string? Email { get; set; } = "volunteer@example.com";
}

internal sealed class FakeYatraContext : IYatraContext
{
    public Guid YatraId { get; set; } = Guid.NewGuid();

    public MemberRole Role { get; set; } = MemberRole.Volunteer;
}

/// <summary>An in-memory copy of one yatra's books. Rows are stored as tracked objects, as EF does.</summary>
internal sealed class FakeLedgerStore : ILedgerStore
{
    private readonly Dictionary<Guid, long> _receiptCounters = [];
    private long _seq;

    public FakeLedgerStore(Yatra yatra)
    {
        Yatra = yatra;
    }

    public Yatra Yatra { get; }

    public List<YatraRow> Rows { get; } = [];

    public int TransactionCount { get; private set; }

    public IEnumerable<SevaBooking> Bookings => Rows.OfType<SevaBooking>();

    public IEnumerable<SevaPayment> Payments => Rows.OfType<SevaPayment>();

    public IEnumerable<Reversal> Reversals => Rows.OfType<Reversal>();

    public async Task<T> InYatraTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken ct)
    {
        TransactionCount++;
        return await work(ct);
    }

    public Task<Yatra> GetYatraAsync(CancellationToken ct) => Task.FromResult(Yatra);

    public Task<long> NextSeqAsync(CancellationToken ct) => Task.FromResult(++_seq);

    public Task<long> NextReceiptNumberAsync(Guid sevaTypeId, CancellationToken ct)
    {
        var next = _receiptCounters.GetValueOrDefault(sevaTypeId) + 1;
        _receiptCounters[sevaTypeId] = next;
        return Task.FromResult(next);
    }

    public Task<IReadOnlyList<SevaType>> ListSevaTypesAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SevaType>>(Rows.OfType<SevaType>().ToList());

    public Task<SevaType?> FindSevaTypeByCodeAsync(string code, CancellationToken ct) =>
        Task.FromResult(Rows.OfType<SevaType>().SingleOrDefault(s => s.Code == code));

    public Task<LedgerEntry?> FindEntryAsync(Guid id, CancellationToken ct) =>
        Task.FromResult(Rows.OfType<LedgerEntry>().SingleOrDefault(e => e.Id == id));

    public Task<Reversal?> FindReversalOfAsync(Guid entryId, CancellationToken ct) =>
        Task.FromResult(Reversals.SingleOrDefault(r => r.ReversedEntryId == entryId));

    public Task<IReadOnlyList<SevaPayment>> ListPaymentsForBookingAsync(Guid bookingId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SevaPayment>>(Payments.Where(p => p.BookingId == bookingId).ToList());

    public Task<int> CountActiveBookingsAsync(Guid sevaTypeId, DateOnly sevaDate, CancellationToken ct) =>
        Task.FromResult(Bookings.Count(b =>
            b.SevaTypeId == sevaTypeId && b.SevaDate == sevaDate && Reversals.All(r => r.ReversedEntryId != b.Id)));

    public void Add(YatraRow row)
    {
        row.YatraId = Yatra.Id;
        Rows.Add(row);
    }

    public Task SaveChangesAsync(CancellationToken ct) => Task.CompletedTask;

    public Task<IReadOnlyList<YatraRow>> ReadChangesAfterAsync(long after, int take, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<YatraRow>>(Rows.Where(r => r.ServerSeq > after).OrderBy(r => r.ServerSeq).Take(take).ToList());

    public Task<DayBookings> ReadBookingsForDayAsync(DateOnly sevaDate, CancellationToken ct)
    {
        var bookings = Bookings.Where(b => b.SevaDate == sevaDate).ToList();
        var ids = bookings.Select(b => b.Id).ToHashSet();
        var payments = Payments.Where(p => ids.Contains(p.BookingId)).ToList();
        ids.UnionWith(payments.Select(p => p.Id));
        var reversals = Reversals.Where(r => ids.Contains(r.ReversedEntryId)).ToList();
        return Task.FromResult(new DayBookings(bookings, payments, reversals));
    }

    public Task<(IReadOnlyList<SevaPayment> Payments, IReadOnlyList<Reversal> Reversals)> ReadPaymentsRecordedAsync(
        DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        var payments = Payments.Where(p => p.RecordedAt >= from && p.RecordedAt < to).ToList();
        var ids = payments.Select(p => p.Id).ToHashSet();
        IReadOnlyList<Reversal> reversals = Reversals.Where(r => ids.Contains(r.ReversedEntryId)).ToList();
        return Task.FromResult<(IReadOnlyList<SevaPayment>, IReadOnlyList<Reversal>)>((payments, reversals));
    }

    /// <summary>Adds a seva type as the yatra's creation would, with a sequence number.</summary>
    public SevaType Seed(SevaType sevaType)
    {
        sevaType.ServerSeq = ++_seq;
        Add(sevaType);
        return sevaType;
    }
}

internal sealed class FakeYatraDirectory : IYatraDirectory
{
    public List<Yatra> Yatras { get; } = [];

    public List<YatraMember> Members { get; } = [];

    public List<SevaType> SeededSevaTypes { get; } = [];

    public Task<MemberRole?> ResolveRoleAsync(Guid yatraId, Guid userId, string? email, CancellationToken ct)
    {
        var member = Members.SingleOrDefault(m => m.YatraId == yatraId && m.UserId == userId)
            ?? Members.SingleOrDefault(m => m.YatraId == yatraId && m.IsInvitationFor(email));
        if (member is null)
        {
            return Task.FromResult<MemberRole?>(null);
        }

        member.UserId = userId;
        return Task.FromResult<MemberRole?>(member.Role);
    }

    public Task<IReadOnlyList<(Yatra Yatra, MemberRole Role)>> ListForUserAsync(Guid userId, string? email, CancellationToken ct)
    {
        foreach (var invitation in Members.Where(m => m.IsInvitationFor(email)))
        {
            invitation.UserId = userId;
        }

        IReadOnlyList<(Yatra, MemberRole)> rows = Members
            .Where(m => m.UserId == userId)
            .Select(m => (Yatras.Single(y => y.Id == m.YatraId), m.Role))
            .ToList();
        return Task.FromResult(rows);
    }

    public Task CreateAsync(Yatra yatra, YatraMember founder, IReadOnlyList<SevaType> sevaTypes, CancellationToken ct)
    {
        Yatras.Add(yatra);
        Members.Add(founder);
        SeededSevaTypes.AddRange(sevaTypes);
        return Task.CompletedTask;
    }

    public Task<bool> HasMemberWithEmailAsync(Guid yatraId, string normalisedEmail, CancellationToken ct) =>
        Task.FromResult(Members.Any(m => m.YatraId == yatraId && m.Email == normalisedEmail));

    public Task AddMemberAsync(YatraMember member, CancellationToken ct)
    {
        Members.Add(member);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<YatraMember>> ListMembersAsync(Guid yatraId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<YatraMember>>(Members.Where(m => m.YatraId == yatraId).ToList());
}
