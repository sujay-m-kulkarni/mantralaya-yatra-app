using MantralayaYatra.Application.Common;
using MantralayaYatra.Application.Yatras;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.UnitTests;

public class YatraUseCaseTests
{
    private readonly World _world = new();

    private CreateYatra Create => new(_world.Directory, _world.User, _world.Time);

    private AddMember AddMember => new(_world.Directory, _world.Context, _world.Time);

    private SaveSevaType SaveSeva => new(_world.Store, _world.Context);

    [Fact]
    public async Task The_creator_becomes_the_accountant_and_the_four_sevas_are_seeded()
    {
        var result = await Create.HandleAsync(
            new CreateYatraRequest("  Mantralaya Yatra 2027 ", new DateOnly(2027, 1, 10), new DateOnly(2027, 1, 15), "Sujay"),
            CancellationToken.None);

        var yatra = result.Value;
        Assert.Equal("Mantralaya Yatra 2027", yatra.Name);
        Assert.Equal("accounts", yatra.Role);
        var founder = _world.Directory.Members.Single(m => m.YatraId == yatra.Id);
        Assert.Equal(MemberRole.Accounts, founder.Role);
        Assert.Equal(_world.User.UserId, founder.UserId);
        Assert.Equal("Sujay", founder.DisplayName);
        Assert.Equal(4, _world.Directory.SeededSevaTypes.Count);
    }

    [Fact]
    public async Task The_owner_signed_in_with_the_api_key_has_no_email_and_still_starts_a_yatra()
    {
        _world.User.Email = null;

        var result = await Create.HandleAsync(
            new CreateYatraRequest("Mantralaya Yatra 2027", new DateOnly(2027, 1, 10), new DateOnly(2027, 1, 15), null),
            CancellationToken.None);

        Assert.Equal("accounts", result.Value.Role);
        var founder = _world.Directory.Members.Single(m => m.YatraId == result.Value.Id);
        Assert.Equal("Accountant", founder.DisplayName);
        Assert.Equal("", founder.Email);
    }

    [Theory]
    [InlineData("", "2027-01-10", "2027-01-15")]
    [InlineData("Yatra", "2027-01-15", "2027-01-10")]
    [InlineData("Yatra", "2027-01-01", "2027-03-31")]
    public async Task A_yatra_needs_a_name_and_sensible_dates(string name, string startsOn, string endsOn)
    {
        var result = await Create.HandleAsync(
            new CreateYatraRequest(name, DateOnly.Parse(startsOn), DateOnly.Parse(endsOn), null),
            CancellationToken.None);

        Assert.Equal(ErrorKind.Validation, result.Error!.Kind);
    }

    [Fact]
    public async Task Only_the_accountant_adds_members_and_an_email_is_added_once()
    {
        var request = new AddMemberRequest(" Suma@Example.com ", "Suma", "volunteer");

        var asVolunteer = await AddMember.HandleAsync(request, CancellationToken.None);
        _world.SignInAs(MemberRole.Accounts);
        var added = await AddMember.HandleAsync(request, CancellationToken.None);
        var again = await AddMember.HandleAsync(request with { Email = "suma@example.com" }, CancellationToken.None);

        Assert.Equal(ErrorKind.Forbidden, asVolunteer.Error!.Kind);
        Assert.Equal("suma@example.com", added.Value.Email);
        Assert.False(added.Value.HasSignedIn);
        Assert.Equal(ErrorKind.Conflict, again.Error!.Kind);
    }

    [Fact]
    public async Task An_invitation_is_claimed_when_that_email_first_lists_its_yatras()
    {
        _world.SignInAs(MemberRole.Accounts);
        await AddMember.HandleAsync(new AddMemberRequest("suma@example.com", "Suma", "viewer"), CancellationToken.None);
        var suma = new FakeUser { Email = "SUMA@example.com" };

        var yatras = (await new ListMyYatras(_world.Directory, suma).HandleAsync(CancellationToken.None)).Value;

        Assert.Equal("viewer", yatras.Single().Role);
        Assert.Equal(suma.UserId, _world.Directory.Members.Single(m => m.Email == "suma@example.com").UserId);
    }

    [Fact]
    public async Task The_accountant_sets_a_rate_and_the_change_gets_a_new_sequence_number()
    {
        _world.SignInAs(MemberRole.Accounts);
        var before = _world.Seva("SRV").ServerSeq;

        var saved = await SaveSeva.HandleAsync("SRV", new SevaTypeIn("Sarva Seva", 100100, null, true, true, 2), CancellationToken.None);

        Assert.Equal(100100, saved.Value.RatePaise);
        Assert.True(_world.Seva("SRV").ServerSeq > before);
    }

    [Fact]
    public async Task A_new_code_adds_a_seva()
    {
        _world.SignInAs(MemberRole.Accounts);

        await SaveSeva.HandleAsync("ANN", new SevaTypeIn("Annadana", 50000, null, false, true, 5), CancellationToken.None);

        Assert.Equal("Annadana", _world.Seva("ANN").Name);
        Assert.Equal(_world.Yatra.Id, _world.Seva("ANN").YatraId);
    }

    [Theory]
    [InlineData("srv", 100100L, null)]
    [InlineData("SRV", 0L, null)]
    [InlineData("SRV", 100100L, 0)]
    public async Task Seva_changes_are_validated(string code, long? rate, int? limit)
    {
        _world.SignInAs(MemberRole.Accounts);

        var result = await SaveSeva.HandleAsync(code, new SevaTypeIn("Sarva Seva", rate, limit, true, true, 2), CancellationToken.None);

        Assert.Equal(ErrorKind.Validation, result.Error!.Kind);
    }

    [Fact]
    public async Task Volunteers_cannot_change_sevas()
    {
        var result = await SaveSeva.HandleAsync("SRV", new SevaTypeIn("Sarva Seva", 1, null, true, true, 2), CancellationToken.None);

        Assert.Equal(ErrorKind.Forbidden, result.Error!.Kind);
    }
}
