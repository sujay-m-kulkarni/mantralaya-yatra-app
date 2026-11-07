using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Yatras;
using Microsoft.EntityFrameworkCore;

namespace MantralayaYatra.Infrastructure.Persistence;

public sealed class EfYatraDirectory : IYatraDirectory
{
    private readonly YatraDbContext _db;

    public EfYatraDirectory(YatraDbContext db)
    {
        _db = db;
    }

    public async Task<MemberRole?> ResolveRoleAsync(Guid yatraId, Guid userId, string? email, CancellationToken ct)
    {
        var member = await _db.Members.SingleOrDefaultAsync(m => m.YatraId == yatraId && m.UserId == userId, ct);
        if (member is not null)
        {
            return member.Role;
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            return null;
        }

        var normalised = YatraMember.NormaliseEmail(email);
        var invitation = await _db.Members.SingleOrDefaultAsync(m => m.YatraId == yatraId && m.UserId == null && m.Email == normalised, ct);
        if (invitation is null)
        {
            return null;
        }

        invitation.UserId = userId;
        await _db.SaveChangesAsync(ct);
        return invitation.Role;
    }

    public async Task<IReadOnlyList<(Yatra Yatra, MemberRole Role)>> ListForUserAsync(Guid userId, string? email, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(email))
        {
            // Claim any invitations waiting for this email, so the yatras show up on first sign-in.
            var normalised = YatraMember.NormaliseEmail(email);
            var invitations = await _db.Members.Where(m => m.UserId == null && m.Email == normalised).ToListAsync(ct);
            foreach (var invitation in invitations)
            {
                invitation.UserId = userId;
            }

            if (invitations.Count > 0)
            {
                await _db.SaveChangesAsync(ct);
            }
        }

        var rows = await (
                from m in _db.Members.AsNoTracking()
                join y in _db.Yatras.AsNoTracking() on m.YatraId equals y.Id
                where m.UserId == userId
                select new { Yatra = y, m.Role })
            .ToListAsync(ct);
        return rows.Select(r => (r.Yatra, r.Role)).ToList();
    }

    public async Task CreateAsync(Yatra yatra, YatraMember founder, IReadOnlyList<SevaType> sevaTypes, CancellationToken ct)
    {
        var strategy = _db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async token =>
        {
            _db.ChangeTracker.Clear();
            await using var transaction = await _db.Database.BeginTransactionAsync(token);
            _db.Yatras.Add(yatra);
            _db.Members.Add(founder);
            foreach (var sevaType in sevaTypes)
            {
                sevaType.YatraId = yatra.Id;
                sevaType.ServerSeq = await _db.NextSeqAsync(token);
                _db.SevaTypes.Add(sevaType);
            }

            await _db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
        }, ct);
    }

    public Task<bool> HasMemberWithEmailAsync(Guid yatraId, string normalisedEmail, CancellationToken ct) =>
        _db.Members.AnyAsync(m => m.YatraId == yatraId && m.Email == normalisedEmail, ct);

    public async Task AddMemberAsync(YatraMember member, CancellationToken ct)
    {
        _db.Members.Add(member);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<YatraMember>> ListMembersAsync(Guid yatraId, CancellationToken ct) =>
        await _db.Members.AsNoTracking().Where(m => m.YatraId == yatraId).ToListAsync(ct);
}
