using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.UnitTests;

/// <summary>One yatra (1 to 8 Dec 2026) with the four sevas, a volunteer signed in, and builders for push payloads.</summary>
internal sealed class World
{
    public static readonly DateOnly Day1 = new(2026, 12, 1);
    public static readonly DateOnly Day4 = new(2026, 12, 4);

    /// <summary>9 am IST on day 1.</summary>
    public static readonly DateTimeOffset Morning = new(2026, 12, 1, 9, 0, 0, TimeSpan.FromHours(5.5));

    public World()
    {
        Yatra = new Yatra { Id = Context.YatraId, Name = "Mantralaya Yatra 2026", StartsOn = Day1, EndsOn = new DateOnly(2026, 12, 8) };
        Store = new FakeLedgerStore(Yatra);
        Directory.Yatras.Add(Yatra);
        Directory.Members.Add(new YatraMember
        {
            Id = Guid.NewGuid(),
            YatraId = Yatra.Id,
            UserId = User.UserId,
            Email = "volunteer@example.com",
            DisplayName = "Ramesh",
            Role = MemberRole.Volunteer,
        });

        foreach (var sevaType in SevaType.DefaultsFor(Yatra.Id))
        {
            Store.Seed(sevaType);
        }
    }

    public FakeUser User { get; } = new();

    public FakeYatraContext Context { get; } = new();

    public FixedTime Time { get; } = new(Morning.AddHours(1));

    public FakeYatraDirectory Directory { get; } = new();

    public Yatra Yatra { get; }

    public FakeLedgerStore Store { get; }

    public Guid DeviceId { get; } = Guid.NewGuid();

    public SevaType Seva(string code) => Store.Rows.OfType<SevaType>().Single(s => s.Code == code);

    public PushLedgerEntries Push => new(Store, User, Context, Time);

    public PullLedgerChanges Pull => new(Store);

    public void SignInAs(MemberRole role) => Context.Role = role;

    public async Task<LedgerPushResponse> PushAsync(
        IReadOnlyList<BookingIn>? bookings = null,
        IReadOnlyList<PaymentIn>? payments = null,
        IReadOnlyList<ReversalIn>? reversals = null)
    {
        var result = await Push.HandleAsync(new LedgerPushRequest(DeviceId, bookings ?? [], payments ?? [], reversals ?? []), CancellationToken.None);
        Assert.True(result.IsSuccess, result.Error?.Message);
        return result.Value;
    }

    public static BookingIn Booking(
        string code = "SRV",
        DateOnly? date = null,
        long amountPaise = 100100,
        string devotee = "Venkatesh Kulkarni",
        SankalpaDto? sankalpa = null,
        DateTimeOffset? recordedAt = null,
        Guid? id = null) =>
        new(
            id ?? Guid.NewGuid(),
            code,
            date ?? Day4,
            devotee,
            null,
            sankalpa ?? new SankalpaDto("Venkatesh Kulkarni & family", "Vasishta", "Ashwini", "Mesha", null),
            amountPaise,
            $"{code}-D-RAM-{Random.Shared.Next(1, 9999):0000}",
            recordedAt ?? Morning);

    public static PaymentIn Payment(Guid bookingId, long amountPaise = 100100, string mode = "upi", DateTimeOffset? recordedAt = null, Guid? id = null) =>
        new(id ?? Guid.NewGuid(), bookingId, amountPaise, mode, mode == "cash" ? null : "412345", recordedAt ?? Morning);

    public static ReversalIn ReversalOf(Guid entryId, string reason = "Booked twice by mistake", Guid? id = null) =>
        new(id ?? Guid.NewGuid(), entryId, reason, Morning.AddMinutes(30));
}
