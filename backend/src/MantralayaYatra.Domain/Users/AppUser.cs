namespace MantralayaYatra.Domain.Users;

/// <summary>One row per person. Maps the identity provider's subject to the internal user id.</summary>
public sealed class AppUser
{
    public Guid Id { get; set; }
    public string IdentitySubject { get; set; } = "";
    public string? Email { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
