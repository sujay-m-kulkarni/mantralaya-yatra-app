using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Application.Register;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.UnitTests;

public class PullLedgerChangesTests
{
    private readonly World _world = new();

    [Fact]
    public async Task A_first_pull_returns_the_seva_types_then_every_entry_in_sequence_order()
    {
        var booking = World.Booking();
        await _world.PushAsync([booking], [World.Payment(booking.Id)]);

        var pulled = (await _world.Pull.HandleAsync(after: null, limit: null, CancellationToken.None)).Value;

        Assert.Equal(new[] { "sevaType", "sevaType", "sevaType", "sevaType", "booking", "payment" }, pulled.Changes.Select(c => c.Kind));
        Assert.Equal("SRV", pulled.Changes[4].Booking!.SevaCode);
        Assert.Equal("SRV-0001", pulled.Changes[4].Booking!.ReceiptNo);
        Assert.Equal("upi", pulled.Changes[5].Payment!.Mode);
        Assert.False(pulled.HasMore);
        Assert.Equal(pulled.Changes[^1].Seq, pulled.NextAfter);
    }

    [Fact]
    public async Task Pages_follow_the_cursor_and_an_empty_page_keeps_it()
    {
        await _world.PushAsync([World.Booking(), World.Booking()]);

        var first = (await _world.Pull.HandleAsync(0, 4, CancellationToken.None)).Value;
        var second = (await _world.Pull.HandleAsync(first.NextAfter, 4, CancellationToken.None)).Value;
        var third = (await _world.Pull.HandleAsync(second.NextAfter, 4, CancellationToken.None)).Value;

        Assert.True(first.HasMore);
        Assert.Equal(2, second.Changes.Count);
        Assert.False(second.HasMore);
        Assert.Empty(third.Changes);
        Assert.Equal(second.NextAfter, third.NextAfter);
    }

    [Theory]
    [InlineData(-1L, null)]
    [InlineData(0L, 0)]
    [InlineData(0L, PullLedgerChanges.MaxLimit + 1)]
    public async Task Bad_cursors_and_limits_are_refused(long after, int? limit)
    {
        var result = await _world.Pull.HandleAsync(after, limit, CancellationToken.None);

        Assert.False(result.IsSuccess);
    }
}

public class DailyRegisterTests
{
    private readonly World _world = new();

    private GetDailyRegister Register => new(_world.Store, _world.Directory, _world.Context);

    private GetPriestList PriestList => new(_world.Store);

    [Fact]
    public async Task The_register_shows_paid_pending_and_counts_for_the_seva_day()
    {
        var paid = World.Booking("SRV", amountPaise: 100100);
        var unpaid = World.Booking("AST", amountPaise: 25100, devotee: "Anand");
        await _world.PushAsync([paid, unpaid], [World.Payment(paid.Id, mode: "cash")]);

        var register = (await Register.HandleAsync(World.Day4, CancellationToken.None)).Value;

        Assert.Equal(4, register.DayNumber);
        Assert.Equal(2, register.Totals.BookingCount);
        Assert.Equal(25100, register.Totals.PendingPaise);
        var srv = register.Lines.Single(l => l.SevaCode == "SRV");
        Assert.Equal("SRV-0001", srv.ReceiptNo);
        Assert.Equal(new[] { "cash" }, srv.Modes);
        Assert.Equal("Ramesh", srv.RecordedBy);
        Assert.Equal(1, register.Sevas.Single(s => s.Code == "AST").Count);
        Assert.Equal(4, register.Sevas.Count);
    }

    [Fact]
    public async Task Collections_are_counted_on_the_day_the_money_was_taken_not_the_seva_day()
    {
        // Booked and paid on day 1 for a seva on day 4.
        var advance = World.Booking("SRV", date: World.Day4);
        await _world.PushAsync([advance], [World.Payment(advance.Id, mode: "upi", recordedAt: World.Morning)]);

        var day1 = (await Register.HandleAsync(World.Day1, CancellationToken.None)).Value;
        var day4 = (await Register.HandleAsync(World.Day4, CancellationToken.None)).Value;

        Assert.Equal(100100, day1.Totals.UpiPaise);
        Assert.Empty(day1.Lines);
        Assert.Equal(0, day4.Totals.CollectedPaise);
        Assert.Single(day4.Lines);
    }

    [Fact]
    public async Task Reversals_take_money_out_of_the_totals_and_show_refunds_due()
    {
        var booking = World.Booking("SRV");
        var cash = World.Payment(booking.Id, 40000, "cash");
        await _world.PushAsync([booking], [cash]);
        _world.SignInAs(MemberRole.Accounts);
        await _world.PushAsync(reversals: [World.ReversalOf(booking.Id)]);

        var register = (await Register.HandleAsync(World.Day4, CancellationToken.None)).Value;
        var day1 = (await Register.HandleAsync(World.Day1, CancellationToken.None)).Value;

        var line = register.Lines.Single();
        Assert.True(line.IsReversed);
        Assert.Equal(40000, line.RefundDuePaise);
        Assert.Equal(40000, register.Totals.RefundDuePaise);
        Assert.Equal(0, register.Totals.PendingPaise);
        Assert.Equal(0, register.Totals.BookingCount);
        // The cash was taken on day 1 and has not been handed back yet, so the cash box still holds it.
        Assert.Equal(40000, day1.Totals.CashPaise);
    }

    [Fact]
    public async Task A_reversed_payment_leaves_the_cash_total()
    {
        var booking = World.Booking("SRV");
        var cash = World.Payment(booking.Id, 100100, "cash");
        await _world.PushAsync([booking], [cash]);
        _world.SignInAs(MemberRole.Accounts);
        await _world.PushAsync(reversals: [World.ReversalOf(cash.Id, "Entered as cash, was UPI")]);

        var day1 = (await Register.HandleAsync(World.Day1, CancellationToken.None)).Value;
        var day4 = (await Register.HandleAsync(World.Day4, CancellationToken.None)).Value;

        Assert.Equal(0, day1.Totals.CashPaise);
        Assert.Equal(100100, day4.Totals.PendingPaise);
    }

    [Fact]
    public async Task The_priest_list_groups_by_seva_in_order_and_leaves_out_reversed_bookings()
    {
        var keep = World.Booking("AST", devotee: "Gopal Hegde", sankalpa: new SankalpaDto("Gopal", "Gautama", "Revati", null, "Birthday"));
        var drop = World.Booking("AST", devotee: "Duplicate");
        var first = World.Booking("SSA", devotee: "Raghavendra Rao");
        await _world.PushAsync([keep, drop, first]);
        _world.SignInAs(MemberRole.Accounts);
        await _world.PushAsync(reversals: [World.ReversalOf(drop.Id)]);

        var list = (await PriestList.HandleAsync(World.Day4, CancellationToken.None)).Value;

        Assert.Equal(new[] { "SSA", "AST" }, list.Sevas.Select(s => s.Code));
        var ast = list.Sevas[1].Entries.Single();
        Assert.Equal("Gopal Hegde", ast.DevoteeName);
        Assert.Equal("Gautama", ast.Gotra);
        Assert.Equal("Birthday", ast.Occasion);
        Assert.Equal("Mantralaya Yatra 2026", list.YatraName);
    }
}
