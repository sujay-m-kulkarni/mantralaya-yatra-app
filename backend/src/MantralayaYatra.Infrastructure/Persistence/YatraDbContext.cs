using System.Data.Common;
using System.Text;
using MantralayaYatra.Application.Abstractions;
using MantralayaYatra.Domain.Ledger;
using MantralayaYatra.Domain.Sevas;
using MantralayaYatra.Domain.Sync;
using MantralayaYatra.Domain.Users;
using MantralayaYatra.Domain.Yatras;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage;

namespace MantralayaYatra.Infrastructure.Persistence;

public sealed class YatraDbContext : DbContext
{
    public const string SyncSequence = "sync_seq";
    public const string SyncSequenceSchema = "dbo";

    private const int CodeLength = 5;
    private const int EnumLength = 20;

    private readonly IYatraContext _yatra;

    public YatraDbContext(DbContextOptions<YatraDbContext> options, IYatraContext yatra)
        : base(options)
    {
        _yatra = yatra;
    }

    public DbSet<AppUser> AppUsers => Set<AppUser>();

    public DbSet<Yatra> Yatras => Set<Yatra>();

    public DbSet<YatraMember> Members => Set<YatraMember>();

    public DbSet<SevaType> SevaTypes => Set<SevaType>();

    public DbSet<SevaBooking> Bookings => Set<SevaBooking>();

    public DbSet<SevaPayment> Payments => Set<SevaPayment>();

    public DbSet<Reversal> Reversals => Set<Reversal>();

    public DbSet<ReceiptCounter> ReceiptCounters => Set<ReceiptCounter>();

    /// <summary>Read by the query filters on every query of the books, so no query can read another yatra's.</summary>
    internal Guid CurrentYatraId => _yatra.YatraId;

    /// <summary>The next value of the sync sequence. Must run inside a transaction.</summary>
    internal async Task<long> NextSeqAsync(CancellationToken ct)
    {
        // Plain SQL: NEXT VALUE FOR is not allowed inside the subquery EF would wrap around it.
        await using var command = CreateCommand($"SELECT NEXT VALUE FOR [{SyncSequenceSchema}].[{SyncSequence}];");
        return Convert.ToInt64(await command.ExecuteScalarAsync(ct));
    }

    internal DbCommand CreateCommand(string sql)
    {
        var command = Database.GetDbConnection().CreateCommand();
        command.CommandText = sql;
        command.Transaction = Database.CurrentTransaction?.GetDbTransaction()
            ?? throw new InvalidOperationException("This write must run inside a transaction.");
        return command;
    }

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasSequence<long>(SyncSequence, SyncSequenceSchema);

        model.Entity<AppUser>(e =>
        {
            e.ToTable("app_user");
            e.HasKey(u => u.Id);
            e.Property(u => u.IdentitySubject).HasMaxLength(200);
            e.HasIndex(u => u.IdentitySubject).IsUnique();
            e.Property(u => u.Email).HasMaxLength(YatraMember.MaxEmailLength);
        });

        model.Entity<Yatra>(e =>
        {
            e.ToTable("yatra");
            e.HasKey(y => y.Id);
            e.Property(y => y.Name).HasMaxLength(Yatra.MaxNameLength);
        });

