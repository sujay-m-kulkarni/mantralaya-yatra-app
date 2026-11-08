<#
.SYNOPSIS
  Registers the API and the phone app in your Entra External ID tenant, and writes the app's sign-in settings.

.DESCRIPTION
  Run after creating the external tenant in the Azure portal (docs/guides/entra-setup.md, step 1).
  It creates, in that tenant:
    - "mantralaya-yatra-api": the API, exposing the scope access_as_user, with the email claim in access tokens
    - "mantralaya-yatra-app": the phone app, a public client with the redirect app.mantralayayatra://auth
  then writes ui\app.config.json's "auth" section and prints the two settings for the Azure web app.
  Safe to run again: apps that exist are reused.

  From the repository folder:
    az login --tenant <external-tenant-id> --allow-no-subscriptions
    .\infra\entra-setup.ps1
#>
param(
  [string]$ApiName = 'mantralaya-yatra-api',
  [string]$AppName = 'mantralaya-yatra-app',
  [string]$RedirectUri = 'app.mantralayayatra://auth'
)

$ErrorActionPreference = 'Stop'
$azCli = (Get-Command az -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $azCli) { throw 'The Azure CLI (az) is not installed.' }

# Helpers are not named "az": PowerShell names ignore case, and a function called Az would call itself.
function Invoke-AzCli {
  $ErrorActionPreference = 'Continue'
  $out = & $azCli @args
  if ($LASTEXITCODE -ne 0) { throw "az $($args -join ' ') failed." }
  return $out
}

# Calls Microsoft Graph with a JSON body passed as a file (PowerShell 5 mangles inline JSON).
function Invoke-Graph([string]$Method, [string]$Url, $Body) {
  $args2 = @('rest', '--method', $Method, '--url', "https://graph.microsoft.com/v1.0$Url", '--headers', 'Content-Type=application/json')
  $file = $null
  if ($null -ne $Body) {
    $file = Join-Path $env:TEMP "yatra-graph-$([guid]::NewGuid()).json"
    ($Body | ConvertTo-Json -Depth 10) | Set-Content -Encoding ascii $file
    $args2 += @('--body', "@$file")
  }
  try { $out = Invoke-AzCli @args2 } finally { if ($file) { Remove-Item $file -ErrorAction SilentlyContinue } }
  if ($out) { return ($out -join "`n") | ConvertFrom-Json }
}

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

function Get-OrCreateApp([string]$Name) {
  $found = Invoke-Graph GET "/applications?`$filter=displayName eq '$Name'" $null
  if ($found.value.Count -gt 0) { Write-Host "Reusing $Name"; return $found.value[0] }
  Write-Host "Creating $Name"
  return Invoke-Graph POST '/applications' @{ displayName = $Name; signInAudience = 'AzureADMyOrg' }
}

function Confirm-ServicePrincipal([string]$AppId) {
  $sp = Invoke-Graph GET "/servicePrincipals?`$filter=appId eq '$AppId'" $null
  if ($sp.value.Count -gt 0) { return $sp.value[0] }
  return Invoke-Graph POST '/servicePrincipals' @{ appId = $AppId }
}

Step 'Tenant'
$tenantId = Invoke-AzCli account show --query tenantId -o tsv
$org = Invoke-Graph GET '/organization' $null
$initialDomain = ($org.value[0].verifiedDomains | Where-Object { $_.isInitial }).name
$subdomain = $initialDomain -replace '\.onmicrosoft\.com$', ''
Write-Host "Tenant $($org.value[0].displayName) ($tenantId), $initialDomain"
$answer = Read-Host 'Is this your new EXTERNAL tenant (not the one with your Azure subscription)? (y/n)'
if ($answer -ne 'y') { Write-Host 'Stopped. Sign in to it with: az login --tenant <external-tenant-id> --allow-no-subscriptions'; exit 1 }

