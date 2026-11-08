using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace MantralayaYatra.Api.Auth;

/// <summary>
/// The app has one user, the accountant. Their phone app carries a long random key, built into the APK, and sends
/// it as <c>X-Api-Key</c> with every call. The key lives only in the web app's settings (<c>Access__ApiKey</c>)
/// and in the build's secrets, never in the repository.
/// </summary>
public sealed class AccessOptions
{
    public const string Section = "Access";

    /// <summary>A key shorter than this is refused at start-up outside Development, so a weak one cannot slip in.</summary>
    public const int MinKeyLength = 32;

    public string ApiKey { get; set; } = "";
}

public static class ApiKeySignIn
{
    public const string Scheme = "ApiKey";
    public const string Header = "X-Api-Key";

    /// <summary>The one person who uses the app, as the subject the user directory maps to an internal user.</summary>
    public const string OwnerSubject = "owner";

    public static AuthenticationBuilder AddApiKeySignIn(this AuthenticationBuilder auth) =>
        auth.AddScheme<AuthenticationSchemeOptions, ApiKeyHandler>(Scheme, _ => { });

    /// <summary>Constant-time comparison, so the time taken reveals nothing about how close a guess was.</summary>
    public static bool Matches(string? configured, string? presented) =>
        !string.IsNullOrEmpty(configured) && configured.Length >= AccessOptions.MinKeyLength && presented is not null
        && CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(configured)),
            SHA256.HashData(Encoding.UTF8.GetBytes(presented)));
}

internal sealed class ApiKeyHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IOptionsMonitor<AccessOptions> access)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(ApiKeySignIn.Header, out var presented))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (!ApiKeySignIn.Matches(access.CurrentValue.ApiKey, presented.ToString()))
        {
            return Task.FromResult(AuthenticateResult.Fail("The API key is not right."));
        }

        var identity = new ClaimsIdentity([new Claim(TokenClaims.Subject, ApiKeySignIn.OwnerSubject)], ApiKeySignIn.Scheme);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), ApiKeySignIn.Scheme)));
    }
}
