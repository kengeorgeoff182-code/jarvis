# ADR-0004: Repository location — OneDrive is temporary

Status: Accepted with a mandatory follow-up (updated 2026-09-04)

## Context

The repo currently lives at `C:\Users\kenge\OneDrive\PES\jarvis` because
that is where the user created it. Version-control repositories inside
OneDrive/cloud-sync folders are a known failure mode: file locks, sync
conflicts, and background sync can corrupt `.git` or the working tree, and
`node_modules` churn inflates sync traffic. Development tooling (Node 24)
resides in WSL, which accesses this folder through the slower `/mnt/c`
filesystem.

## Decision

- Keep the repo in place for phase 1 (the tooling workspace is bound to this
  path, and everything is reproducible from source).
- `.gitignore` keeps volatile content (`node_modules/`, `dist/`, `.env`)
  out of version control.
- **Follow-up:** before phase 2 feature work begins, move the repo to a
  non-synced location (`C:\dev\jarvis` or WSL `~`), which requires opening
  the Freebuff workspace at the new path. Dev-server watch mode on
  OneDrive/`/mnt/c` is unreliable; treat it as unsupported until relocation.

## Update: `node_modules` bind-mount mitigation (phase 1)

Cold-loading dependencies from `/mnt/c` proved pathologically slow — AV +
OneDrive overhead on every file read made `require('jsdom')` take ~3m41s
(0.9s on WSL ext4). That exceeds vitest's hard-coded 60s worker-start
timeout, so the web test suite could not pass. drvfs symlinks are not a
fix: OneDrive replaces them with a real directory during sync.

Resolution: the dependency tree lives on the WSL ext4 filesystem and is
bind-mounted over the repo's `node_modules` path.

- Source: `/home/kenge/jarvis-node_modules` (WSL VHDX, survives everything).
- Mount point: `/mnt/c/Users/kenge/OneDrive/PES/jarvis/node_modules`.
- A systemd unit (`jarvis-node-modules.service`, enabled) re-applies the
  bind mount at every WSL boot: `ExecStartPre` recreates the mount point if
  it is missing, `Restart=on-failure` retries until `/mnt/c` is up.
- From Windows/OneDrive's perspective `node_modules` is an ordinary
  (gitignored) directory, so sync never sees the mount.

Operational notes:

- Verify it is active with `mountpoint node_modules` inside WSL; the service
  can be checked via `systemctl status jarvis-node-modules.service`.
- To tear the mechanism down: `sudo systemctl disable --now
  jarvis-node-modules.service`, then delete `/home/kenge/jarvis-node_modules`.
- The unit file was chosen over an `/etc/fstab` entry because wsl.exe's own
  early `mount -a` pass races systemd and prints a spurious
  "Processing /etc/fstab failed" warning on every boot.
- Installing new dependencies writes through the mount to ext4 and is fast.
- The WSL VM idle-terminates ~60s after the last `wsl.exe` client exits,
  taking background dev servers with it. To run dev servers persistently,
  either keep a WSL terminal open or raise the VM idle timeout via
  `%USERPROFILE%\.wslconfig` (`[wsl2]` → `vmIdleTimeout`).

## Consequences

- Accepting short-term sync risk in exchange for keeping the workspace
  functional and accessible to the tooling.
- All four gates (`lint`, `typecheck`, `test`, `build`) run green with the
  bind mount in place; `npm install` is fast.
- The relocation step must not lose history: move (not copy) the directory
  including `.git`, then verify `git status` and the full gate chain at the
  new location. After relocation the bind mount becomes unnecessary and
  should be removed.
