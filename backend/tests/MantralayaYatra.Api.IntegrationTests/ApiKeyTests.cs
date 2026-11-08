using System.Net;
using System.Net.Http.Json;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Application.Yatras;

namespace MantralayaYatra.Api.IntegrationTests;

/// <summary>The phone app's real sign-in: the API key in X-Api-Key, checked by the production handler.</summary>
public class ApiKeyTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5.5));

    [Fact]
    public async Task With_the_key_the_owner_creates_a_yatra_without_any_email_and_books_a_seva()
    {
        var owner = api.OwnerClient();

        var created = await owner.PostAsJsonAsync("/api/v1/yatras", new CreateYatraRequest("Mantralaya Yatra", Today, Today.AddDays(5), "Sujay"));
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var yatra = (await created.Content.ReadFromJsonAsync<YatraOut>())!;
        Assert.Equal("accounts", yatra.Role);

        // A new yatra starts with no sevas: the owner creates Ashtottara with its price.
        var seva = await owner.PutAsJsonAsync($"/api/v1/yatras/{yatra.Id}/seva-types/AST", new SevaTypeIn("Ashtottara", 25100, null, true, true, 1));
        Assert.Equal(HttpStatusCode.OK, seva.StatusCode);

        var booking = new BookingIn(Guid.NewGuid(), "AST", Today, "Gopal Hegde", null,
            new SankalpaDto("Gopal Hegde & family", "Kashyapa", "Rohini", "Vrishabha", null), 25100, "AST-D-SUJ-0001", DateTimeOffset.UtcNow.AddMinutes(-1));
        var pushed = await owner.PostAsJsonAsync($"/api/v1/yatras/{yatra.Id}/sync/push", new LedgerPushRequest(Guid.NewGuid(), [booking], null, null));
        var result = (await pushed.Content.ReadFromJsonAsync<LedgerPushResponse>())!;
        var entry = result.Results.Single();
        Assert.True(entry.Status == EntryStatus.Applied, entry.Error);
        Assert.Equal("AST-0001", entry.ReceiptNo);

        // A second phone with the same key is the same person and sees the yatra.
        var listed = await api.OwnerClient().GetFromJsonAsync<List<YatraOut>>("/api/v1/yatras");
        Assert.Contains(listed!, y => y.Id == yatra.Id);
    }

    [Theory]
    [InlineData("wrong-key-wrong-key-wrong-key-wrong-key")]
    [InlineData(null)]
    public async Task Without_the_right_key_nothing_is_readable(string? key)
    {
        var response = await api.OwnerClient(key).GetAsync("/api/v1/yatras");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Health_checks_need_no_key_so_Azure_and_the_pipeline_can_call_them()
    {
        var response = await api.OwnerClient(null).GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.Contains("X-Api-Version"));
    }
}
