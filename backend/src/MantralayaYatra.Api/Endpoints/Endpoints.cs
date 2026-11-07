using MantralayaYatra.Api.Auth;
using MantralayaYatra.Application.Common;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Application.Register;
using MantralayaYatra.Application.Yatras;

namespace MantralayaYatra.Api.Endpoints;

public static class YatraEndpoints
{
    /// <summary>Routes that are not about one yatra: listing and creating them.</summary>
    public static RouteGroupBuilder MapYatras(this RouteGroupBuilder group)
    {
        var yatras = group.MapGroup("/yatras").WithTags("Yatras");

        yatras.MapGet("", async (ListMyYatras useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(ct)).ToHttpResult())
            .WithName("ListMyYatras")
            .WithSummary("The yatras the signed-in person belongs to, with their role. Claims waiting invitations.");

        yatras.MapPost("", async (CreateYatraRequest request, CreateYatra useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttpResult())
            .WithName("CreateYatra")
            .WithSummary("Creates a yatra. The creator becomes its accountant; the four sevas are seeded without rates.");

        return group;
    }

    /// <summary>Routes about one yatra. Every one of them runs after the caller's membership is checked.</summary>
    public static RouteGroupBuilder MapYatraScoped(this RouteGroupBuilder group)
    {
        var yatra = group.MapGroup($"/yatras/{{{ResolveMembership.RouteKey}:guid}}")
            .AddEndpointFilter(ResolveMembership.FilterAsync);

        var members = yatra.MapGroup("/members").WithTags("Members");
        members.MapGet("", async (ListMembers useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(ct)).ToHttpResult())
            .WithName("ListMembers");
        members.MapPost("", async (AddMemberRequest request, AddMember useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttpResult())
            .WithName("AddMember")
            .WithSummary("Accountant only. Adds a member by email; they get access when they first sign in with it.");

        var sevas = yatra.MapGroup("/seva-types").WithTags("Sevas");
        sevas.MapGet("", async (ListSevaTypes useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(ct)).ToHttpResult())
            .WithName("ListSevaTypes");
        sevas.MapPut("/{code}", async (string code, SevaTypeIn request, SaveSevaType useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(code, request, ct)).ToHttpResult())
            .WithName("SaveSevaType")
            .WithSummary("Accountant only. Creates or updates a seva: name, rate, daily limit, sankalpa, active.");

        var sync = yatra.MapGroup("/sync").WithTags("Sync");
        sync.MapPost("/push", async (LedgerPushRequest request, PushLedgerEntries useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttpResult())
            .WithName("PushLedgerEntries")
            .WithSummary("Accepts bookings, payments and reversals from one phone. Returns final receipt numbers.");
        sync.MapGet("/pull", async (long? after, int? limit, PullLedgerChanges useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(after, limit, ct)).ToHttpResult())
            .WithName("PullLedgerChanges")
            .WithSummary("Seva types and entries from every member's phone written after the cursor.");

        var register = yatra.MapGroup("/register").WithTags("Register");
        register.MapGet("", async (DateOnly date, GetDailyRegister useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(date, ct)).ToHttpResult())
            .WithName("GetDailyRegister")
            .WithSummary("One day's sevas, with collections by mode, pending amounts and slot usage.");
        register.MapGet("/priest-list", async (DateOnly date, GetPriestList useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(date, ct)).ToHttpResult())
            .WithName("GetPriestList")
            .WithSummary("The day's sevas grouped by type with sankalpa details, for the priest.");

        return group;
    }

    public static IResult ToHttpResult<T>(this Result<T> result)
    {
        if (result.IsSuccess)
        {
            return TypedResults.Ok(result.Value);
        }

        var error = result.Error!;
        var status = error.Kind switch
        {
            ErrorKind.TooLarge => StatusCodes.Status413PayloadTooLarge,
            ErrorKind.Forbidden => StatusCodes.Status403Forbidden,
            ErrorKind.NotFound => StatusCodes.Status404NotFound,
            ErrorKind.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status422UnprocessableEntity,
        };

        return TypedResults.Problem(
            title: error.Message,
            statusCode: status,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }
}
