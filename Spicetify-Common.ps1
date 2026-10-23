function Resolve-DJSpicetify {
    param([string]$SpicetifyPath)
    if ($SpicetifyPath) {
        if (!(Test-Path -LiteralPath $SpicetifyPath -PathType Leaf)) { throw 'The specified Spicetify executable was not found.' }
        return (Resolve-Path -LiteralPath $SpicetifyPath).Path
    }
    $command = Get-Command spicetify -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA 'spicetify\spicetify.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\spicetify.exe')
    )) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    $packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    $package = Get-ChildItem -Path (Join-Path $packageRoot 'Spicetify.Spicetify_*') -Filter spicetify.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($package) { return $package.FullName }
    throw 'Spicetify was not found. Install it first with: winget install --id Spicetify.Spicetify --exact'
}

function Invoke-DJSpicetify {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Spicetify failed ($LASTEXITCODE): $($Arguments -join ' ')" }
}

function Get-DJSpicetifyConfig {
    param([string]$Executable)
    $configPath = (& $Executable -c | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or !$configPath) { throw 'Spicetify did not return a configuration path.' }
    if (!(Test-Path -LiteralPath $configPath)) {
        Invoke-DJSpicetify -Executable $Executable -Arguments @()
    }
    if (!(Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Spicetify configuration was not created. Run spicetify once and check its Spotify paths.' }
    return $configPath
}

function Get-DJIniValue {
    param([string]$Text, [string]$Section, [string]$Key)
    $currentSection = ''
    foreach ($line in ($Text -split '\r?\n')) {
        if ($line -match '^\s*\[([^\]]+)\]') { $currentSection = $Matches[1]; continue }
        if ($currentSection -ieq $Section -and $line -match ('^\s*' + [regex]::Escape($Key) + '\s*=\s*(.*?)\s*$')) { return $Matches[1] }
    }
    return ''
}
