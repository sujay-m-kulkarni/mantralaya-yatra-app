using MantralayaYatra.Application.Common;
using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Application.UnitTests;

public class PushLedgerEntriesTests
{
    private readonly World _world = new();

    [Fact]
    public async Task A_booking_and_its_payment_in_one_push_are_both_applied_and_the_booking_gets_its_final_receipt()
    {
        var booking = World.Booking();

        var response = await _world.PushAsync([booking], [World.Payment(booking.Id)]);

        Assert.All(response.Results, r => Assert.Equal(EntryStatus.Applied, r.Status));
        Assert.Equal("SRV-0001", response.Results[0].ReceiptNo);
        Assert.Equal(response.Results.Max(r => r.Seq), response.HighestSeq);
        Assert.Equal(1, _world.Store.TransactionCount);

        var stored = _world.Store.Bookings.Single();
        Assert.Equal(_world.User.UserId, stored.RecordedBy);
        Assert.Equal(_world.DeviceId, stored.DeviceId);
        Assert.Equal(World.Morning, stored.RecordedAt);
        Assert.Equal(_world.Time.Now, stored.ReceivedAt);
    }

    [Fact]
    public async Task Receipt_numbers_run_separately_for_each_seva()
    {
        var response = await _world.PushAsync([World.Booking("SRV"), World.Booking("SRV"), World.Booking("HST"), World.Booking("SRV")]);

        Assert.Equal(new[] { "SRV-0001", "SRV-0002", "HST-0001", "SRV-0003" }, response.Results.Select(r => r.ReceiptNo));
    }

    [Fact]
    public async Task A_retried_push_is_answered_duplicate_with_the_same_receipt_and_writes_nothing()
    {
        var booking = World.Booking();
        var payment = World.Payment(booking.Id);
        var first = await _world.PushAsync([booking], [payment]);
        var rowCount = _world.Store.Rows.Count;

        var retry = await _world.PushAsync([booking], [payment]);

        Assert.All(retry.Results, r => Assert.Equal(EntryStatus.Duplicate, r.Status));
        Assert.Equal(first.Results[0].ReceiptNo, retry.Results[0].ReceiptNo);
        Assert.Equal(first.Results[0].Seq, retry.Results[0].Seq);
        Assert.Equal(0, retry.HighestSeq);
        Assert.Equal(rowCount, _world.Store.Rows.Count);
    }

    [Fact]
    public async Task An_accepted_entry_cannot_be_edited_by_pushing_its_id_again()
    {
        var booking = World.Booking(amountPaise: 100100);
        await _world.PushAsync([booking]);

        var edited = await _world.PushAsync([booking with { AmountPaise = 50000 }]);

        Assert.Equal(EntryStatus.Rejected, edited.Results.Single().Status);
        Assert.Contains("cannot be edited", edited.Results.Single().Error);
        Assert.Equal(100100, _world.Store.Bookings.Single().AmountPaise);
    }

    [Fact]
    public async Task A_rejected_entry_does_not_stop_the_rest_of_the_batch()
    {
        var response = await _world.PushAsync([World.Booking("XYZ"), World.Booking("SRV")]);

        Assert.Equal(EntryStatus.Rejected, response.Results[0].Status);
        Assert.Contains("Unknown seva", response.Results[0].Error);
        Assert.Equal(EntryStatus.Applied, response.Results[1].Status);
        Assert.Equal("SRV-0001", response.Results[1].ReceiptNo);
    }

    [Fact]
    public async Task A_seva_date_outside_the_yatra_is_rejected()
    {
        var response = await _world.PushAsync([World.Booking(date: new DateOnly(2026, 12, 9))]);

        Assert.Equal(EntryStatus.Rejected, response.Results.Single().Status);
    }

    [Fact]
    public async Task A_seva_that_needs_sankalpa_is_rejected_without_it_and_blank_fields_count_as_none()
    {
        var response = await _world.PushAsync([World.Booking(sankalpa: new SankalpaDto(" ", "", null, null, null))]);

        Assert.Equal(EntryStatus.Rejected, response.Results.Single().Status);
        Assert.Contains("sankalpa", response.Results.Single().Error);
    }

    [Fact]
    public async Task Text_is_trimmed_before_it_is_stored()
    {
        await _world.PushAsync([World.Booking(devotee: "  Padma Joshi ", sankalpa: new SankalpaDto(" Padma ", " Atreya ", "", null, null))]);

        var stored = _world.Store.Bookings.Single();
        Assert.Equal("Padma Joshi", stored.DevoteeName);
        Assert.Equal("Atreya", stored.Sankalpa!.Gotra);
        Assert.Null(stored.Sankalpa.Nakshatra);
    }

    [Fact]
    public async Task Booking_past_the_daily_limit_is_accepted_but_flagged_for_the_accountant()
    {
        _world.Seva("HST").DailyLimit = 1;

        var response = await _world.PushAsync([World.Booking("HST"), World.Booking("HST")]);

        Assert.All(response.Results, r => Assert.Equal(EntryStatus.Applied, r.Status));
        Assert.Null(response.Results[0].Warnings);
        Assert.Contains(EntryWarnings.DailyLimitExceeded, response.Results[1].Warnings!);
        var flagged = _world.Store.Bookings.Single(b => b.Id == response.Results[1].Id);
        Assert.True(flagged.NeedsReview);
        Assert.Contains("daily limit", flagged.ReviewReason);
    }

