[CmdletBinding()]
param([switch]$NoRestart, [string]$SpicetifyPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Spicetify-Common.ps1')
$spice = Resolve-DJSpicetify -SpicetifyPath $SpicetifyPath
$configPath = Get-DJSpicetifyConfig -Executable $spice
$configDirectory = Split-Path -Parent $configPath
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
Copy-Item -LiteralPath $configPath -Destination "$configPath.dj-heart-$stamp.bak"
$extensionDirectory = Join-Path $configDirectory 'Extensions'
New-Item -ItemType Directory -Path $extensionDirectory -Force | Out-Null
$extensionPath = Join-Path $extensionDirectory 'dj-heart-restore.js'
if (Test-Path -LiteralPath $extensionPath) { Copy-Item -LiteralPath $extensionPath -Destination "$extensionPath.$stamp.bak" }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dj-heart-restore.js') -Destination $extensionPath -Force
Invoke-DJSpicetify -Executable $spice -Arguments @('config', 'extensions', 'dj-heart-restore.js')
Invoke-DJSpicetify -Executable $spice -Arguments @('config', 'expose_apis', '1')
$configText = Get-Content -LiteralPath $configPath -Raw
if (!(Get-DJIniValue -Text $configText -Section 'Backup' -Key 'version')) {
    Invoke-DJSpicetify -Executable $spice -Arguments @('backup', '--no-restart')
}
$applyArguments = @('apply')
if ($NoRestart) { $applyArguments += '--no-restart' }
Invoke-DJSpicetify -Executable $spice -Arguments $applyArguments
Write-Output "Installed: $extensionPath"
