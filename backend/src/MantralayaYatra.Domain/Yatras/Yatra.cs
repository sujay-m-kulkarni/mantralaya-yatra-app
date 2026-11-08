namespace MantralayaYatra.Domain.Yatras;

/// <summary>
/// One pilgrimage. Everything the volunteers record (sevas, payments, later meals and expenses)
/// belongs to exactly one yatra, so the same app serves next year's trip without mixing the books.
/// </summary>
public sealed class Yatra
{
    public const int MaxNameLength = 120;

    /// <summary>India has no daylight saving, so a fixed offset is enough to say which day a payment fell on.</summary>
    public static readonly TimeSpan IndiaOffset = TimeSpan.FromMinutes(330);

    public Guid Id { get; set; }

    public string Name { get; set; } = "";

    public DateOnly StartsOn { get; set; }

    public DateOnly EndsOn { get; set; }

    /// <summary>The offset used to turn a payment's timestamp into the yatra day it belongs to.</summary>
    public TimeSpan UtcOffset { get; set; } = IndiaOffset;

    public Guid CreatedBy { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public bool Covers(DateOnly day) => day >= StartsOn && day <= EndsOn;

    /// <summary>Day 1 is the start date. Null outside the yatra's dates.</summary>
    public int? DayNumber(DateOnly day) => Covers(day) ? day.DayNumber - StartsOn.DayNumber + 1 : null;

    /// <summary>The yatra day a moment falls on, in the yatra's local time.</summary>
    public DateOnly LocalDayOf(DateTimeOffset moment) => DateOnly.FromDateTime(moment.ToOffset(UtcOffset).DateTime);

    /// <summary>The UTC instants that bound one local yatra day: [start, end).</summary>
    public (DateTimeOffset Start, DateTimeOffset End) UtcBoundsOf(DateOnly day)
    {
        var start = new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), UtcOffset).ToUniversalTime();
        return (start, start.AddDays(1));
    }
}
