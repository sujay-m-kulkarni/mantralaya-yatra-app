using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Domain.Yatras;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MantralayaYatra.Infrastructure.Persistence;

/// <summary>
/// Lets <c>dotnet ef migrations add</c> build the model without starting the API.
/// It never connects: the connection string is a placeholder.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<YatraDbContext>
{
    public YatraDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<YatraDbContext>()
            .UseSqlServer("Server=design-time;Database=MantralayaYatra")
            .Options;
        return new YatraDbContext(options, new NoYatra());
    }

    private sealed class NoYatra : IYatraContext
    {
        public Guid YatraId => Guid.Empty;

        public MemberRole Role => MemberRole.Viewer;
    }
}
