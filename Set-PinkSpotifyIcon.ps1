[CmdletBinding()]
param([string[]]$ShortcutPath)
$ErrorActionPreference = 'Stop'
$iconPath = Join-Path $PSScriptRoot 'assets\spotify-pink.ico'
if (!(Test-Path -LiteralPath $iconPath -PathType Leaf)) { throw 'Pink Spotify icon is missing.' }
if (!$ShortcutPath) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $appData = [Environment]::GetFolderPath('ApplicationData')
    $ShortcutPath = @(
        (Join-Path $desktop 'Spotify.lnk'),
        (Join-Path $desktop 'Spotify - DJ Heart Restore.lnk'),
        (Join-Path $appData 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Spotify.lnk')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
}
if (!$ShortcutPath) { throw 'No Spotify shortcuts found. Pass one or more .lnk paths with -ShortcutPath.' }
# Resolve and validate the whole selection before changing any shortcut.
$resolvedShortcuts = foreach ($path in $ShortcutPath) {
    $resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
    if ([IO.Path]::GetExtension($resolved) -ine '.lnk') { throw "Expected a Windows .lnk shortcut: $resolved" }
    $resolved
}
$backupDirectory = Join-Path $PSScriptRoot ('.shortcut-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$shell = New-Object -ComObject WScript.Shell
$index = 0
foreach ($path in $resolvedShortcuts) {
    $index++
    Copy-Item -LiteralPath $path -Destination (Join-Path $backupDirectory ("$index-" + (Split-Path -Leaf $path)))
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Save()
    Write-Output "Updated pink Spotify icon: $path"
}
$refresh = Join-Path $env:WINDIR 'System32\ie4uinit.exe'
if (Test-Path -LiteralPath $refresh) { & $refresh -show }
Write-Output "Original shortcuts: $backupDirectory"
