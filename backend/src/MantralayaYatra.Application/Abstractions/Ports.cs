using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Sync;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.Abstractions;

/// <summary>The signed-in user, resolved from the access token before any use case runs.</summary>
public interface ICurrentUser
{
    Guid UserId { get; }

    /// <summary>The email in the token, used to match an invitation the accountant created.</summary>
    string? Email { get; }
}

/// <summary>
/// The yatra a request is about and the caller's role in it. Set once per request, after membership
/// is checked, for every route under <c>/yatras/{yatraId}</c>.
/// </summary>
public interface IYatraContext
{
    Guid YatraId { get; }

    MemberRole Role { get; }
}

/// <summary>Maps the identity provider's subject to an internal user, creating the user on first sight.</summary>
public interface IUserDirectory
{
    Task<Guid> GetOrCreateAsync(string identitySubject, string? email, CancellationToken ct);
}

/// <summary>Yatras and who belongs to them. Not scoped to one yatra: it is what decides the scope.</summary>
public interface IYatraDirectory
{
    /// <summary>
    /// The caller's role in a yatra, or null if they are not a member. Claims a pending invitation
    /// addressed to <paramref name="email"/> on the way.
    /// </summary>
    Task<MemberRole?> ResolveRoleAsync(Guid yatraId, Guid userId, string? email, CancellationToken ct);

    Task<IReadOnlyList<(Yatra Yatra, MemberRole Role)>> ListForUserAsync(Guid userId, string? email, CancellationToken ct);

    /// <summary>Stores a new yatra with its first member and seva types, in one transaction, giving each seva type a sequence number.</summary>
    Task CreateAsync(Yatra yatra, YatraMember founder, IReadOnlyList<SevaType> sevaTypes, CancellationToken ct);

    Task<bool> HasMemberWithEmailAsync(Guid yatraId, string normalisedEmail, CancellationToken ct);

    Task AddMemberAsync(YatraMember member, CancellationToken ct);

    Task<IReadOnlyList<YatraMember>> ListMembersAsync(Guid yatraId, CancellationToken ct);
}

/// <summary>The bookings, payments and reversals for one seva day, with any reversals that touch them.</summary>
public sealed record DayBookings(
    IReadOnlyList<SevaBooking> Bookings,
    IReadOnlyList<SevaPayment> Payments,
    IReadOnlyList<Reversal> Reversals);

/// <summary>
/// Storage for the yatra's books. Every read and write is scoped to <see cref="IYatraContext"/>;
/// the use cases never pass a yatra id, so none can read another yatra's books.
/// </summary>
public interface ILedgerStore
{
    /// <summary>
    /// Runs <paramref name="work"/> in one database transaction holding this yatra's lock, so pushes from
    /// different phones commit one after another in sequence order and receipt numbers have no gaps or repeats.
    /// Commits only if it returns.
    /// </summary>
    Task<T> InYatraTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken ct);

    Task<Yatra> GetYatraAsync(CancellationToken ct);

    Task<long> NextSeqAsync(CancellationToken ct);

    /// <summary>The next final receipt number for a seva (1, 2, …). Call only inside <see cref="InYatraTransactionAsync{T}"/>.</summary>
    Task<long> NextReceiptNumberAsync(Guid sevaTypeId, CancellationToken ct);

    Task<IReadOnlyList<SevaType>> ListSevaTypesAsync(CancellationToken ct);

    Task<SevaType?> FindSevaTypeByCodeAsync(string code, CancellationToken ct);

    /// <summary>Any ledger entry with this id, of any kind.</summary>
    Task<LedgerEntry?> FindEntryAsync(Guid id, CancellationToken ct);

    Task<Reversal?> FindReversalOfAsync(Guid entryId, CancellationToken ct);

    Task<IReadOnlyList<SevaPayment>> ListPaymentsForBookingAsync(Guid bookingId, CancellationToken ct);

    /// <summary>Bookings for a seva and day that have not been reversed.</summary>
    Task<int> CountActiveBookingsAsync(Guid sevaTypeId, DateOnly sevaDate, CancellationToken ct);

    /// <summary>Starts tracking a new row; it is written by the next <see cref="SaveChangesAsync"/>.</summary>
    void Add(YatraRow row);

    Task SaveChangesAsync(CancellationToken ct);

    /// <summary>Seva types and ledger entries with a sequence number above <paramref name="after"/>, lowest first.</summary>
    Task<IReadOnlyList<YatraRow>> ReadChangesAfterAsync(long after, int take, CancellationToken ct);

    /// <summary>Bookings for one seva day, their payments, and reversals of any of them.</summary>
    Task<DayBookings> ReadBookingsForDayAsync(DateOnly sevaDate, CancellationToken ct);

    /// <summary>Payments recorded on the phone within [from, to), whatever day their seva is, with reversals of them.</summary>
    Task<(IReadOnlyList<SevaPayment> Payments, IReadOnlyList<Reversal> Reversals)> ReadPaymentsRecordedAsync(
        DateTimeOffset from, DateTimeOffset to, CancellationToken ct);
}