    [Fact]
    public async Task A_reversed_booking_frees_its_slot()
    {
        _world.Seva("HST").DailyLimit = 1;
        var first = World.Booking("HST");
        await _world.PushAsync([first]);
        _world.SignInAs(MemberRole.Accounts);
        await _world.PushAsync(reversals: [World.ReversalOf(first.Id)]);

        var second = await _world.PushAsync([World.Booking("HST")]);

        Assert.Null(second.Results.Single().Warnings);
    }

    [Fact]
    public async Task An_amount_other_than_the_set_rate_is_accepted_with_a_warning()
    {
        _world.Seva("SRV").RatePaise = 100100;

        var response = await _world.PushAsync([World.Booking(amountPaise: 100100), World.Booking(amountPaise: 200100)]);

        Assert.Null(response.Results[0].Warnings);
        Assert.Contains(EntryWarnings.AmountDiffersFromRate, response.Results[1].Warnings!);
    }

    [Fact]
    public async Task Part_payments_are_accepted_until_the_booking_is_paid_and_no_further()
    {
        var booking = World.Booking(amountPaise: 100100);
        await _world.PushAsync([booking], [World.Payment(booking.Id, 50000, "cash")]);

        var response = await _world.PushAsync(payments: [World.Payment(booking.Id, 50100), World.Payment(booking.Id, 1)]);

        Assert.Equal(EntryStatus.Applied, response.Results[0].Status);
        Assert.Equal(EntryStatus.Rejected, response.Results[1].Status);
        Assert.Contains("more than", response.Results[1].Error);
    }

    [Fact]
    public async Task A_payment_must_point_at_an_accepted_booking_that_is_not_reversed()
    {
        var booking = World.Booking();
        await _world.PushAsync([booking]);
        _world.SignInAs(MemberRole.Accounts);
        await _world.PushAsync(reversals: [World.ReversalOf(booking.Id)]);

        var response = await _world.PushAsync(payments: [World.Payment(Guid.NewGuid()), World.Payment(booking.Id)]);

        Assert.All(response.Results, r => Assert.Equal(EntryStatus.Rejected, r.Status));
        Assert.Contains("reversed", response.Results[1].Error);
    }

    [Fact]
    public async Task An_unknown_payment_mode_is_rejected()
    {
        var booking = World.Booking();

        var response = await _world.PushAsync([booking], [World.Payment(booking.Id, mode: "card")]);

        Assert.Equal(EntryStatus.Rejected, response.Results[1].Status);
    }

    [Fact]
    public async Task Only_the_accountant_can_reverse_and_only_once()
    {
        var booking = World.Booking();
        await _world.PushAsync([booking]);

        var byVolunteer = await _world.PushAsync(reversals: [World.ReversalOf(booking.Id)]);
        _world.SignInAs(MemberRole.Accounts);
        var byAccounts = await _world.PushAsync(reversals: [World.ReversalOf(booking.Id)]);
        var again = await _world.PushAsync(reversals: [World.ReversalOf(booking.Id)]);

        Assert.Equal(EntryStatus.Rejected, byVolunteer.Results.Single().Status);
        Assert.Contains("accountant", byVolunteer.Results.Single().Error);
        Assert.Equal(EntryStatus.Applied, byAccounts.Results.Single().Status);
        Assert.Equal(EntryStatus.Rejected, again.Results.Single().Status);
        Assert.Contains("already been reversed", again.Results.Single().Error);
    }

    [Fact]
    public async Task A_reversal_needs_a_reason_and_cannot_itself_be_reversed()
    {
        _world.SignInAs(MemberRole.Accounts);
        var booking = World.Booking();
        var reversal = World.ReversalOf(booking.Id);
        await _world.PushAsync([booking], reversals: [reversal]);

        var response = await _world.PushAsync(reversals: [World.ReversalOf(reversal.Id), World.ReversalOf(booking.Id, reason: "  ")]);

        Assert.All(response.Results, r => Assert.Equal(EntryStatus.Rejected, r.Status));
        Assert.Contains("cannot be reversed", response.Results[0].Error);
        Assert.Contains("reason", response.Results[1].Error);
    }

    [Fact]
    public async Task An_entry_dated_more_than_a_day_ahead_is_rejected_as_a_wrong_clock()
    {
        var response = await _world.PushAsync([World.Booking(recordedAt: _world.Time.Now.AddDays(2))]);

        Assert.Contains("clock", response.Results.Single().Error);
    }

    [Fact]
    public async Task Viewers_cannot_push()
    {
        _world.SignInAs(MemberRole.Viewer);

        var result = await _world.Push.HandleAsync(new LedgerPushRequest(_world.DeviceId, [World.Booking()], null, null), CancellationToken.None);

        Assert.Equal(ErrorKind.Forbidden, result.Error!.Kind);
        Assert.Empty(_world.Store.Bookings);
    }

    [Fact]
    public async Task A_push_needs_a_device_and_has_a_size_limit()
    {
        var noDevice = await _world.Push.HandleAsync(new LedgerPushRequest(Guid.Empty, [], [], []), CancellationToken.None);
        var tooMany = await _world.Push.HandleAsync(
            new LedgerPushRequest(_world.DeviceId, Enumerable.Range(0, PushLedgerEntries.MaxEntries + 1).Select(_ => World.Booking()).ToList(), null, null),
            CancellationToken.None);

        Assert.Equal("device_missing", noDevice.Error!.Code);
        Assert.Equal(ErrorKind.TooLarge, tooMany.Error!.Kind);
    }
}
