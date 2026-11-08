using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MantralayaYatra.Api.Auth;
using Testcontainers.MsSql;

namespace MantralayaYatra.Api.IntegrationTests;

/// <summary>
/// The real API against a real SQL Server in a container, with the schema built on start.
/// Tokens are replaced by a test scheme that takes the subject and email from headers; everything after
/// authentication (user mapping, membership, yatra filter, locking, sequence, receipt counters) is the production code.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string SubjectHeader = "X-Test-Subject";
    public const string ApiKey = "integration-test-api-key-0123456789abcdef";
    private const string TestScheme = "TestOrApiKey";
    public const string EmailHeader = "X-Test-Email";

    private readonly MsSqlContainer _sql = new MsSqlBuilder()
        .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
        .Build();

    public async Task InitializeAsync()
    {
        await _sql.StartAsync();

        // Starting the host builds the schema once, before any test sends a request.
        using var _ = CreateClient();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _sql.DisposeAsync();
    }

    /// <summary>A client that sends the API key, as the phone app does.</summary>
    public HttpClient OwnerClient(string? key = ApiKey)
    {
        var client = CreateClient();
        if (key is not null)
        {
            client.DefaultRequestHeaders.Add(ApiKeySignIn.Header, key);
        }

        return client;
    }

    /// <summary>A client signed in as a person with this email. Use a fresh email per test so tests never share data.</summary>
    public HttpClient ClientFor(string email)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(SubjectHeader, "test:" + email);
        client.DefaultRequestHeaders.Add(EmailHeader, email);
        return client;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Yatra", _sql.GetConnectionString());
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Access:ApiKey", ApiKey);

        builder.ConfigureTestServices(services =>
        {
            // Requests with the API key go through the real key handler; the rest use the test header,
            // so tests can act as several different people.
            services.AddAuthentication(TestScheme)
                .AddPolicyScheme(TestScheme, "API key or test header", options =>
                    options.ForwardDefaultSelector = context =>
                        context.Request.Headers.ContainsKey(ApiKeySignIn.Header) ? ApiKeySignIn.Scheme : HeaderAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>(HeaderAuthHandler.SchemeName, _ => { });

            // Put the server-side exception in the 500 response, so a failing test shows its cause.
            services.Configure<ProblemDetailsOptions>(options =>
                options.CustomizeProblemDetails = context =>
                {
                    if (context.Exception is not null)
                    {
                        context.ProblemDetails.Detail = context.Exception.ToString();
                    }
                });
        });
    }
}

internal sealed class HeaderAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "TestHeader";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(ApiFactory.SubjectHeader, out var subject) || string.IsNullOrEmpty(subject))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var claims = new List<Claim> { new("sub", subject.ToString()) };
        if (Request.Headers.TryGetValue(ApiFactory.EmailHeader, out var email))
        {
            claims.Add(new Claim("email", email.ToString()));
        }

        var identity = new ClaimsIdentity(claims, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}
