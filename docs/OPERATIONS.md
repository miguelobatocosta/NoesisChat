# OPERATIONS.md — running Pausa on the host PC

Everything here runs from a terminal in the repo folder (`C:\_Dev\NoesisChat`).

## 1. One-time setup (Windows)

1. **Node.js LTS** from nodejs.org (22.12 or newer; any current LTS is fine).
2. **pnpm:** `npm install -g pnpm`. The repo pins the exact version (`packageManager` in `package.json`)
   and pnpm switches to it automatically.
3. **cloudflared:** `winget install --id Cloudflare.cloudflared`, then open a new terminal.
4. In the repo: `pnpm install`. If pnpm asks about build scripts, approve `better-sqlite3` and `esbuild`
   (they're already allowed in `pnpm-workspace.yaml`).
5. Copy `.env.example` to `.env` and set `ALLOWED_MAIL` (see §3).
6. Optional, for running the browser tests: `pnpm e2e:install` (downloads Playwright's Chromium once).

## 2. Day to day

| What | Command |
|---|---|
| Demo / real use, reachable by colleagues | `pnpm demo` |
| Local only (this PC), production build | `pnpm start` → http://localhost:4747 |
| Development with hot reload | `pnpm dev` → http://localhost:5173 |
| First host sign-in link (local) | `pnpm server:init --name "Costa"` |
| Sign the host in on another browser | `pnpm server:init` (once a host exists, it prints a device link) |
| Member invite from the terminal | `pnpm server:invite --name "Marta" --expires 7d` |
| Backup now | `pnpm backup` |
| Restore a backup | stop the server, then `pnpm restore data\backups\2026-11-23-180000` |

**Stopping:** `Ctrl+C` in the terminal. Connected people see "O servidor foi desligado" and reconnect
by themselves when it comes back (with the same URL).

## 3. Who can get in: two locks

1. **Cloudflare email gate (outer).** `pnpm demo` starts the tunnel with `--allowed-mail $ALLOWED_MAIL`.
   Visitors type their email, get a one-time PIN from Cloudflare, and only listed addresses pass.
   ```
   ALLOWED_MAIL=ana@empresa.pt,rui@empresa.pt     # specific people
   ALLOWED_MAIL=*@empresa.pt                     # a whole company domain
   ```
   Changing the list means stopping and restarting `pnpm demo`.
2. **Invites (inner).** Passing the gate shows the app, but nothing inside without an invite.
   Create invites in **menu → Administração → Criar convite** and send the link over Teams/email.
   Each link works once and expires (24 h or 7 days).

## 4. Quick-tunnel limits (read before a demo)

- **The URL changes every time `pnpm demo` starts.** Sessions belong to the old address, so after a
  restart everyone needs a new invite. For a demo that's fine. For a pilot longer than a day, see §8.
- No uptime guarantee from Cloudflare; up to 200 requests in flight; interactive browsers only.
- **Before the demo, test from a colleague's laptop on the office network** (DECISIONS D-00).
  Some company web filters block `trycloudflare.com`. A block page means you need §8.

## 5. Keep the PC awake

The PC *is* the server. If it sleeps, everyone goes offline.
Settings → System → Power → Screen and sleep → **"When plugged in, put my device to sleep after: Never"**.
Keep it plugged in. Windows Update restarts will also take it down: pause updates on demo day.

## 6. Backups

- `pnpm backup` writes `data\backups\<date-time>\` with a consistent copy of `db.sqlite` (SQLite online
  backup, safe while running), every uploaded image and a small manifest. The newest 14 are kept.
- **A backup on the same disk is not a backup.** Copy the folder to OneDrive or a USB disk.
- Automate it: Task Scheduler → Create Basic Task → Daily → Start a program:
  `cmd.exe` with arguments `/c cd /d C:\_Dev\NoesisChat && pnpm backup`.
- Restore: stop the server, run `pnpm restore <folder>`. The current data is moved to
  `data\pre-restore-<timestamp>\`, never deleted.

## 7. Account deletion and moderation (manual in v1)

- **Remove someone's access:** Administração → Membros → Retirar acesso. Immediate; they can't return
  without a new invite. Their messages stay.
- **Someone asks for their data to be deleted (GDPR):** revoke them as above, then, with the server
  stopped, open `data\db.sqlite` in [DB Browser for SQLite](https://sqlitebrowser.org/) and run:
  ```sql
  -- replace USER_ID with their id (SELECT id, display_name FROM users;)
  UPDATE messages SET body = NULL, deleted_at = strftime('%s','now')*1000 WHERE user_id = 'USER_ID';
  DELETE FROM reactions WHERE user_id = 'USER_ID';
  DELETE FROM mentions WHERE user_id = 'USER_ID';
  UPDATE users SET display_name = 'Antigo membro', name_key = 'antigo membro ' || id WHERE id = 'USER_ID';
  ```
  Their uploaded images: delete the files in `data\uploads` whose names match
  `SELECT path FROM attachments WHERE uploader_id = 'USER_ID';`, then delete those rows.
  Then take a fresh backup and delete older backups that still contain their data.
- Every admin action is in Administração → Registo.

## 8. Going past the demo: stable URL

Needed for any pilot longer than a day, or if the office filter blocks `trycloudflare.com`.

1. Buy a cheap domain and add it to a free Cloudflare account.
2. `cloudflared tunnel login`, then `cloudflared tunnel create pausa`.
3. Route a hostname: `cloudflared tunnel route dns pausa chat.yourdomain.pt`.
4. Config file `%USERPROFILE%\.cloudflared\config.yml`:
   ```yaml
   tunnel: pausa
   credentials-file: C:\Users\<you>\.cloudflared\<tunnel-id>.json
   ingress:
     - hostname: chat.yourdomain.pt
       service: http://127.0.0.1:4747
     - service: http_status:404
   ```
5. Install as a Windows service: `cloudflared service install`.
6. Zero Trust dashboard → Access → Applications → add `chat.yourdomain.pt` with a policy
   "Emails ending in @empresa.pt" (One-time PIN login). Same gate as the demo, permanent.
7. In `.env`: `PUBLIC_URL=https://chat.yourdomain.pt`, then run the server with `pnpm start`.
   Run it at logon with Task Scheduler, or move the whole folder to a small VPS: no code changes.

## 9. Moving to a VPS or Raspberry Pi

Copy the repo and the `data` folder, install Node + pnpm, `pnpm install`, set `.env`, `pnpm start`.
Put cloudflared on the same machine (§8). Nothing in the code assumes Windows or this PC.

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `pnpm install` fails on better-sqlite3 | Build scripts blocked: run `pnpm approve-builds`, approve it, reinstall |
| `pnpm demo` says ALLOWED_MAIL is empty | Set it in `.env` (§3) |
| `pnpm demo` says cloudflared isn't installed | §1 step 3, then open a new terminal |
| Colleague sees a company "blocked" page | Office web filter blocks trycloudflare.com → §8 |
| Everyone was logged out | `pnpm demo` restarted, so the URL changed (§4) |
| "Pedido recusado" (BAD_ORIGIN) | Opening the app on an address that isn't PUBLIC_URL or localhost |
| Header pill red: "Servidor offline" | Server stopped, PC asleep, or tunnel down |
