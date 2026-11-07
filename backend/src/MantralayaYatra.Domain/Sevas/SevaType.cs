using System.Text.RegularExpressions;
using MantralayaYatra.Domain.Sync;

namespace MantralayaYatra.Domain.Sevas;

/// <summary>
/// A kind of seva devotees can book, with its receipt prefix (<see cref="Code"/>), rate and daily limit.
/// Configuration, not money: the accountant edits these, and phones pull the latest version.
/// </summary>
public sealed partial class SevaType : YatraRow
{
    public const int MaxNameLength = 60;

    public Guid Id { get; set; }

    /// <summary>Two to five capital letters; the receipt prefix, e.g. SRV in SRV-0033.</summary>
    public string Code { get; set; } = "";

    public string Name { get; set; } = "";

    /// <summary>The usual amount, offered as the default on the phone. Null until the accountant sets it.</summary>
    public long? RatePaise { get; set; }

    /// <summary>How many may be booked for one day. Null means no limit.</summary>
    public int? DailyLimit { get; set; }

    /// <summary>Whether a booking must carry sankalpa details (on behalf of, gotra, nakshatra, rashi) for the priest.</summary>
    public bool RequiresSankalpa { get; set; } = true;

    /// <summary>Inactive sevas are hidden on the phone for new bookings; old bookings keep their history.</summary>
    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }

    public bool IsFullWith(int activeBookingsThatDay) => DailyLimit is int limit && activeBookingsThatDay >= limit;

    public static bool IsValidCode(string? code) => code is not null && CodePattern().IsMatch(code);

    /// <summary>
    /// The four sevas this group offers, seeded when a yatra is created. Rates and limits are left unset
    /// on purpose: the accountant enters the real ones.
    /// </summary>
    public static IReadOnlyList<SevaType> DefaultsFor(Guid yatraId) =>
    [
        New(yatraId, "SSA", "Sarva Samarpana Seva", 1),
        New(yatraId, "SRV", "Sarva Seva", 2),
        New(yatraId, "HST", "Hastodaka", 3),
        New(yatraId, "AST", "Ashtottara", 4),
    ];

    private static SevaType New(Guid yatraId, string code, string name, int order) => new()
    {
        Id = Guid.NewGuid(),
        YatraId = yatraId,
        Code = code,
        Name = name,
        SortOrder = order,
    };

    [GeneratedRegex("^[A-Z]{2,5}$")]
    private static partial Regex CodePattern();
}
