namespace MantralayaYatra.Domain.Yatras;

/// <summary>What a member may do. Each role includes everything the roles below it can do.</summary>
public enum MemberRole
{
    /// <summary>Committee members: read the register, totals and the priest's list.</summary>
    Viewer = 0,

    /// <summary>Book sevas and record payments from their phone.</summary>
    Volunteer = 1,

    /// <summary>The accountant: everything, plus reversals, seva rates and adding members.</summary>
    Accounts = 2,
}

public static class MemberRoles
{
    public static bool Allows(this MemberRole role, MemberRole required) => role >= required;

    public static bool TryParse(string? value, out MemberRole role)
    {
        role = default;
        return value is not null
            && !int.TryParse(value, out _)
            && Enum.TryParse(value, ignoreCase: true, out role)
            && Enum.IsDefined(role);
    }
}

/// <summary>
/// A person's place in one yatra. The accountant adds members by email before they ever sign in;
/// the member row is claimed (<see cref="UserId"/> set) the first time someone signs in with that email.
/// </summary>
public sealed class YatraMember
{
    public const int MaxEmailLength = 320;
    public const int MaxDisplayNameLength = 80;

    public Guid Id { get; set; }

    public Guid YatraId { get; set; }

    /// <summary>Null until the invited person first signs in.</summary>
    public Guid? UserId { get; set; }

    /// <summary>Stored normalised (trimmed, lower case) so an invite matches however the token spells it.</summary>
    public string Email { get; set; } = "";

    public string DisplayName { get; set; } = "";

    public MemberRole Role { get; set; }

    public DateTimeOffset AddedAt { get; set; }

    public bool IsClaimed => UserId is not null;

    public static string NormaliseEmail(string email) => email.Trim().ToLowerInvariant();

    public bool IsInvitationFor(string? email) =>
        !IsClaimed && email is not null && Email == NormaliseEmail(email);
}