        // Not filtered by yatra: membership is what decides which yatra a request may see.
        model.Entity<YatraMember>(e =>
        {
            e.ToTable("yatra_member");
            e.HasKey(m => m.Id);
            e.Ignore(m => m.IsClaimed);
            e.Property(m => m.Email).HasMaxLength(YatraMember.MaxEmailLength);
            e.Property(m => m.DisplayName).HasMaxLength(YatraMember.MaxDisplayNameLength);
            e.Property(m => m.Role).HasConversion<string>().HasMaxLength(EnumLength);
            e.HasIndex(m => new { m.YatraId, m.Email }).IsUnique();
            e.HasIndex(m => new { m.YatraId, m.UserId }).IsUnique().HasFilter("[user_id] IS NOT NULL");
            e.HasIndex(m => m.Email);
            e.HasOne<Yatra>().WithMany().HasForeignKey(m => m.YatraId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<AppUser>().WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<SevaType>(e =>
        {
            ConfigureYatraRow(e, "seva_type");
            e.HasKey(s => s.Id);
            e.Property(s => s.Code).HasMaxLength(CodeLength);
            e.Property(s => s.Name).HasMaxLength(SevaType.MaxNameLength);
            e.HasIndex(s => new { s.YatraId, s.Code }).IsUnique();
        });

        model.Entity<SevaBooking>(e =>
        {
            ConfigureEntry(e, "seva_booking");
            e.Property(b => b.DevoteeName).HasMaxLength(SevaBooking.MaxNameLength);
            e.Property(b => b.DevoteePhone).HasMaxLength(SevaBooking.MaxPhoneLength);
            e.Property(b => b.DraftReceiptNo).HasMaxLength(SevaBooking.MaxReceiptLength);
            e.Property(b => b.ReceiptNo).HasMaxLength(SevaBooking.MaxReceiptLength);
            e.Property(b => b.ReviewReason).HasMaxLength(200);
            e.OwnsOne(b => b.Sankalpa, s =>
            {
                s.Property(x => x.OnBehalfOf).HasColumnName("sankalpa_on_behalf_of").HasMaxLength(Sankalpa.MaxFieldLength);
                s.Property(x => x.Gotra).HasColumnName("sankalpa_gotra").HasMaxLength(Sankalpa.MaxFieldLength);
                s.Property(x => x.Nakshatra).HasColumnName("sankalpa_nakshatra").HasMaxLength(Sankalpa.MaxFieldLength);
                s.Property(x => x.Rashi).HasColumnName("sankalpa_rashi").HasMaxLength(Sankalpa.MaxFieldLength);
                s.Property(x => x.Occasion).HasColumnName("sankalpa_occasion").HasMaxLength(Sankalpa.MaxFieldLength);
                s.Ignore(x => x.IsEmpty);
            });
            e.HasIndex(b => new { b.YatraId, b.ReceiptNo }).IsUnique().HasFilter("[receipt_no] IS NOT NULL");
            e.HasIndex(b => new { b.YatraId, b.SevaDate, b.SevaTypeId });
            e.HasOne<SevaType>().WithMany().HasForeignKey(b => b.SevaTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<SevaPayment>(e =>
        {
            ConfigureEntry(e, "seva_payment");
            e.Property(p => p.Mode).HasConversion<string>().HasMaxLength(EnumLength);
            e.Property(p => p.Reference).HasMaxLength(SevaPayment.MaxReferenceLength);
            e.HasIndex(p => new { p.YatraId, p.BookingId });
            e.HasIndex(p => new { p.YatraId, p.RecordedAt });
            e.HasOne<SevaBooking>().WithMany()
                .HasForeignKey(p => new { p.YatraId, p.BookingId })
                .HasPrincipalKey(b => new { b.YatraId, b.Id })
                .OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<Reversal>(e =>
        {
            ConfigureEntry(e, "ledger_reversal");
            e.Property(r => r.ReversedKind).HasConversion<string>().HasMaxLength(EnumLength);
            e.Property(r => r.Reason).HasMaxLength(Reversal.MaxReasonLength);

            // An entry is reversed at most once; the database holds the line even if the code slips.
            e.HasIndex(r => new { r.YatraId, r.ReversedEntryId }).IsUnique();
        });

        model.Entity<ReceiptCounter>(e =>
        {
            e.ToTable("receipt_counter");
            e.HasKey(c => new { c.YatraId, c.SevaTypeId });
            e.HasQueryFilter(c => c.YatraId == CurrentYatraId);
            e.HasOne<SevaType>().WithMany().HasForeignKey(c => c.SevaTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        UseSnakeCaseColumns(model);
    }

    private void ConfigureYatraRow<T>(EntityTypeBuilder<T> e, string table)
        where T : YatraRow
    {
        e.ToTable(table);
        e.HasQueryFilter(r => r.YatraId == CurrentYatraId);
        e.HasIndex(r => new { r.YatraId, r.ServerSeq }).IsUnique();
        e.HasOne<Yatra>().WithMany().HasForeignKey(r => r.YatraId).OnDelete(DeleteBehavior.Restrict);
    }

    private void ConfigureEntry<T>(EntityTypeBuilder<T> e, string table)
        where T : LedgerEntry
    {
        ConfigureYatraRow(e, table);

        // Ids come from phones, so they are unique per yatra rather than trusted to be unique everywhere.
        e.HasKey(x => new { x.YatraId, x.Id });
        e.Ignore(x => x.Kind);
        e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.RecordedBy).OnDelete(DeleteBehavior.Restrict);
    }

    private static void UseSnakeCaseColumns(ModelBuilder model)
    {
        foreach (var entity in model.Model.GetEntityTypes())
        {
            // Owned sankalpa columns are named explicitly above; their key columns are shared with the booking's.
            if (entity.IsOwned())
            {
                continue;
            }

            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }
        }
    }

    private static string ToSnakeCase(string name)
    {
        var sb = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c) && i > 0)
            {
                sb.Append('_');
            }

            sb.Append(char.ToLowerInvariant(c));
        }

        return sb.ToString();
    }
}

/// <summary>The last final receipt number issued for one seva in one yatra.</summary>
public sealed class ReceiptCounter
{
    public Guid YatraId { get; set; }
    public Guid SevaTypeId { get; set; }
    public long LastNumber { get; set; }
}
