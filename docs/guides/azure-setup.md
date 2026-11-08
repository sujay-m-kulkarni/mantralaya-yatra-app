# Azure setup for the API

One-time setup so `.github/workflows/api.yml` can deploy the API. Run the commands in **PowerShell** on your laptop with the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli-windows) installed. Run them one at a time (Windows PowerShell does not accept `&&`).

What gets created, the same shape as VERA:

| Resource | Name used below | Tier |
|---|---|---|
| Resource group | `rg-mantralaya-yatra` | |
| Azure SQL server and database | `sql-mantralaya-yatra-<you>` / `mantralaya-yatra` | Basic |
| App Service plan (Linux) | `asp-mantralaya-yatra` | B1 (Always On) |
| Web app (.NET 10) | `mantralaya-yatra-api-<you>` | |
| Entra app GitHub signs in as (OIDC) | `github-mantralaya-yatra-deploy` | no password or secret |

B1 and Basic are the smallest tiers that stay running; check current prices in the Azure pricing calculator before creating them.

## 1. Choose names and sign in

Server and web app names must be unique across Azure, so add something of your own to them.

```powershell
az login
$rg    = "rg-mantralaya-yatra"
$loc   = "centralindia"
$sql   = "sql-mantralaya-yatra-sujay"
$db    = "mantralaya-yatra"
$plan  = "asp-mantralaya-yatra"
$app   = "mantralaya-yatra-api-sujay"
$repo  = "sujay-m-kulkarni/mantralaya-yatra-app"
$sub   = az account show --query id -o tsv
$tenant = az account show --query tenantId -o tsv
```

## 2. Database

Pick a strong admin password and keep it in your password manager.

```powershell
$sqlUser = "yatraadmin"
$sqlPassword = Read-Host "Choose a SQL admin password"
az group create --name $rg --location $loc
az sql server create --resource-group $rg --name $sql --location $loc --admin-user $sqlUser --admin-password $sqlPassword
az sql db create --resource-group $rg --server $sql --name $db --service-objective Basic
# Lets the web app (an Azure service) reach the database. The pipeline opens and closes its own rule per run.
az sql server firewall-rule create --resource-group $rg --server $sql --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
$conn = "Server=tcp:$sql.database.windows.net,1433;Database=$db;User ID=$sqlUser;Password=$sqlPassword;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30"
```

## 3. Web app

Check the exact name Azure uses for the .NET 10 runtime first; it should list `DOTNETCORE:10.0`:

```powershell
az webapp list-runtimes --os-type linux | Select-String DOTNET
```

```powershell
az appservice plan create --resource-group $rg --name $plan --location $loc --is-linux --sku B1
az webapp create --resource-group $rg --plan $plan --name $app --runtime "DOTNETCORE:10.0"
az webapp config set --resource-group $rg --name $app --always-on true
# Azure restarts the app if /health/ready keeps failing. Passed as a file: PowerShell mangles inline JSON.
'{"healthCheckPath": "/health/ready"}' | Set-Content -Encoding ascii healthcheck.json
az webapp config set --resource-group $rg --name $app --generic-configurations "@healthcheck.json"
Remove-Item healthcheck.json
az webapp update --resource-group $rg --name $app --https-only true
az webapp config connection-string set --resource-group $rg --name $app --connection-string-type SQLAzure --settings "Yatra=$conn"
az webapp config appsettings set --resource-group $rg --name $app --settings `
  "Database__MigrateOnStartup=false" `
  "Auth__Authority=https://login.microsoftonline.com/$tenant/v2.0" `
  "Auth__Audience=api://mantralaya-yatra"
```

The two `Auth__` values let the API start. Until Entra External ID sign-in is added to the app, the deployed API answers `401` to the app: the dev header that works on your laptop is switched off outside Development, on purpose. When the External ID tenant exists, replace both values with its issuer and the API's app id URI.

## 4. Let GitHub deploy without a password (OIDC)

GitHub gets a short-lived token for each run of the **production** environment; Azure trusts only that.

```powershell
$appId = az ad app create --display-name "github-mantralaya-yatra-deploy" --query appId -o tsv
az ad sp create --id $appId
@"
{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${repo}:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}
"@ | Set-Content -Encoding utf8 federated.json
az ad app federated-credential create --id $appId --parameters federated.json
Remove-Item federated.json
# Contributor on this resource group only: deploy the web app and open/close SQL firewall rules.
az role assignment create --assignee $appId --role Contributor --scope "/subscriptions/$sub/resourceGroups/$rg"
```

Role assignments can take a few minutes to start working.

## 5. GitHub: the production environment

In the repository on GitHub: **Settings › Environments › New environment**, name it `production`.

1. **Required reviewers**: tick it and add yourself. Every deploy now waits for you to press *Approve* on the run.
2. **Deployment branches and tags**: choose *Selected branches and tags* and add `main`.
3. **Environment variables** (*Add environment variable*). Print the values with:
   ```powershell
   "AZURE_CLIENT_ID=$appId"; "AZURE_TENANT_ID=$tenant"; "AZURE_SUBSCRIPTION_ID=$sub"
   "AZURE_RESOURCE_GROUP=$rg"; "AZURE_SQL_SERVER=$sql"; "AZURE_WEBAPP_NAME=$app"
   ```
4. **Environment secret** `AZURE_SQL_CONNECTION_STRING`: the value of `$conn`. Copy it without showing it:
   ```powershell
   $conn | Set-Clipboard
   ```
   The pipeline uses it only to run migrations; the web app has its own copy from step 3.

Then, for the phone app: **Settings › Secrets and variables › Actions › Variables › New repository variable** `API_URL` = `https://<your web app>.azurewebsites.net`. Release APKs offer it as the server on the Set up screen.

## 6. First deploy

1. Generate the first EF migration on your laptop and merge it (backend/README.md, "First migration"). Without it the pipeline stops with that message, since migrations are what create the tables in Azure SQL.
2. The merge starts **API** on the Actions tab. After the tests and the package step it waits: open the run, *Review deployments*, tick `production`, *Approve and deploy*.
3. The run migrates the database, deploys, waits for `/health/ready` to answer with the new version, and tags `api-v0.1.0`.

If the health check fails, open the web app in the Azure portal, *Log stream*, and look at the start-up error.
