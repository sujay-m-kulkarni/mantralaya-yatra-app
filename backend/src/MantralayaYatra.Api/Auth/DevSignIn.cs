using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace MantralayaYatra.Api.Auth;

/// <summary>
/// Development only: a request carrying <c>X-Dev-User: &lt;any name&gt;</c> is signed in as that user, so the API can be
/// tried on a laptop without the API key. <c>X-Dev-Email</c> sets an email for the user; without it the email is
/// <c>&lt;name&gt;@dev.invalid</c>. Requests carrying the API key still go through the API key handler.
/// Program.cs registers this only when the environment is Development; anywhere else the headers are ignored.
/// </summary>
public static class DevSignIn
{
    public const string Header = "X-Dev-User";
    public const string EmailHeader = "X-Dev-Email";
    public const string PolicyScheme = "ApiKeyOrDev";
    public const string Scheme = "DevHeader";

    /// <summary>Subjects get a prefix so a dev user can never collide with the owner.</summary>
    public const string SubjectPrefix = "dev:";

    public static AuthenticationBuilder AddDevSignIn(this AuthenticationBuilder auth) =>
        auth
            .AddPolicyScheme(PolicyScheme, "API key, or the dev header in Development", options =>
                options.ForwardDefaultSelector = context =>
                    context.Request.Headers.ContainsKey(Header) ? Scheme : ApiKeySignIn.Scheme)
            .AddScheme<AuthenticationSchemeOptions, DevSignInHandler>(Scheme, _ => { });
}

internal sealed class DevSignInHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IHostEnvironment environment)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Belt and braces: even if registered by mistake, it signs no one in outside Development.
        if (!environment.IsDevelopment())
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var name = Request.Headers[DevSignIn.Header].ToString().Trim();
        if (name.Length is 0 or > 100)
        {
            return Task.FromResult(AuthenticateResult.Fail($"{DevSignIn.Header} must be 1 to 100 characters."));
        }

        var email = Request.Headers[DevSignIn.EmailHeader].ToString().Trim();
        if (email.Length == 0)
        {
            email = $"{name.Replace(' ', '.')}@dev.invalid";
        }

        var identity = new ClaimsIdentity(
            [new Claim(TokenClaims.Subject, DevSignIn.SubjectPrefix + name), new Claim(TokenClaims.Email, email)],
            DevSignIn.Scheme);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), DevSignIn.Scheme);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
