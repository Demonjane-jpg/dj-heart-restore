[CmdletBinding()]
param([string]$SpicetifyPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Spicetify-Common.ps1')
$spice = Resolve-DJSpicetify -SpicetifyPath $SpicetifyPath
Invoke-DJSpicetify -Executable $spice -Arguments @('auto')
