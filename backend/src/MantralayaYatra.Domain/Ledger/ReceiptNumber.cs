using System.Globalization;

namespace MantralayaYatra.Domain.Ledger;

/// <summary>
/// Final receipt numbers run per seva and per yatra, without gaps: SRV-0001, SRV-0002, …
/// Only the server issues them, so two phones booking offline can never print the same final number.
/// </summary>
public static class ReceiptNumber
{
    public static string Format(string sevaCode, long number)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(number, 1);
        return $"{sevaCode}-{number.ToString("0000", CultureInfo.InvariantCulture)}";
    }
}
