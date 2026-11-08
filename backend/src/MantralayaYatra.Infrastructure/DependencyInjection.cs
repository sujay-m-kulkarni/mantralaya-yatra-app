using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MantralayaYatra.Infrastructure;

public static class DependencyInjection
{
    public const string ConnectionStringName = "Yatra";

    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        // Read when the context is first built, so settings supplied by a host or a test factory are honoured.
        services.AddDbContext<YatraDbContext>((provider, options) =>
        {
            var connectionString = provider.GetRequiredService<IConfiguration>().GetConnectionString(ConnectionStringName);
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException($"ConnectionStrings:{ConnectionStringName} is not set.");
            }

            options.UseSqlServer(connectionString);
        });
        services.AddScoped<ILedgerStore, EfLedgerStore>();
        services.AddScoped<IYatraDirectory, EfYatraDirectory>();
        services.AddScoped<IUserDirectory, EfUserDirectory>();
        services.AddHealthChecks().AddDbContextCheck<YatraDbContext>("database", tags: ["ready"]);
        return services;
    }

    /// <summary>
    /// Local development and tests only. Applies migrations; until the first migration is generated
    /// (see backend/README.md), creates the schema straight from the model instead.
    /// </summary>
    public static async Task InitialiseDatabaseAsync(this IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<YatraDbContext>();
        if (db.Database.GetMigrations().Any())
        {
            await db.Database.MigrateAsync(ct);
        }
        else
        {
            await db.Database.EnsureCreatedAsync(ct);
        }
    }
}
