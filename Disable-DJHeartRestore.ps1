[CmdletBinding()]
param([switch]$RemoveFile, [switch]$NoRestart, [string]$SpicetifyPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Spicetify-Common.ps1')
$spice = Resolve-DJSpicetify -SpicetifyPath $SpicetifyPath
$configPath = Get-DJSpicetifyConfig -Executable $spice
Invoke-DJSpicetify -Executable $spice -Arguments @('config', 'extensions', 'dj-heart-restore.js-')
$applyArguments = @('apply')
if ($NoRestart) { $applyArguments += '--no-restart' }
Invoke-DJSpicetify -Executable $spice -Arguments $applyArguments
if ($RemoveFile) {
    $extensionPath = Join-Path (Split-Path -Parent $configPath) 'Extensions\dj-heart-restore.js'
    if (Test-Path -LiteralPath $extensionPath) { Remove-Item -LiteralPath $extensionPath }
}
Write-Output 'DJ Heart Restore disabled. Other extension and theme settings were preserved.'
