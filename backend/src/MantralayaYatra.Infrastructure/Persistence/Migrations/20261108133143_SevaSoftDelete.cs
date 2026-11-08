using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MantralayaYatra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SevaSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                table: "seva_type",
                type: "datetimeoffset",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "seva_type");
        }
    }
}
