# Backend

ASP.NET Core minimal API in four layers. See [docs/architecture/backend-design.md](../docs/architecture/backend-design.md) for the design and [docs/architecture/api-contract.md](../docs/architecture/api-contract.md) for the endpoints.

```
src/
  MantralayaYatra.Domain           entities and rules; no dependencies
  MantralayaYatra.Application      use cases and the ports they need
  MantralayaYatra.Infrastructure   EF Core on SQL Server: the ports' adapters
  MantralayaYatra.Api              endpoints, sign-in, composition root
tests/
  MantralayaYatra.Domain.UnitTests
  MantralayaYatra.Application.UnitTests     use cases against in-memory fakes
  MantralayaYatra.Api.IntegrationTests      the real API on SQL Server in Docker
  MantralayaYatra.ArchitectureTests         layer rules
```

## Run it on your laptop

1. Start SQL Server in Docker:
   ```
   docker run -d --name yatra-sql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password1 -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
   ```
2. Run the API (Development): `dotnet run --project src/MantralayaYatra.Api`. It listens on http://localhost:5180 and builds the database on start.
3. Open `src/MantralayaYatra.Api/MantralayaYatra.Api.http` in VS Code or Visual Studio and send the requests in order. The `X-Dev-User` header signs you in without Entra (Development only).

## Tests

`dotnet test` runs everything. The integration tests need Docker running (Testcontainers starts SQL Server). CI runs the same on every pull request: `.github/workflows/backend.yml`.

## First migration

The first pull request was written where NuGet could not be reached, so it has no EF migration yet. Until there is one, the API and the integration tests create the schema straight from the model (`InitialiseDatabaseAsync` in Infrastructure). Generate it once on your laptop:

```
dotnet tool restore
dotnet ef migrations add InitialSevaRegister --project src/MantralayaYatra.Infrastructure --startup-project src/MantralayaYatra.Api --output-dir Persistence/Migrations
```

From then on the API and tests apply migrations instead. Turn on the commented "Check the migrations match the model" step in `.github/workflows/backend.yml` in the same pull request.
