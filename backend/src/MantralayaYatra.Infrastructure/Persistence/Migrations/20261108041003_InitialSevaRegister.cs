using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MantralayaYatra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSevaRegister : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "dbo");

            migrationBuilder.CreateSequence(
                name: "sync_seq",
                schema: "dbo");

            migrationBuilder.CreateTable(
                name: "app_user",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    identity_subject = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_app_user", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "yatra",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    starts_on = table.Column<DateOnly>(type: "date", nullable: false),
                    ends_on = table.Column<DateOnly>(type: "date", nullable: false),
                    utc_offset = table.Column<TimeSpan>(type: "time", nullable: false),
                    created_by = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_yatra", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ledger_reversal",
                columns: table => new
                {
                    yatra_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    reversed_entry_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    reversed_kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    reason = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    server_seq = table.Column<long>(type: "bigint", nullable: false),
                    device_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    recorded_by = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    recorded_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    received_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ledger_reversal", x => new { x.yatra_id, x.id });
                    table.ForeignKey(
                        name: "FK_ledger_reversal_app_user_recorded_by",
                        column: x => x.recorded_by,
                        principalTable: "app_user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ledger_reversal_yatra_yatra_id",
                        column: x => x.yatra_id,
                        principalTable: "yatra",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "seva_type",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    code = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    name = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    rate_paise = table.Column<long>(type: "bigint", nullable: true),
                    daily_limit = table.Column<int>(type: "int", nullable: true),
                    requires_sankalpa = table.Column<bool>(type: "bit", nullable: false),
                    is_active = table.Column<bool>(type: "bit", nullable: false),
                    sort_order = table.Column<int>(type: "int", nullable: false),
                    yatra_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    server_seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_seva_type", x => x.id);
                    table.ForeignKey(
                        name: "FK_seva_type_yatra_yatra_id",
                        column: x => x.yatra_id,
                        principalTable: "yatra",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "yatra_member",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    yatra_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    user_id = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    display_name = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    role = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    added_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_yatra_member", x => x.id);
                    table.ForeignKey(
                        name: "FK_yatra_member_app_user_user_id",
                        column: x => x.user_id,
                        principalTable: "app_user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_yatra_member_yatra_yatra_id",
                        column: x => x.yatra_id,
                        principalTable: "yatra",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "receipt_counter",
                columns: table => new
                {
                    yatra_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    seva_type_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    last_number = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_counter", x => new { x.yatra_id, x.seva_type_id });
                    table.ForeignKey(
                        name: "FK_receipt_counter_seva_type_seva_type_id",
                        column: x => x.seva_type_id,
                        principalTable: "seva_type",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "seva_booking",
                columns: table => new
                {
                    yatra_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    seva_type_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    seva_date = table.Column<DateOnly>(type: "date", nullable: false),
                    devotee_name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    devotee_phone = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    sankalpa_on_behalf_of = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    sankalpa_gotra = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    sankalpa_nakshatra = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    sankalpa_rashi = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    sankalpa_occasion = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    amount_paise = table.Column<long>(type: "bigint", nullable: false),
                    draft_receipt_no = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    receipt_no = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    needs_review = table.Column<bool>(type: "bit", nullable: false),
                    review_reason = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    server_seq = table.Column<long>(type: "bigint", nullable: false),
                    device_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    recorded_by = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    recorded_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    received_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_seva_booking", x => new { x.yatra_id, x.id });
                    table.ForeignKey(
                        name: "FK_seva_booking_app_user_recorded_by",
                        column: x => x.recorded_by,
                        principalTable: "app_user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_seva_booking_seva_type_seva_type_id",
                        column: x => x.seva_type_id,
                        principalTable: "seva_type",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_seva_booking_yatra_yatra_id",
                        column: x => x.yatra_id,
                        principalTable: "yatra",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "seva_payment",
                columns: table => new
                {
                    yatra_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    booking_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    amount_paise = table.Column<long>(type: "bigint", nullable: false),
                    mode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    reference = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    server_seq = table.Column<long>(type: "bigint", nullable: false),
                    device_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    recorded_by = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    recorded_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    received_at = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_seva_payment", x => new { x.yatra_id, x.id });
                    table.ForeignKey(
                        name: "FK_seva_payment_app_user_recorded_by",
                        column: x => x.recorded_by,
                        principalTable: "app_user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_seva_payment_seva_booking_yatra_id_booking_id",
                        columns: x => new { x.yatra_id, x.booking_id },
                        principalTable: "seva_booking",
                        principalColumns: new[] { "yatra_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_seva_payment_yatra_yatra_id",
                        column: x => x.yatra_id,
                        principalTable: "yatra",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_app_user_identity_subject",
                table: "app_user",
                column: "identity_subject",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ledger_reversal_recorded_by",
                table: "ledger_reversal",
                column: "recorded_by");

            migrationBuilder.CreateIndex(
                name: "IX_ledger_reversal_yatra_id_reversed_entry_id",
                table: "ledger_reversal",
                columns: new[] { "yatra_id", "reversed_entry_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ledger_reversal_yatra_id_server_seq",
                table: "ledger_reversal",
                columns: new[] { "yatra_id", "server_seq" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipt_counter_seva_type_id",
                table: "receipt_counter",
                column: "seva_type_id");

            migrationBuilder.CreateIndex(
                name: "IX_seva_booking_recorded_by",
                table: "seva_booking",
                column: "recorded_by");

            migrationBuilder.CreateIndex(
                name: "IX_seva_booking_seva_type_id",
                table: "seva_booking",
                column: "seva_type_id");

            migrationBuilder.CreateIndex(
                name: "IX_seva_booking_yatra_id_receipt_no",
                table: "seva_booking",
                columns: new[] { "yatra_id", "receipt_no" },
                unique: true,
                filter: "[receipt_no] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_seva_booking_yatra_id_server_seq",
                table: "seva_booking",
                columns: new[] { "yatra_id", "server_seq" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_seva_booking_yatra_id_seva_date_seva_type_id",
                table: "seva_booking",
                columns: new[] { "yatra_id", "seva_date", "seva_type_id" });

            migrationBuilder.CreateIndex(
                name: "IX_seva_payment_recorded_by",
                table: "seva_payment",
                column: "recorded_by");

            migrationBuilder.CreateIndex(
                name: "IX_seva_payment_yatra_id_booking_id",
                table: "seva_payment",
                columns: new[] { "yatra_id", "booking_id" });

            migrationBuilder.CreateIndex(
                name: "IX_seva_payment_yatra_id_recorded_at",
                table: "seva_payment",
                columns: new[] { "yatra_id", "recorded_at" });

            migrationBuilder.CreateIndex(
                name: "IX_seva_payment_yatra_id_server_seq",
                table: "seva_payment",
                columns: new[] { "yatra_id", "server_seq" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_seva_type_yatra_id_code",
                table: "seva_type",
                columns: new[] { "yatra_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_seva_type_yatra_id_server_seq",
                table: "seva_type",
                columns: new[] { "yatra_id", "server_seq" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_yatra_member_email",
                table: "yatra_member",
                column: "email");

            migrationBuilder.CreateIndex(
                name: "IX_yatra_member_user_id",
                table: "yatra_member",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_yatra_member_yatra_id_email",
                table: "yatra_member",
                columns: new[] { "yatra_id", "email" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_yatra_member_yatra_id_user_id",
                table: "yatra_member",
                columns: new[] { "yatra_id", "user_id" },
                unique: true,
                filter: "[user_id] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ledger_reversal");

            migrationBuilder.DropTable(
                name: "receipt_counter");

            migrationBuilder.DropTable(
                name: "seva_payment");

            migrationBuilder.DropTable(
                name: "yatra_member");

            migrationBuilder.DropTable(
                name: "seva_booking");

            migrationBuilder.DropTable(
                name: "app_user");

            migrationBuilder.DropTable(
                name: "seva_type");

            migrationBuilder.DropTable(
                name: "yatra");

            migrationBuilder.DropSequence(
                name: "sync_seq",
                schema: "dbo");
        }
    }
}
