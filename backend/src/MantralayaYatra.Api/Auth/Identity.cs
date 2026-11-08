using System.ComponentModel.DataAnnotations;
using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Api.Auth;

/// <summary>Microsoft Entra External ID settings. The API only validates tokens; it never signs anyone in.</summary>
public sealed class AuthOptions
{
    public const string Section = "Auth";

    /// <summary>The tenant's issuer, e.g. https://&lt;tenant&gt;.ciamlogin.com/&lt;tenant-id&gt;/v2.0.</summary>
    [Required]
    public string Authority { get; set; } = "";

    /// <summary>
    /// The API's application (client) id and/or its app id URI, separated by commas, e.g.
    /// "6f1c…, api://6f1c…". A token is accepted if its audience is any of them.
    /// </summary>
    [Required]
    public string Audience { get; set; } = "";

    public string[] Audiences =>
        Audience.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

/// <summary>Claim names as they appear in the token (inbound claim mapping is off).</summary>
public static class TokenClaims
{
    public const string Subject = "sub";
    public const string Email = "email";
}

/// <summary>Set once per request by <see cref="ResolveUser"/>, before any use case runs.</summary>
public sealed class CurrentUser : ICurrentUser
{
    private Guid? _userId;

    public Guid UserId => _userId ?? throw new InvalidOperationException("The user has not been resolved for this request.");

    public string? Email { get; private set; }

    public void Set(Guid userId, string? email)
    {
        _userId = userId;
        Email = email;
    }
}

/// <summary>Set once per request by <see cref="ResolveMembership"/> for routes under /yatras/{yatraId}.</summary>
public sealed class YatraContext : IYatraContext
{
    private Guid? _yatraId;
    private MemberRole _role;

    public Guid YatraId => _yatraId ?? throw new InvalidOperationException("No yatra has been resolved for this request.");

    public MemberRole Role => _yatraId is null
        ? throw new InvalidOperationException("No yatra has been resolved for this request.")
        : _role;

    public void Set(Guid yatraId, MemberRole role)
    {
        _yatraId = yatraId;
        _role = role;
    }
}

public static class ResolveUser
{
    /// <summary>Maps the token's subject to the internal user, creating the user on the first call.</summary>
    public static async ValueTask<object?> FilterAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var subject = http.User.FindFirst(TokenClaims.Subject)?.Value;
        if (string.IsNullOrEmpty(subject))
        {
            return TypedResults.Unauthorized();
        }

        var email = http.User.FindFirst(TokenClaims.Email)?.Value;
        var users = http.RequestServices.GetRequiredService<IUserDirectory>();
        var userId = await users.GetOrCreateAsync(subject, email, http.RequestAborted);
        http.RequestServices.GetRequiredService<CurrentUser>().Set(userId, email);
        return await next(context);
    }
}

public static class ResolveMembership
{
    public const string RouteKey = "yatraId";

    /// <summary>
    /// Checks the caller belongs to the yatra in the route and records their role. Someone who is not a
    /// member gets 404, the same as for a yatra that does not exist, so ids reveal nothing.
    /// Runs after <see cref="ResolveUser"/>.
    /// </summary>
    public static async ValueTask<object?> FilterAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!Guid.TryParse(http.Request.RouteValues[RouteKey]?.ToString(), out var yatraId))
        {
            return TypedResults.NotFound();
        }

        var user = http.RequestServices.GetRequiredService<CurrentUser>();
        var directory = http.RequestServices.GetRequiredService<IYatraDirectory>();
        var role = await directory.ResolveRoleAsync(yatraId, user.UserId, user.Email, http.RequestAborted);
        if (role is null)
        {
            return TypedResults.NotFound();
        }

        http.RequestServices.GetRequiredService<YatraContext>().Set(yatraId, role.Value);
        return await next(context);
    }
}
