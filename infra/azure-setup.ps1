<#
.SYNOPSIS
  Creates the Mantralaya Yatra API's own Azure resources and lets GitHub deploy to them.

.DESCRIPTION
  Everything goes into its own resource group, with its own App Service plan; nothing is shared with
  other apps. GitHub's deploy identity can touch this resource group only.
  Safe to run again: anything that already exists is left as it is.
  Explained step by step in docs/guides/azure-setup.md.

  Run from the repository folder in PowerShell:
    az login
    .\infra\azure-setup.ps1 -Suffix sujay

.PARAMETER Suffix
  Added to the SQL server and web app names, which must be unique across all of Azure.
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]{2,12}$')][string]$Suffix,
  [string]$Location = 'centralindia',
  [string]$Repo = 'sujay-m-kulkarni/mantralaya-yatra-app'
)

$ErrorActionPreference = 'Stop'

$rg = 'rg-mantralaya-yatra'
$plan = 'asp-mantralaya-yatra'
$sql = "sql-mantralaya-yatra-$Suffix"
$db = 'mantralaya-yatra'
$app = "mantralaya-yatra-api-$Suffix"
$deployApp = 'github-mantralaya-yatra-deploy'
$sqlUser = 'yatraadmin'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

# Runs an az command and stops the script if it fails. az prints warnings on stderr, which Windows
# PowerShell 5 would treat as fatal under 'Stop', so the exit code decides instead.
function Az {
  $ErrorActionPreference = 'Continue'
  $out = & az @args
  if ($LASTEXITCODE -ne 0) { throw "az $($args -join ' ') failed." }
  return $out
}

# True if an az "show" finds the resource.
function Exists {
  $ErrorActionPreference = 'Continue'
  & az @args --only-show-errors 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

Step 'Azure account'
$sub = Az account show --query id -o tsv
$tenant = Az account show --query tenantId -o tsv
$subName = Az account show --query name -o tsv
Write-Host "Subscription: $subName ($sub)"
$answer = Read-Host "Create the resources in this subscription? (y/n)"
if ($answer -ne 'y') { Write-Host 'Stopped. Choose another with: az account set --subscription <name>'; exit 1 }

Step "Checking the .NET 10 runtime name"
$runtimes = (Az webapp list-runtimes --os-type linux -o tsv) -join "`n"
$runtime = 'DOTNETCORE:10.0'
if ($runtimes -notmatch [regex]::Escape($runtime)) {
  throw "App Service does not list $runtime. Available: $(($runtimes -split "`n" | Select-String DOTNET) -join ', ')"
}

Step "Resource group $rg"
Az group create --name $rg --location $Location --output none

Step "SQL server $sql and database $db"
if (Exists sql server show --resource-group $rg --name $sql) {
  Write-Host 'The SQL server exists; keeping it. Enter its existing admin password below.'
}
$secure = Read-Host "SQL admin password for '$sqlUser' (keep it in your password manager)" -AsSecureString
$sqlPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($sqlPassword -match '[;''"{}]') { throw "Choose a password without ; ' `" { or }: they break the connection string." }
if (-not (Exists sql server show --resource-group $rg --name $sql)) {
  Az sql server create --resource-group $rg --name $sql --location $Location --admin-user $sqlUser --admin-password $sqlPassword --output none
}
if (-not (Exists sql db show --resource-group $rg --server $sql --name $db)) {
  Az sql db create --resource-group $rg --server $sql --name $db --service-objective Basic --output none
}
# Lets Azure services (the web app) reach the database. The pipeline opens its own rule per run.
Az sql server firewall-rule create --resource-group $rg --server $sql --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 --output none
$conn = "Server=tcp:$sql.database.windows.net,1433;Database=$db;User ID=$sqlUser;Password=$sqlPassword;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30"

Step "App Service plan $plan (its own, Linux B1)"
if (-not (Exists appservice plan show --resource-group $rg --name $plan)) {
  Az appservice plan create --resource-group $rg --name $plan --location $Location --is-linux --sku B1 --output none
}

Step "Web app $app"
if (-not (Exists webapp show --resource-group $rg --name $app)) {
  Az webapp create --resource-group $rg --plan $plan --name $app --runtime $runtime --output none
}
Az webapp config set --resource-group $rg --name $app --always-on true --output none
$healthFile = Join-Path $env:TEMP 'yatra-healthcheck.json'
'{"healthCheckPath": "/health/ready"}' | Set-Content -Encoding ascii $healthFile
Az webapp config set --resource-group $rg --name $app --generic-configurations "@$healthFile" --output none
Remove-Item $healthFile
Az webapp update --resource-group $rg --name $app --https-only true --output none
Az webapp config connection-string set --resource-group $rg --name $app --connection-string-type SQLAzure --settings "Yatra=$conn" --output none
# Placeholders that let the API start; replaced once the Entra External ID tenant exists.
Az webapp config appsettings set --resource-group $rg --name $app --output none --settings `
  "Database__MigrateOnStartup=false" `
  "Auth__Authority=https://login.microsoftonline.com/$tenant/v2.0" `
  "Auth__Audience=api://mantralaya-yatra"

Step "GitHub's deploy identity $deployApp (OIDC, no password)"
$appId = Az ad app list --display-name $deployApp --query '[0].appId' -o tsv
if (-not $appId) { $appId = Az ad app create --display-name $deployApp --query appId -o tsv }
if (-not (Exists ad sp show --id $appId)) { Az ad sp create --id $appId --output none }
$subject = "repo:${Repo}:environment:production"
$existing = Az ad app federated-credential list --id $appId --query "[?subject=='$subject'].name" -o tsv
if (-not $existing) {
  $fedFile = Join-Path $env:TEMP 'yatra-federated.json'
  @"
{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "$subject",
  "audiences": ["api://AzureADTokenExchange"]
}
"@ | Set-Content -Encoding ascii $fedFile
  Az ad app federated-credential create --id $appId --parameters "@$fedFile" --output none
  Remove-Item $fedFile
}
$scope = "/subscriptions/$sub/resourceGroups/$rg"
$assigned = Az role assignment list --assignee $appId --scope $scope --role Contributor --query '[0].id' -o tsv
if (-not $assigned) { Az role assignment create --assignee $appId --role Contributor --scope $scope --output none }

Step 'Done. Now in GitHub:'
Write-Host @"

1. Settings > Environments > New environment: production
   - Required reviewers: tick, add yourself
   - Deployment branches and tags: Selected > add main
   - Environment variables:
       AZURE_CLIENT_ID        $appId
       AZURE_TENANT_ID        $tenant
       AZURE_SUBSCRIPTION_ID  $sub
       AZURE_RESOURCE_GROUP   $rg
       AZURE_SQL_SERVER       $sql
       AZURE_WEBAPP_NAME      $app
   - Environment secret AZURE_SQL_CONNECTION_STRING: it is on your clipboard now (paste it, then copy something else).

2. Settings > Secrets and variables > Actions > Variables > New repository variable:
       API_URL                https://$app.azurewebsites.net

"@
$conn | Set-Clipboard
