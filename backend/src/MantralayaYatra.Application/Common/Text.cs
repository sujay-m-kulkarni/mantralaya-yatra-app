using MantralayaYatra.Application.LedgerSync;
using MantralayaYatra.Domain.Ledger;

namespace MantralayaYatra.Application.Common;

/// <summary>Text from phones: trimmed, and blank treated as absent.</summary>
internal static class Text
{
    public static string? Clean(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    /// <summary>Null when every field is blank, so "no sankalpa" has one representation.</summary>
    public static Sankalpa? Clean(SankalpaDto? dto)
    {
        if (dto is null)
        {
            return null;
        }

        var sankalpa = new Sankalpa(Clean(dto.OnBehalfOf), Clean(dto.Gotra), Clean(dto.Nakshatra), Clean(dto.Rashi), Clean(dto.Occasion));
        return sankalpa.IsEmpty ? null : sankalpa;
    }

    public static string? TooLong(string? value, int max, string field) =>
        value is not null && value.Length > max ? $"{field} is longer than {max} characters." : null;

    public static string? TooLong(Sankalpa? sankalpa, int max) =>
        sankalpa is null ? null
        : TooLong(sankalpa.OnBehalfOf, max, "sankalpa.onBehalfOf")
          ?? TooLong(sankalpa.Gotra, max, "sankalpa.gotra")
          ?? TooLong(sankalpa.Nakshatra, max, "sankalpa.nakshatra")
          ?? TooLong(sankalpa.Rashi, max, "sankalpa.rashi")
          ?? TooLong(sankalpa.Occasion, max, "sankalpa.occasion");
}
