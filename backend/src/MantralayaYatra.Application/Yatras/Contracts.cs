namespace MantralayaYatra.Application.Yatras;

/// <param name="DisplayName">How the founder appears on receipts and the register.</param>
public sealed record CreateYatraRequest(string? Name, DateOnly StartsOn, DateOnly EndsOn, string? DisplayName);

/// <param name="Role">accounts, volunteer or viewer.</param>
public sealed record YatraOut(Guid Id, string Name, DateOnly StartsOn, DateOnly EndsOn, string Role);

/// <param name="Role">accounts, volunteer or viewer.</param>
public sealed record AddMemberRequest(string? Email, string? DisplayName, string? Role);

/// <param name="HasSignedIn">False until the invited person first signs in with this email.</param>
public sealed record MemberOut(Guid Id, string Email, string DisplayName, string Role, bool HasSignedIn);

/// <param name="RatePaise">Null to leave the amount open at booking time.</param>
/// <param name="DailyLimit">Null for no limit.</param>
public sealed record SevaTypeIn(
    string? Name,
    long? RatePaise,
    int? DailyLimit,
    bool RequiresSankalpa,
    bool IsActive,
    int SortOrder);
