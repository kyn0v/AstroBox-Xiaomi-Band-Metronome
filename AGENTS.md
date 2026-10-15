# Workflow

After successfully building and verifying a new application package, copy that exact `.rpk` file to `~/Library/Mobile Documents/com~apple~CloudDocs/TempHub/` (the owner's requested iCloud delivery folder; resolve `~` using the current user's home directory), then reveal that copy in Finder with `open -R`. Do not overwrite another package without checking it. The owner installs manually from the phone; local copy success does not confirm iCloud synchronization. After verifying the new delivery copy, remove older RPKs for this application from the project's `dist/` and `artifacts/` directories and the iCloud delivery folder, keeping the new verified package. Do not remove other applications' packages. Do not automatically AirDrop, install packages on the band, or flash device firmware.

# Repository branches

The remote repository is `kyn0v/astrobox-xiaomi-band-metronome`. Develop on `source`; `main` contains CreatorConsole-managed release resources. Do not merge these independent histories. Keep the manual build workflow identical on both branches; dispatch it on `source` only. Never delete the AstroBox fork or a branch used by an open store PR.

# Publication privacy

Use the repository-local project identity for Git commits; do not fall back to a personal global Git identity. Keep private history backups and legacy packages outside this repository and the public delivery directory. Never publish local user-directory paths, personal contact details, signing private keys, or access tokens. Scan both tracked files and commit metadata before pushing. The current package ID is `org.bandmetronome.app`.
