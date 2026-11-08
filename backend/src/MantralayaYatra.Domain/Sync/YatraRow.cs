namespace MantralayaYatra.Domain.Sync;

/// <summary>
/// What every synced row carries: the yatra it belongs to and the server sequence number that orders pulls.
/// Unlike Money Trail, rows are shared by every member of the yatra, not owned by one user.
/// </summary>
public abstract class YatraRow
{
    public Guid YatraId { get; set; }

    /// <summary>Assigned from the database sequence on every write. The pull cursor.</summary>
    public long ServerSeq { get; set; }
}
