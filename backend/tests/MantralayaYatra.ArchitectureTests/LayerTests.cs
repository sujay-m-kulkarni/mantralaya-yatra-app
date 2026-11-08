using System.Reflection;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Infrastructure.Persistence;
using NetArchTest.Rules;

namespace MantralayaYatra.ArchitectureTests;

/// <summary>
/// Fails the build when a layer references one it should not (see docs/architecture/backend-design.md).
/// </summary>
public class LayerTests
{
    private static readonly Assembly Domain = typeof(LedgerEntry).Assembly;
    private static readonly Assembly Application = typeof(PushLedgerEntries).Assembly;
    private static readonly Assembly Infrastructure = typeof(YatraDbContext).Assembly;

    [Fact]
    public void Domain_depends_on_nothing_else_in_the_solution_or_on_frameworks() =>
        AssertNone(Domain, "MantralayaYatra.Application", "MantralayaYatra.Infrastructure", "MantralayaYatra.Api", "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore");

    [Fact]
    public void Application_does_not_know_about_storage_or_http() =>
        AssertNone(Application, "MantralayaYatra.Infrastructure", "MantralayaYatra.Api", "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Microsoft.Data.SqlClient");

    [Fact]
    public void Infrastructure_does_not_reach_up_into_the_api() =>
        AssertNone(Infrastructure, "MantralayaYatra.Api");

    /// <summary>Control: proves the matcher sees real references, and that "MantralayaYatra.Api" is not a prefix match for "MantralayaYatra.Application".</summary>
    [Fact]
    public void The_dependency_check_detects_a_real_reference()
    {
        Assert.False(Types.InAssembly(Infrastructure).ShouldNot().HaveDependencyOn("MantralayaYatra.Application").GetResult().IsSuccessful);
        Assert.True(Types.InAssembly(Application).ShouldNot().HaveDependencyOn("MantralayaYatra.Api").GetResult().IsSuccessful);
    }

    private static void AssertNone(Assembly assembly, params string[] forbidden)
    {
        var result = Types.InAssembly(assembly).ShouldNot().HaveDependencyOnAny(forbidden).GetResult();
        var offenders = result.FailingTypeNames ?? [];
        Assert.True(result.IsSuccessful, $"{assembly.GetName().Name} must not reference {string.Join(", ", offenders)}; forbidden: {string.Join(", ", forbidden)}");
    }
}
