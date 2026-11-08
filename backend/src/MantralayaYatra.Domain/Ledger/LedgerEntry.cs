using MantralayaYatra.Domain.Sync;

namespace MantralayaYatra.Domain.Ledger;

public enum EntryKind
{
    Booking = 1,
    Payment = 2,
    Reversal = 3,
}

public enum PaymentMode
{
    Cash = 1,
    Upi = 2,
    Bank = 3,
}

public static class PaymentModes
{
    public static bool TryParse(string? value, out PaymentMode mode)
    {
        mode = default;
        return value is not null
            && !int.TryParse(value, out _)
            && Enum.TryParse(value, ignoreCase: true, out mode)
            && Enum.IsDefined(mode);
    }

    public static string ToWire(this PaymentMode mode) => mode.ToString().ToLowerInvariant();
}

/// <summary>
/// A line in the yatra's books. Entries are append-only: once the server accepts one it is never
/// edited or deleted. A mistake is corrected with a <see cref="Reversal"/>, so every rupee has a trail.
/// The id is made on the phone, which makes a retried push safe.
/// </summary>
public abstract class LedgerEntry : YatraRow
{
    public Guid Id { get; set; }

    /// <summary>The phone the entry came from.</summary>
    public Guid DeviceId { get; set; }

    /// <summary>The member's user who recorded it (the volunteer who took the money).</summary>
    public Guid RecordedBy { get; set; }

    /// <summary>When the volunteer recorded it on the phone, possibly offline.</summary>
    public DateTimeOffset RecordedAt { get; set; }

    /// <summary>When the server accepted it.</summary>
    public DateTimeOffset ReceivedAt { get; set; }

    public abstract EntryKind Kind { get; }
}

/// <summary>The details the priest reads out for the seva.</summary>
public sealed record Sankalpa(string? OnBehalfOf, string? Gotra, string? Nakshatra, string? Rashi, string? Occasion)
{
    public const int MaxFieldLength = 80;

    public bool IsEmpty =>
        string.IsNullOrWhiteSpace(OnBehalfOf)
        && string.IsNullOrWhiteSpace(Gotra)
        && string.IsNullOrWhiteSpace(Nakshatra)
        && string.IsNullOrWhiteSpace(Rashi)
        && string.IsNullOrWhiteSpace(Occasion);
}

/// <summary>A devotee's seva for one day. The amount is what the seva costs; what was paid is in <see cref="SevaPayment"/>.</summary>
public sealed class SevaBooking : LedgerEntry
{
    public const int MaxNameLength = 120;
    public const int MaxPhoneLength = 20;
    public const int MaxReceiptLength = 30;

    public override EntryKind Kind => EntryKind.Booking;

    public Guid SevaTypeId { get; set; }

    /// <summary>The day the seva is performed, which may be later than the day it was booked.</summary>
    public DateOnly SevaDate { get; set; }

    public string DevoteeName { get; set; } = "";

    public string? DevoteePhone { get; set; }

    public Sankalpa? Sankalpa { get; set; }

    public long AmountPaise { get; set; }

    /// <summary>The number printed on the phone's receipt before sync, e.g. SRV-D-R07-0003.</summary>
    public string DraftReceiptNo { get; set; } = "";

    /// <summary>The final number, e.g. SRV-0033, issued by the server when the booking syncs.</summary>
    public string? ReceiptNo { get; set; }

    /// <summary>Set when the server accepted the booking but the accountant should look at it (e.g. over the daily limit).</summary>
    public bool NeedsReview { get; set; }

    public string? ReviewReason { get; set; }
}

/// <summary>Money received against a booking. A booking with no payments is pending.</summary>
public sealed class SevaPayment : LedgerEntry
{
    public const int MaxReferenceLength = 40;

    public override EntryKind Kind => EntryKind.Payment;

    public Guid BookingId { get; set; }

    public long AmountPaise { get; set; }

    public PaymentMode Mode { get; set; }

    /// <summary>UPI reference (UTR) or bank transaction id; none for cash.</summary>
    public string? Reference { get; set; }
}

/// <summary>Cancels one booking or payment. Only the accountant can record one, and an entry is reversed at most once.</summary>
public sealed class Reversal : LedgerEntry
{
    public const int MaxReasonLength = 200;

    public override EntryKind Kind => EntryKind.Reversal;

    public Guid ReversedEntryId { get; set; }

    public EntryKind ReversedKind { get; set; }

    public string Reason { get; set; } = "";
}
