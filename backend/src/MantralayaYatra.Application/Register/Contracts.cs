using MantralayaYatra.Application.LedgerSync;

namespace MantralayaYatra.Application.Register;

// Wire shapes for the register and priest's list. These are read models: computed from the
// ledger on request, never stored, so they can never disagree with it.

/// <summary>Money collected on the day (by when it was recorded), whichever day its seva is.</summary>
/// <param name="PendingPaise">Still to collect on this day's sevas.</param>
/// <param name="RefundDuePaise">Collected for this day's sevas that were later reversed.</param>
public sealed record RegisterTotals(
    long CashPaise,
    long UpiPaise,
    long BankPaise,
    long CollectedPaise,
    long PendingPaise,
    long RefundDuePaise,
    int BookingCount);

/// <param name="Count">Active (not reversed) bookings for the day.</param>
public sealed record SevaDaySummary(
    string Code,
    string Name,
    int Count,
    long AmountPaise,
    int? DailyLimit,
    bool IsFull);

/// <param name="ReceiptNo">The final number once synced, otherwise the draft.</param>
/// <param name="Modes">How it was paid: cash, upi, bank.</param>
/// <param name="RecordedBy">The volunteer's display name.</param>
public sealed record RegisterLine(
    Guid BookingId,
    string SevaCode,
    string SevaName,
    string ReceiptNo,
    string DevoteeName,
    SankalpaDto? Sankalpa,
    long AmountPaise,
    long PaidPaise,
    long PendingPaise,
    IReadOnlyList<string> Modes,
    bool IsReversed,
    long RefundDuePaise,
    bool NeedsReview,
    string? ReviewReason,
    string RecordedBy);

/// <param name="DayNumber">Day 1 is the yatra's start date.</param>
public sealed record DailyRegisterResponse(
    DateOnly Date,
    int? DayNumber,
    RegisterTotals Totals,
    IReadOnlyList<SevaDaySummary> Sevas,
    IReadOnlyList<RegisterLine> Lines);

public sealed record PriestListEntry(
    string ReceiptNo,
    string DevoteeName,
    string? OnBehalfOf,
    string? Gotra,
    string? Nakshatra,
    string? Rashi,
    string? Occasion);

public sealed record PriestListSeva(string Code, string Name, IReadOnlyList<PriestListEntry> Entries);

public sealed record PriestListResponse(DateOnly Date, int? DayNumber, string YatraName, IReadOnlyList<PriestListSeva> Sevas);
