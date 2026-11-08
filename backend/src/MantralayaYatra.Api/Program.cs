using System.Globalization;
using System.Threading.RateLimiting;
using MantralayaYatra.Api.Auth;
using MantralayaYatra.Api.Endpoints;
using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Application.Register;
using MantralayaYatra.Application.Yatras;
using MantralayaYatra.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

const string ContractVersion = "1";
const string PerUserPolicy = "per-user";

var builder = WebApplication.CreateBuilder(args);

// Identity: validate Entra External ID tokens; keep claim names as issued ("sub", not a mapped URI).
builder.Services.AddOptions<AuthOptions>()
    .BindConfiguration(AuthOptions.Section)
    .ValidateDataAnnotations()
    .ValidateOnStart();
// In Development only, the X-Dev-User header also signs a request in (see Auth/DevSignIn.cs).
var devSignIn = builder.Environment.IsDevelopment();
var authentication = builder.Services
    .AddAuthentication(devSignIn ? DevSignIn.PolicyScheme : JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();
if (devSignIn)
{
    authentication.AddDevSignIn();
    builder.Services.AddCors(cors => cors.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:4200", "http://localhost:8100")
            .AllowAnyHeader()
            .AllowAnyMethod()));
}
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<AuthOptions>>((jwt, auth) =>
    {
        jwt.Authority = auth.Value.Authority;
        jwt.Audience = auth.Value.Audience;
        jwt.MapInboundClaims = false;
    });
builder.Services.AddAuthorization();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>());
builder.Services.AddScoped<YatraContext>();
builder.Services.AddScoped<IYatraContext>(sp => sp.GetRequiredService<YatraContext>());

// Per-user limit; a rejected call gets 429 with Retry-After.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (context, _) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
        }

        return ValueTask.CompletedTask;
    };
    options.AddPolicy(PerUserPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        http.User.FindFirst(TokenClaims.Subject)?.Value ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

// Composition root: storage adapters, then the use cases.
builder.Services.AddInfrastructure();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<CreateYatra>();
builder.Services.AddScoped<ListMyYatras>();
builder.Services.AddScoped<AddMember>();
builder.Services.AddScoped<ListMembers>();
builder.Services.AddScoped<SaveSevaType>();
builder.Services.AddScoped<ListSevaTypes>();
builder.Services.AddScoped<PushLedgerEntries>();
builder.Services.AddScoped<PullLedgerChanges>();
builder.Services.AddScoped<GetDailyRegister>();
builder.Services.AddScoped<GetPriestList>();

var app = builder.Build();

// Local development and integration tests only; production applies the migration bundle from the pipeline.
if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    await app.Services.InitialiseDatabaseAsync();
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.Use((context, next) =>
{
    context.Response.Headers["X-Contract-Version"] = ContractVersion;
    return next(context);
});
if (devSignIn)
{
    // The app served by "npm start" (4200) or "ionic serve" (8100) calling this API from the browser.
    app.UseCors();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapOpenApi();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });

app.MapGroup("/api/v1")
    .RequireAuthorization()
    .RequireRateLimiting(PerUserPolicy)
    .AddEndpointFilter(ResolveUser.FilterAsync)
    .MapYatras()
    .MapYatraScoped();

await app.RunAsync();

/// <summary>Visible to the integration tests' WebApplicationFactory.</summary>
public partial class Program;