Step "API registration $ApiName"
$api = Get-OrCreateApp $ApiName
$existingScope = $api.api.oauth2PermissionScopes | Where-Object { $_.value -eq 'access_as_user' }
$scopeId = if ($existingScope) { $existingScope.id } else { [guid]::NewGuid().ToString() }
Invoke-Graph PATCH "/applications/$($api.id)" @{
  identifierUris = @("api://$($api.appId)")
  api            = @{
    requestedAccessTokenVersion = 2
    oauth2PermissionScopes      = @(@{
        id                      = $scopeId
        value                   = 'access_as_user'
        type                    = 'User'
        isEnabled               = $true
        adminConsentDisplayName = 'Use the Mantralaya Yatra API'
        adminConsentDescription = 'Lets the app call the Mantralaya Yatra API as the signed-in volunteer.'
        userConsentDisplayName  = 'Use Mantralaya Yatra'
        userConsentDescription  = 'Lets the app record and read seva entries for you.'
      })
  }
  # The API matches members to the accountant's invitations by email, so access tokens must carry it.
  optionalClaims = @{ accessToken = @(@{ name = 'email'; essential = $false }) }
} | Out-Null
$apiSp = Confirm-ServicePrincipal $api.appId

Step "Phone app registration $AppName"
$app = Get-OrCreateApp $AppName
# Microsoft Graph's well-known ids: the Graph app, and its openid / offline_access / email / profile permissions.
$graphAppId = '00000003-0000-0000-c000-000000000000'
Invoke-Graph PATCH "/applications/$($app.id)" @{
  isFallbackPublicClient = $true
  publicClient           = @{ redirectUris = @($RedirectUri) }
  requiredResourceAccess = @(
    @{ resourceAppId = $api.appId; resourceAccess = @(@{ id = $scopeId; type = 'Scope' }) },
    @{ resourceAppId = $graphAppId; resourceAccess = @(
        @{ id = '37f7f235-527c-4136-accd-4a02d197296e'; type = 'Scope' }, # openid
        @{ id = '7427e0e9-2fba-42fe-b0c0-848c9e6a8182'; type = 'Scope' }, # offline_access
        @{ id = '64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0'; type = 'Scope' }, # email
        @{ id = '14dad69e-099b-42c9-810b-d002981feec1'; type = 'Scope' }  # profile
      ) }
  )
} | Out-Null
$appSp = Confirm-ServicePrincipal $app.appId

Step 'Consent for all users, so volunteers are not asked'
$graphSp = Confirm-ServicePrincipal $graphAppId
foreach ($grant in @(@{ resource = $apiSp.id; scope = 'access_as_user' }, @{ resource = $graphSp.id; scope = 'openid offline_access email profile' })) {
  $existing = Invoke-Graph GET "/oauth2PermissionGrants?`$filter=clientId eq '$($appSp.id)' and resourceId eq '$($grant.resource)'" $null
  if ($existing.value.Count -eq 0) {
    Invoke-Graph POST '/oauth2PermissionGrants' @{ clientId = $appSp.id; consentType = 'AllPrincipals'; resourceId = $grant.resource; scope = $grant.scope } | Out-Null
  }
}

Step 'Writing ui\app.config.json'
$configPath = Join-Path $PSScriptRoot '..\ui\app.config.json'
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$config.auth.authority = "https://$subdomain.ciamlogin.com/$tenantId"
$config.auth.clientId = $app.appId
$config.auth.scope = "api://$($api.appId)/access_as_user"
# UTF-8 without a byte-order mark: Windows PowerShell 5's "-Encoding utf8" adds one, which JSON parsers reject.
[IO.File]::WriteAllText((Resolve-Path $configPath).Path, ($config | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
Write-Host "authority  $($config.auth.authority)"
Write-Host "clientId   $($config.auth.clientId)"
Write-Host "scope      $($config.auth.scope)"

Step 'Done. Two more things:'
Write-Host @"

1. In the Azure portal, in this external tenant: External Identities > User flows > New user flow,
   "Sign up and sign in", identity provider "Email one-time passcode", attribute "Display Name".
   Then open the flow > Applications > Add application > $AppName.

2. Point the API at this tenant. Sign back in to the tenant with your subscription, then:
     az login
     az webapp config appsettings set --resource-group rg-mantralaya-yatra --name <your web app> --settings "Auth__Authority=https://$tenantId.ciamlogin.com/$tenantId/v2.0" "Auth__Audience=$($api.appId),api://$($api.appId)"

Commit ui\app.config.json; every build after that signs in with this tenant.
"@
