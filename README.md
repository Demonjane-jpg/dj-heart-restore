# DJ Heart Restore

A lightweight Spicetify extension that restores an always-visible heart beside the currently playing song, including Spotify AI DJ sessions.

Click the outlined heart to save the **actual current Spotify track to Liked Songs**. Click the green heart to remove it. The extension verifies Spotify's library state before updating the heart. No custom playlists, local favorites list, external servers, tracking, or runtime dependencies.

## Features

- Compact, accessible button beside the bottom-left song title and artist.
- Outlined heart for unsaved tracks; Spotify-green filled heart for saved tracks.
- Uses `Spicetify.Playbar.Widget`, with a fallback for Spotify's newer Now Playing container.
- Refreshes on song changes and library events, with a 2.5-second reconciliation check.
- Captures the track URI before writing, cancels stale preflight operations, and prevents duplicate clicks.
- Handles missing tracks, episodes, local files, unavailable items, failed requests, reinjection, and UI remounts.
- Optional pink Spotify shortcut icon, installed separately.

## Install on Windows

Requires Windows Spotify desktop and [Spicetify](https://spicetify.app/docs/getting-started). Open Spotify and sign in before first-time Spicetify setup. The standard desktop build is preferred; Microsoft Store compatibility is limited.

1. If needed, install Spicetify from a normal PowerShell window:

   ```powershell
   winget install --id Spicetify.Spicetify --exact
   ```

2. Download this repository using **Code → Download ZIP** and extract it, or clone it:

   ```powershell
   git clone https://github.com/Demonjane-jpg/dj-heart-restore.git
   Set-Location dj-heart-restore
   ```

3. Run:

   ```powershell
   .\Install-DJHeartRestore.ps1
   ```

The installer backs up the Spicetify config, copies `dj-heart-restore.js` into its `Extensions` folder, appends the extension without replacing existing extensions, enables API exposure, creates an initial backup if required, and applies Spicetify. Other theme and extension settings are preserved. It does not replace Spotify, modify shortcut icons, enable developer mode, or configure a debugging port.

Use `-NoRestart` to apply without restarting Spotify. All setup scripts accept `-SpicetifyPath` if Spicetify is installed somewhere outside PATH. They honor Spicetify's existing environment/configuration rather than bundling machine-specific paths.

Manual installation is also supported. Run `spicetify -c` to locate the configuration file, put `dj-heart-restore.js` in the adjacent `Extensions` directory, then run:

```powershell
spicetify config extensions dj-heart-restore.js
spicetify apply
```

If Spicetify has no backup yet, run `spicetify backup` before `apply`. If its backup is outdated after a Spotify update, follow the Spicetify CLI's instructions. For startup problems, consult [Spicetify's documentation](https://spicetify.app/docs/getting-started).

## Disable or remove

```powershell
.\Disable-DJHeartRestore.ps1
# Also delete the installed extension file:
.\Disable-DJHeartRestore.ps1 -RemoveFile
```

Manual equivalent:

```powershell
spicetify config extensions dj-heart-restore.js-
spicetify apply
```

These actions do not undo any likes. `Start-DJHeartRestore.ps1` runs `spicetify auto` when you want Spicetify to check and launch Spotify.

## Optional pink Spotify icon

![Pink Spotify icon](assets/spotify-pink.png)

```powershell
.\Set-PinkSpotifyIcon.ps1
```

This changes existing Spotify desktop/taskbar shortcuts to the included pink icon and backs up the original shortcuts. Targets and launch arguments are preserved. Keep the repository folder in place because Windows references its `.ico` file. To select a particular shortcut:

```powershell
.\Set-PinkSpotifyIcon.ps1 -ShortcutPath "$env:USERPROFILE\Desktop\Spotify.lnk"
```

Restore an original shortcut from `.shortcut-backups` to undo the icon change. The icon uses the Spotify SVG glyph from Spicetify; see [asset attribution](assets/NOTICE.md).

## Verification and limitations

Developed and live-tested with Spotify desktop **1.3.6.1921** and Spicetify **2.46.2** on Windows 11. Live AI DJ testing confirmed actual library save/remove, synchronization after a song change, and synchronization with library changes made outside the extension. Original library membership was restored after testing.

Smart Shuffle, ordinary shuffle, albums, real network failure, episodes, and local-file playback were **not tested live**. Context-independent URI handling and failure/race safeguards are covered by mocked tests. Spotify and Spicetify updates can change internal library APIs or UI containers.

Run the 17 behavioral tests with Node.js 18 or newer:

```powershell
node --check dj-heart-restore.js
node --test dj-heart-restore.test.cjs
```

The tests cover exact-track save/remove, duplicate clicks, playback changes during reads and writes, stale responses, library synchronization, unsupported content, rejected requests, failed verification, timed-out writes, cleanup, reinjection, and placement fallbacks.

## API notes

The extension checks the actual `Player.data.item.uri`. In Spicetify 2.46.2, `Player.setHeart` calls `LibraryAPI.add/remove` but discards the promise. This extension calls those same library methods with an explicit captured URI, awaits the operation, and verifies it using `contains`. It does not assume CSS or cached player metadata proves a successful save.

- [Playbar Widget documentation](https://spicetify.app/docs/development/api-wrapper/classes/playbar)
- [Player documentation](https://spicetify.app/docs/development/api-wrapper/methods/player)
- [Platform API documentation](https://spicetify.app/docs/development/api-wrapper/methods/platform)
- [Spicetify 2.46.2 Player source](https://github.com/spicetify/cli/blob/v2.46.2/src/jsHelper/spicetifyWrapper/core.js)

Platform library APIs are internal and feature-detected. The control disables writes if a trustworthy library state cannot be obtained. All production extension code is in `dj-heart-restore.js`; PowerShell scripts are optional Windows setup helpers.
