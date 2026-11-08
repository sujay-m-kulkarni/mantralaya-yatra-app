<#
.SYNOPSIS
  Builds a signed release APK on this laptop, the same as the pipeline's, into ui\apk\.

.DESCRIPTION
  Asks for the signing key's password, keeps it only in this PowerShell process while the build runs,
  then clears it. The key itself is made once: docs/guides/build-pipeline.md, "The signing key".

  Usually the pipeline makes releases (merge to main). Use this when GitHub is not an option, for
  example to hand a volunteer an APK straight away. Run from the ui folder:

    .\scripts\release-apk.ps1 -Keystore C:\Users\kulka\keys\mantralaya-yatra.jks
    .\scripts\release-apk.ps1 -Keystore ... -ApiUrl https://mantralaya-yatra-api-sujay.azurewebsites.net

.PARAMETER ApiUrl
  The server the app offers on its Set up screen. An https address also turns off plain-http traffic,
  as in pipeline releases. Leave it out for a build that talks to the API on this laptop.
#>
param(
  [Parameter(Mandatory = $true)][string]$Keystore,
  [string]$Alias = 'mantralayayatra',
  [string]$ApiUrl = '',
  [ValidatePattern('^(\d+\.\d+\.\d+)?$')][string]$Version = ''
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Keystore)) { throw "Keystore not found: $Keystore" }

$secure = Read-Host 'Keystore password' -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

$names = 'MY_KEYSTORE_FILE', 'MY_KEYSTORE_PASSWORD', 'MY_KEY_ALIAS', 'MY_KEY_PASSWORD', 'MY_API_URL', 'MY_VERSION'
try {
  $env:MY_KEYSTORE_FILE = (Resolve-Path $Keystore).Path
  $env:MY_KEYSTORE_PASSWORD = $password
  $env:MY_KEY_ALIAS = $Alias
  # The key password is the keystore password unless one was chosen separately when making the key.
  $env:MY_KEY_PASSWORD = $password
  if ($ApiUrl) { $env:MY_API_URL = $ApiUrl }
  if ($Version) { $env:MY_VERSION = $Version }
  npm run android:apk:release
  if ($LASTEXITCODE -ne 0) { throw 'The release build failed; see the output above.' }
}
finally {
  foreach ($name in $names) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
}
