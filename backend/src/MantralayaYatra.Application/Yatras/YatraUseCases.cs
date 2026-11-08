using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Application.Common;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.Yatras;

internal static class RoleWire
{
    public static string ToWire(this MemberRole role) => role.ToString().ToLowerInvariant();
}

/// <summary>Starts a new yatra. Whoever creates it becomes its accountant, and the four sevas are seeded without rates.</summary>
public sealed class CreateYatra
{
    /// <summary>A yatra longer than this is almost certainly a typing slip in a date.</summary>
    public const int MaxDays = 60;

    private readonly IYatraDirectory _directory;
    private readonly ICurrentUser _user;
    private readonly TimeProvider _time;

    public CreateYatra(IYatraDirectory directory, ICurrentUser user, TimeProvider time)
    {
        _directory = directory;
        _user = user;
        _time = time;
    }

    public async Task<Result<YatraOut>> HandleAsync(CreateYatraRequest request, CancellationToken ct)
    {
        var name = Text.Clean(request.Name);
        if (name is null || name.Length > Yatra.MaxNameLength)
        {
            return Error.Validation("name_invalid", $"name is required, up to {Yatra.MaxNameLength} characters.");
        }

        if (request.StartsOn == default || request.EndsOn < request.StartsOn)
        {
            return Error.Validation("dates_invalid", "startsOn is required and endsOn cannot be before it.");
        }

        if (request.EndsOn.DayNumber - request.StartsOn.DayNumber + 1 > MaxDays)
        {
            return Error.Validation("dates_invalid", $"A yatra can last at most {MaxDays} days.");
        }

        if (string.IsNullOrWhiteSpace(_user.Email))
        {
            return Error.Validation("email_missing", "Your sign-in carries no email address, which members are matched on.");
        }

        var displayName = Text.Clean(request.DisplayName) ?? _user.Email;
        if (displayName.Length > YatraMember.MaxDisplayNameLength)
        {
            return Error.Validation("display_name_invalid", $"displayName is longer than {YatraMember.MaxDisplayNameLength} characters.");
        }

        var now = _time.GetUtcNow();
        var yatra = new Yatra
        {
            Id = Guid.NewGuid(),
            Name = name,
            StartsOn = request.StartsOn,
            EndsOn = request.EndsOn,
            CreatedBy = _user.UserId,
            CreatedAt = now,
        };
        var founder = new YatraMember
        {
            Id = Guid.NewGuid(),
            YatraId = yatra.Id,
            UserId = _user.UserId,
            Email = YatraMember.NormaliseEmail(_user.Email),
            DisplayName = displayName,
            Role = MemberRole.Accounts,
            AddedAt = now,
        };

        await _directory.CreateAsync(yatra, founder, SevaType.DefaultsFor(yatra.Id), ct);
        return new YatraOut(yatra.Id, yatra.Name, yatra.StartsOn, yatra.EndsOn, MemberRole.Accounts.ToWire());
    }
}

/// <summary>The yatras the signed-in person belongs to, with their role in each.</summary>
public sealed class ListMyYatras
{
    private readonly IYatraDirectory _directory;
    private readonly ICurrentUser _user;

    public ListMyYatras(IYatraDirectory directory, ICurrentUser user)
    {
        _directory = directory;
        _user = user;
    }

    public async Task<Result<IReadOnlyList<YatraOut>>> HandleAsync(CancellationToken ct)
    {
        var rows = await _directory.ListForUserAsync(_user.UserId, _user.Email, ct);
        return Result<IReadOnlyList<YatraOut>>.Success(rows
            .OrderByDescending(r => r.Yatra.StartsOn)
            .Select(r => new YatraOut(r.Yatra.Id, r.Yatra.Name, r.Yatra.StartsOn, r.Yatra.EndsOn, r.Role.ToWire()))
            .ToList());
    }
}

/// <summary>The accountant adds a volunteer or committee member by email; they get access when they first sign in with it.</summary>
public sealed class AddMember
{
    private readonly IYatraDirectory _directory;
    private readonly IYatraContext _yatra;
    private readonly TimeProvider _time;

    public AddMember(IYatraDirectory directory, IYatraContext yatra, TimeProvider time)
    {
        _directory = directory;
        _yatra = yatra;
        _time = time;
    }

