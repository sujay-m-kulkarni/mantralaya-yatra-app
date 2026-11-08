using MantralayaYatra.Domain.Sevas;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MantralayaYatra.Infrastructure.Persistence;

/// <summary>
/// Removes for good the sevas deleted more than <see cref="SevaType.KeepDeletedDays"/> days ago that were never
/// booked. A deleted seva with bookings stays, because those bookings and their receipts refer to it.
/// Runs when the API starts and once a day after that.
/// </summary>
public sealed class DeletedSevaCleanup : BackgroundService
{
    private static readonly TimeSpan Every = TimeSpan.FromDays(1);

    private readonly IServiceScopeFactory _scopes;
    private readonly TimeProvider _time;
    private readonly ILogger<DeletedSevaCleanup> _log;

    public DeletedSevaCleanup(IServiceScopeFactory scopes, TimeProvider time, ILogger<DeletedSevaCleanup> log)
    {
        _scopes = scopes;
        _time = time;
        _log = log;
    }

    /// <summary>Removes the expired deleted sevas; returns how many.</summary>
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        await using var scope = _scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<YatraDbContext>();
        var cutoff = _time.GetUtcNow().AddDays(-SevaType.KeepDeletedDays);

        // Across all yatras, so the yatra filter is switched off and each condition names the yatra itself.
        return await db.SevaTypes.IgnoreQueryFilters()
            .Where(s => s.DeletedAt != null && s.DeletedAt < cutoff)
            .Where(s => !db.Bookings.IgnoreQueryFilters().Any(b => b.YatraId == s.YatraId && b.SevaTypeId == s.Id))
            .Where(s => !db.ReceiptCounters.IgnoreQueryFilters().Any(c => c.YatraId == s.YatraId && c.SevaTypeId == s.Id))
            .ExecuteDeleteAsync(ct);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Every, _time);
        do
        {
            try
            {
                var removed = await RunOnceAsync(stoppingToken);
                if (removed > 0)
                {
                    _log.LogInformation("Removed {Count} sevas deleted more than {Days} days ago", removed, SevaType.KeepDeletedDays);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // Best effort: try again tomorrow. The API keeps serving either way.
                _log.LogWarning(e, "Could not remove old deleted sevas");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
