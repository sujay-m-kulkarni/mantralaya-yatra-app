using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Yatras;

namespace MantralayaYatra.Domain.UnitTests;

public class BookingPositionTests
{
    private static readonly SevaBooking Booking = new() { Id = Guid.NewGuid(), AmountPaise = 100100 };

    [Fact]
    public void A_booking_with_no_payments_is_pending_in_full()
    {
        var position = BookingPosition.Of(Booking, [], []);

        Assert.Equal(0, position.PaidPaise);
        Assert.Equal(100100, position.PendingPaise);
        Assert.False(position.IsFullyPaid);
    }

    [Fact]
    public void Part_payments_add_up_and_only_this_bookings_payments_count()
    {
        var position = BookingPosition.Of(Booking,
        [
            Payment(Booking.Id, 50000),
            Payment(Booking.Id, 50100),
            Payment(Guid.NewGuid(), 99999),
        ], []);

        Assert.Equal(100100, position.PaidPaise);
        Assert.Equal(0, position.PendingPaise);
        Assert.True(position.IsFullyPaid);
        Assert.Equal(2, position.ActivePayments.Count);
    }

    [Fact]
    public void A_reversed_payment_no_longer_counts()
    {
        var wrong = Payment(Booking.Id, 100100);
        var position = BookingPosition.Of(Booking, [wrong], [ReversalOf(wrong.Id)]);

        Assert.Equal(0, position.PaidPaise);
        Assert.Equal(100100, position.PendingPaise);
    }

    [Fact]
    public void A_reversed_booking_owes_nothing_and_the_money_held_is_due_back()
    {
        var position = BookingPosition.Of(Booking, [Payment(Booking.Id, 30000)], [ReversalOf(Booking.Id)]);

        Assert.True(position.IsReversed);
        Assert.Equal(0, position.PendingPaise);
        Assert.Equal(30000, position.RefundDuePaise);
        Assert.False(position.IsFullyPaid);
    }

    private static SevaPayment Payment(Guid bookingId, long paise) =>
        new() { Id = Guid.NewGuid(), BookingId = bookingId, AmountPaise = paise, Mode = PaymentMode.Cash };

    private static Reversal ReversalOf(Guid entryId) => new() { Id = Guid.NewGuid(), ReversedEntryId = entryId, Reason = "test" };
}

public class ReceiptNumberTests
{
    [Theory]
    [InlineData("SRV", 1, "SRV-0001")]
    [InlineData("HST", 42, "HST-0042")]
    [InlineData("AST", 12345, "AST-12345")]
    public void Numbers_are_padded_to_four_digits(string code, long number, string expected) =>
        Assert.Equal(expected, ReceiptNumber.Format(code, number));

    [Fact]
    public void There_is_no_receipt_zero() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => ReceiptNumber.Format("SRV", 0));
}

public class SevaTypeTests
{
    [Theory]
    [InlineData("SRV", true)]
    [InlineData("SSA", true)]
    [InlineData("AB", true)]
    [InlineData("ABCDE", true)]
    [InlineData("A", false)]
    [InlineData("ABCDEF", false)]
    [InlineData("srv", false)]
    [InlineData("SR1", false)]
    [InlineData(null, false)]
    public void Codes_are_two_to_five_capital_letters(string? code, bool valid) =>
        Assert.Equal(valid, SevaType.IsValidCode(code));

    [Fact]
    public void A_limit_of_one_is_full_once_one_is_booked()
    {
        var hastodaka = new SevaType { DailyLimit = 1 };

        Assert.False(hastodaka.IsFullWith(0));
        Assert.True(hastodaka.IsFullWith(1));
    }

    [Fact]
    public void No_limit_is_never_full() =>
        Assert.False(new SevaType { DailyLimit = null }.IsFullWith(1000));