    public async Task<Result<MemberOut>> HandleAsync(AddMemberRequest request, CancellationToken ct)
    {
        if (!_yatra.Role.Allows(MemberRole.Accounts))
        {
            return Error.Forbidden("Only the accountant can add members.");
        }

        var email = Text.Clean(request.Email);
        if (email is null || email.Length > YatraMember.MaxEmailLength || !email.Contains('@'))
        {
            return Error.Validation("email_invalid", "A valid email is required.");
        }

        var displayName = Text.Clean(request.DisplayName);
        if (displayName is null || displayName.Length > YatraMember.MaxDisplayNameLength)
        {
            return Error.Validation("display_name_invalid", $"displayName is required, up to {YatraMember.MaxDisplayNameLength} characters.");
        }

        if (!MemberRoles.TryParse(request.Role, out var role))
        {
            return Error.Validation("role_invalid", "role must be accounts, volunteer or viewer.");
        }

        var normalised = YatraMember.NormaliseEmail(email);
        if (await _directory.HasMemberWithEmailAsync(_yatra.YatraId, normalised, ct))
        {
            return Error.Conflict("member_exists", "Someone with this email is already a member.");
        }

        var member = new YatraMember
        {
            Id = Guid.NewGuid(),
            YatraId = _yatra.YatraId,
            Email = normalised,
            DisplayName = displayName,
            Role = role,
            AddedAt = _time.GetUtcNow(),
        };
        await _directory.AddMemberAsync(member, ct);
        return new MemberOut(member.Id, member.Email, member.DisplayName, role.ToWire(), HasSignedIn: false);
    }
}

public sealed class ListMembers
{
    private readonly IYatraDirectory _directory;
    private readonly IYatraContext _yatra;

    public ListMembers(IYatraDirectory directory, IYatraContext yatra)
    {
        _directory = directory;
        _yatra = yatra;
    }

    public async Task<Result<IReadOnlyList<MemberOut>>> HandleAsync(CancellationToken ct)
    {
        var members = await _directory.ListMembersAsync(_yatra.YatraId, ct);
        return Result<IReadOnlyList<MemberOut>>.Success(members
            .OrderByDescending(m => m.Role)
            .ThenBy(m => m.DisplayName, StringComparer.OrdinalIgnoreCase)
            .Select(m => new MemberOut(m.Id, m.Email, m.DisplayName, m.Role.ToWire(), m.IsClaimed))
            .ToList());
    }
}

/// <summary>The accountant sets a seva's name, rate, daily limit and whether it is offered. Phones pick the change up on their next pull.</summary>
public sealed class SaveSevaType
{
    public const int MaxSevaTypes = 20;

    private readonly ILedgerStore _store;
    private readonly IYatraContext _yatra;

    public SaveSevaType(ILedgerStore store, IYatraContext yatra)
    {
        _store = store;
        _yatra = yatra;
    }

    public async Task<Result<SevaTypeOut>> HandleAsync(string code, SevaTypeIn request, CancellationToken ct)
    {
        if (!_yatra.Role.Allows(MemberRole.Accounts))
        {
            return Error.Forbidden("Only the accountant can change sevas.");
        }

        if (!SevaType.IsValidCode(code))
        {
            return Error.Validation("code_invalid", "code must be 2 to 5 capital letters, e.g. SRV.");
        }

        var name = Text.Clean(request.Name);
        if (name is null || name.Length > SevaType.MaxNameLength)
        {
            return Error.Validation("name_invalid", $"name is required, up to {SevaType.MaxNameLength} characters.");
        }

        if (request.RatePaise is <= 0 or > PushLedgerEntries.MaxAmountPaise)
        {
            return Error.Validation("rate_invalid", $"ratePaise must be between 1 and {PushLedgerEntries.MaxAmountPaise}, or null.");
        }

        if (request.DailyLimit is < 1 or > 10_000)
        {
            return Error.Validation("limit_invalid", "dailyLimit must be between 1 and 10000, or null.");
        }

        return await _store.InYatraTransactionAsync<Result<SevaTypeOut>>(async token =>
        {
            var sevaType = await _store.FindSevaTypeByCodeAsync(code, token);
            if (sevaType is null)
            {
                if ((await _store.ListSevaTypesAsync(token)).Count >= MaxSevaTypes)
                {
                    return Error.Validation("too_many_sevas", $"A yatra can have at most {MaxSevaTypes} sevas.");
                }

                sevaType = new SevaType { Id = Guid.NewGuid(), Code = code };
                _store.Add(sevaType);
            }

            sevaType.Name = name;
            sevaType.RatePaise = request.RatePaise;
            sevaType.DailyLimit = request.DailyLimit;
            sevaType.RequiresSankalpa = request.RequiresSankalpa;
            sevaType.IsActive = request.IsActive;
            sevaType.SortOrder = request.SortOrder;
            sevaType.ServerSeq = await _store.NextSeqAsync(token);
            await _store.SaveChangesAsync(token);
            return sevaType.ToOut();
        }, ct);
    }
}

public sealed class ListSevaTypes
{
    private readonly ILedgerStore _store;

    public ListSevaTypes(ILedgerStore store)
    {
        _store = store;
    }

    public async Task<Result<IReadOnlyList<SevaTypeOut>>> HandleAsync(CancellationToken ct)
    {
        var types = await _store.ListSevaTypesAsync(ct);
        return Result<IReadOnlyList<SevaTypeOut>>.Success(
            types.OrderBy(t => t.SortOrder).ThenBy(t => t.Code).Select(t => t.ToOut()).ToList());
    }
}
