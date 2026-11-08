using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Domain.Users;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace MantralayaYatra.Infrastructure.Persistence;

public sealed class EfUserDirectory : IUserDirectory
{
    private const int UniqueIndexViolation = 2601;
    private const int UniqueConstraintViolation = 2627;

    private readonly YatraDbContext _db;
    private readonly TimeProvider _time;

    public EfUserDirectory(YatraDbContext db, TimeProvider time)
    {
        _db = db;
        _time = time;
    }

    public async Task<Guid> GetOrCreateAsync(string identitySubject, string? email, CancellationToken ct)
    {
        var existing = await FindAsync(identitySubject, ct);
        if (existing is not null)
        {
            return existing.Value;
        }

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            IdentitySubject = identitySubject,
            Email = email,
            CreatedAt = _time.GetUtcNow(),
        };
        _db.AppUsers.Add(user);

        try
        {
            await _db.SaveChangesAsync(ct);
            return user.Id;
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: UniqueIndexViolation or UniqueConstraintViolation })
        {
            // Two first calls raced; the other one created the user.
            _db.Entry(user).State = EntityState.Detached;
            return await FindAsync(identitySubject, ct)
                ?? throw new InvalidOperationException("The user vanished after a duplicate insert.", ex);
        }
    }

    private async Task<Guid?> FindAsync(string identitySubject, CancellationToken ct) =>
        await _db.AppUsers
            .Where(u => u.IdentitySubject == identitySubject)
            .Select(u => (Guid?)u.Id)
            .SingleOrDefaultAsync(ct);
}
