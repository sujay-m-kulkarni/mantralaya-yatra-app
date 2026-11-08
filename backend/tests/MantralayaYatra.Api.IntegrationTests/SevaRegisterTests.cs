using System.Net;
using System.Net.Http.Json;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Application.Register;
using MantralayaYatra.Application.Yatras;

namespace MantralayaYatra.Api.IntegrationTests;

public class SevaRegisterTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    // Dates follow the real clock: the server refuses entries recorded in the future.
    private static readonly DateTimeOffset Morning = DateTimeOffset.UtcNow.AddMinutes(-30).ToOffset(TimeSpan.FromHours(5.5));
    private static readonly DateOnly Start = DateOnly.FromDateTime(Morning.DateTime);
    private static readonly DateOnly SevaDay = Start.AddDays(3);
    private static readonly string SevaDayText = SevaDay.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    [Fact]
    public async Task A_volunteer_books_and_takes_payment_and_the_accountant_sees_it_in_the_register()
    {
        var (accounts, yatraId) = await NewYatraAsync();
        var volunteer = await AddMemberAsync(accounts, yatraId, "volunteer");

        var booking = Booking("SRV");
        var pushed = await PushAsync(volunteer, yatraId, new LedgerPushRequest(Guid.NewGuid(), [booking], [Payment(booking.Id, "upi")], null));

        Assert.All(pushed.Results, r => Assert.Equal(EntryStatus.Applied, r.Status));
        Assert.Equal("SRV-0001", pushed.Results[0].ReceiptNo);

        var register = await accounts.GetFromJsonAsync<DailyRegisterResponse>($"{Base(yatraId)}/register?date={SevaDayText}");
        var line = Assert.Single(register!.Lines);
        Assert.Equal("SRV-0001", line.ReceiptNo);
        Assert.Equal("Vasishta", line.Sankalpa!.Gotra);
        Assert.Equal(0, line.PendingPaise);
        Assert.Equal(4, register.DayNumber);

        var priest = await accounts.GetFromJsonAsync<PriestListResponse>($"{Base(yatraId)}/register/priest-list?date={SevaDayText}");
        Assert.Equal("Venkatesh Kulkarni", priest!.Sevas.Single().Entries.Single().DevoteeName);
    }

    [Fact]
    public async Task Two_phones_booking_offline_get_distinct_final_receipts_and_see_each_others_entries()
    {
        var (accounts, yatraId) = await NewYatraAsync();
        var phoneA = await AddMemberAsync(accounts, yatraId, "volunteer");
        var phoneB = await AddMemberAsync(accounts, yatraId, "volunteer");

        var a = await PushAsync(phoneA, yatraId, new LedgerPushRequest(Guid.NewGuid(), [Booking("SRV"), Booking("SRV")], null, null));
        var b = await PushAsync(phoneB, yatraId, new LedgerPushRequest(Guid.NewGuid(), [Booking("SRV")], null, null));

        Assert.Equal(new[] { "SRV-0001", "SRV-0002" }, a.Results.Select(r => r.ReceiptNo));
        Assert.Equal("SRV-0003", b.Results.Single().ReceiptNo);

        var pulled = await phoneA.GetFromJsonAsync<LedgerPullResponse>($"{Base(yatraId)}/sync/pull?after={a.HighestSeq}");
        Assert.Equal("SRV-0003", pulled!.Changes.Single().Booking!.ReceiptNo);
    }

    [Fact]
    public async Task A_retried_push_is_a_duplicate()
    {
        var (accounts, yatraId) = await NewYatraAsync();
        var request = new LedgerPushRequest(Guid.NewGuid(), [Booking("AST")], null, null);

        var first = await PushAsync(accounts, yatraId, request);
        var retry = await PushAsync(accounts, yatraId, request);

        Assert.Equal(EntryStatus.Duplicate, retry.Results.Single().Status);
        Assert.Equal(first.Results.Single().ReceiptNo, retry.Results.Single().ReceiptNo);
    }

    [Fact]
    public async Task Only_the_accountant_reverses_and_a_reversal_shows_in_the_register()
    {
        var (accounts, yatraId) = await NewYatraAsync();
        var volunteer = await AddMemberAsync(accounts, yatraId, "volunteer");
        var booking = Booking("SSA");
        await PushAsync(volunteer, yatraId, new LedgerPushRequest(Guid.NewGuid(), [booking], [Payment(booking.Id, "cash")], null));

        var byVolunteer = await PushAsync(volunteer, yatraId, Reverse(booking.Id));
        var byAccounts = await PushAsync(accounts, yatraId, Reverse(booking.Id));

        Assert.Equal(EntryStatus.Rejected, byVolunteer.Results.Single().Status);
        Assert.Equal(EntryStatus.Applied, byAccounts.Results.Single().Status);
        var register = await accounts.GetFromJsonAsync<DailyRegisterResponse>($"{Base(yatraId)}/register?date={SevaDayText}");
        Assert.True(register!.Lines.Single().IsReversed);
        Assert.Equal(booking.AmountPaise, register.Totals.RefundDuePaise);
    }

    [Fact]
    public async Task A_rate_set_by_the_accountant_reaches_phones_on_their_next_pull()
    {
        var (accounts, yatraId) = await NewYatraAsync();
        var volunteer = await AddMemberAsync(accounts, yatraId, "volunteer");
        var first = await volunteer.GetFromJsonAsync<LedgerPullResponse>($"{Base(yatraId)}/sync/pull");

        var saved = await accounts.PutAsJsonAsync($"{Base(yatraId)}/seva-types/HST", new SevaTypeIn("Hastodaka", 250100, 1, true, true, 3));
        var next = await volunteer.GetFromJsonAsync<LedgerPullResponse>($"{Base(yatraId)}/sync/pull?after={first!.NextAfter}");

        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(4, first.Changes.Count(c => c.Kind == EntryKinds.SevaType));
        var hastodaka = next!.Changes.Single().SevaType!;
        Assert.Equal(250100, hastodaka.RatePaise);
        Assert.Equal(1, hastodaka.DailyLimit);
    }

    [Fact]
    public async Task A_deleted_seva_stays_in_the_database_marked_deleted_and_can_be_restored()
    {
        var (accounts, yatraId) = await NewYatraAsync();
        var first = await accounts.GetFromJsonAsync<LedgerPullResponse>($"{Base(yatraId)}/sync/pull");

        var deleted = await accounts.DeleteAsync($"{Base(yatraId)}/seva-types/HST");
        var next = await accounts.GetFromJsonAsync<LedgerPullResponse>($"{Base(yatraId)}/sync/pull?after={first!.NextAfter}");
        var newBooking = await accounts.PostAsJsonAsync($"{Base(yatraId)}/sync/push", new LedgerPushRequest(Guid.NewGuid(), [Booking("HST") with { RecordedAt = DateTimeOffset.UtcNow.AddMinutes(1) }], null, null));
        var restored = await accounts.PostAsync($"{Base(yatraId)}/seva-types/HST/restore", null);

        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        var pulled = next!.Changes.Single().SevaType!;
        Assert.NotNull(pulled.DeletedAt);
        Assert.False(pulled.IsActive);
        var push = await newBooking.Content.ReadFromJsonAsync<LedgerPushResponse>();
        Assert.Equal(EntryStatus.Rejected, push!.Results.Single().Status);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        Assert.Null((await restored.Content.ReadFromJsonAsync<SevaTypeOut>())!.DeletedAt);
    }

    [Fact]
    public async Task Members_see_only_their_yatras_and_roles_are_enforced()
    {
        var (accounts, yatraId) = await NewYatraAsync();
        var viewer = await AddMemberAsync(accounts, yatraId, "viewer");
        var stranger = api.ClientFor($"stranger-{Guid.NewGuid():N}@example.com");

        var strangerRegister = await stranger.GetAsync($"{Base(yatraId)}/register?date={SevaDayText}");
        var viewerPush = await viewer.PostAsJsonAsync($"{Base(yatraId)}/sync/push", new LedgerPushRequest(Guid.NewGuid(), [Booking("SRV")], null, null));
        var viewerRegister = await viewer.GetAsync($"{Base(yatraId)}/register?date={SevaDayText}");
        var viewerSeva = await viewer.PutAsJsonAsync($"{Base(yatraId)}/seva-types/SRV", new SevaTypeIn("Sarva Seva", 1, null, true, true, 2));

        Assert.Equal(HttpStatusCode.NotFound, strangerRegister.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, viewerPush.StatusCode);
        Assert.Equal(HttpStatusCode.OK, viewerRegister.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, viewerSeva.StatusCode);
    }

    [Fact]
    public async Task Two_yatras_keep_separate_books_and_receipt_series()
    {
        var (first, firstId) = await NewYatraAsync();
        var (second, secondId) = await NewYatraAsync();

        await PushAsync(first, firstId, new LedgerPushRequest(Guid.NewGuid(), [Booking("SRV")], null, null));
        var other = await PushAsync(second, secondId, new LedgerPushRequest(Guid.NewGuid(), [Booking("SRV")], null, null));

        Assert.Equal("SRV-0001", other.Results.Single().ReceiptNo);
        var register = await second.GetFromJsonAsync<DailyRegisterResponse>($"{Base(secondId)}/register?date={SevaDayText}");
        Assert.Single(register!.Lines);
        var crossed = await second.GetAsync($"{Base(firstId)}/register?date={SevaDayText}");
        Assert.Equal(HttpStatusCode.NotFound, crossed.StatusCode);
    }

    private async Task<(HttpClient Client, Guid YatraId)> NewYatraAsync()
    {
        var client = api.ClientFor($"accounts-{Guid.NewGuid():N}@example.com");
        var response = await client.PostAsJsonAsync("/api/v1/yatras", new CreateYatraRequest("Mantralaya Yatra 2026", Start, Start.AddDays(7), "Accounts"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var yatra = await response.Content.ReadFromJsonAsync<YatraOut>();

        // A new yatra has no sevas; the accountant creates them, each with its price.
        foreach (var (code, name, order) in new[] { ("SSA", "Sarva Samarpana Seva", 1), ("SRV", "Sarva Seva", 2), ("HST", "Hastodaka", 3), ("AST", "Ashtottara", 4) })
        {
            var saved = await client.PutAsJsonAsync($"{Base(yatra!.Id)}/seva-types/{code}", new SevaTypeIn(name, 100100, null, true, true, order));
            Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        }

        return (client, yatra!.Id);
    }

    private async Task<HttpClient> AddMemberAsync(HttpClient accounts, Guid yatraId, string role)
    {
        var email = $"{role}-{Guid.NewGuid():N}@example.com";
        var response = await accounts.PostAsJsonAsync($"{Base(yatraId)}/members", new AddMemberRequest(email, role, role));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return api.ClientFor(email);
    }

    private static async Task<LedgerPushResponse> PushAsync(HttpClient client, Guid yatraId, LedgerPushRequest request)
    {
        var response = await client.PostAsJsonAsync($"{Base(yatraId)}/sync/push", request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<LedgerPushResponse>())!;
    }

    private static string Base(Guid yatraId) => $"/api/v1/yatras/{yatraId}";

    private static BookingIn Booking(string code) => new(
        Guid.NewGuid(),
        code,
        SevaDay,
        "Venkatesh Kulkarni",
        null,
        new SankalpaDto("Venkatesh Kulkarni & family", "Vasishta", "Ashwini", "Mesha", null),
        100100,
        $"{code}-D-T-{Random.Shared.Next(1, 9999):0000}",
        Morning);

    private static PaymentIn Payment(Guid bookingId, string mode) =>
        new(Guid.NewGuid(), bookingId, 100100, mode, mode == "cash" ? null : "412345", Morning);

    private static LedgerPushRequest Reverse(Guid entryId) =>
        new(Guid.NewGuid(), null, null, [new ReversalIn(Guid.NewGuid(), entryId, "Booked twice", Morning.AddMinutes(10))]);
}