    [Fact]
    public void The_four_sevas_are_seeded_without_rates_or_limits()
    {
        var yatraId = Guid.NewGuid();
        var defaults = SevaType.DefaultsFor(yatraId);

        Assert.Equal(new[] { "SSA", "SRV", "HST", "AST" }, defaults.Select(s => s.Code));
        Assert.All(defaults, s =>
        {
            Assert.Equal(yatraId, s.YatraId);
            Assert.Null(s.RatePaise);
            Assert.Null(s.DailyLimit);
            Assert.True(s.IsActive);
            Assert.True(SevaType.IsValidCode(s.Code));
        });
    }
}

public class YatraTests
{
    private static readonly Yatra Trip = new() { StartsOn = new DateOnly(2026, 12, 1), EndsOn = new DateOnly(2026, 12, 8) };

    [Fact]
    public void Days_are_numbered_from_the_start_and_null_outside_the_trip()
    {
        Assert.Equal(1, Trip.DayNumber(new DateOnly(2026, 12, 1)));
        Assert.Equal(4, Trip.DayNumber(new DateOnly(2026, 12, 4)));
        Assert.Null(Trip.DayNumber(new DateOnly(2026, 11, 30)));
        Assert.Null(Trip.DayNumber(new DateOnly(2026, 12, 9)));
    }

    [Fact]
    public void A_payment_late_at_night_in_India_belongs_to_that_Indian_day()
    {
        // 23:30 IST on 4 Dec is 18:00 UTC on 4 Dec; 00:30 IST on 5 Dec is still 4 Dec in UTC.
        Assert.Equal(new DateOnly(2026, 12, 4), Trip.LocalDayOf(new DateTimeOffset(2026, 12, 4, 18, 0, 0, TimeSpan.Zero)));
        Assert.Equal(new DateOnly(2026, 12, 5), Trip.LocalDayOf(new DateTimeOffset(2026, 12, 4, 19, 0, 0, TimeSpan.Zero)));
    }

    [Fact]
    public void A_local_day_spans_midnight_to_midnight_IST()
    {
        var (start, end) = Trip.UtcBoundsOf(new DateOnly(2026, 12, 4));

        Assert.Equal(new DateTimeOffset(2026, 12, 3, 18, 30, 0, TimeSpan.Zero), start);
        Assert.Equal(new DateTimeOffset(2026, 12, 4, 18, 30, 0, TimeSpan.Zero), end);
    }
}

public class MemberTests
{
    [Theory]
    [InlineData(MemberRole.Accounts, MemberRole.Volunteer, true)]
    [InlineData(MemberRole.Volunteer, MemberRole.Volunteer, true)]
    [InlineData(MemberRole.Viewer, MemberRole.Volunteer, false)]
    [InlineData(MemberRole.Volunteer, MemberRole.Accounts, false)]
    public void Higher_roles_include_lower_ones(MemberRole role, MemberRole required, bool allowed) =>
        Assert.Equal(allowed, role.Allows(required));

    [Theory]
    [InlineData("volunteer", true)]
    [InlineData("Accounts", true)]
    [InlineData("2", false)]
    [InlineData("admin", false)]
    [InlineData(null, false)]
    public void Roles_parse_by_name_only(string? value, bool parses) =>
        Assert.Equal(parses, MemberRoles.TryParse(value, out _));

    [Fact]
    public void An_invitation_matches_the_email_whatever_its_case_until_claimed()
    {
        var member = new YatraMember { Email = YatraMember.NormaliseEmail("  Ramesh@Example.com ") };

        Assert.True(member.IsInvitationFor("ramesh@example.COM"));
        Assert.False(member.IsInvitationFor("suma@example.com"));

        member.UserId = Guid.NewGuid();
        Assert.False(member.IsInvitationFor("ramesh@example.com"));
    }

    [Theory]
    [InlineData("cash", true)]
    [InlineData("UPI", true)]
    [InlineData("bank", true)]
    [InlineData("1", false)]
    [InlineData("card", false)]
    public void Payment_modes_parse_by_name_only(string value, bool parses) =>
        Assert.Equal(parses, PaymentModes.TryParse(value, out _));
}
