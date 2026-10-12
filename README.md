# ATM Camera Checklist — Vue.js (Vite) + Node.js

A proper split project:
- **`frontend/`** — a real Vue.js 3 project built with **Vite** (`.vue` single-file components, `npm run dev`, `npm run build`) — this is the standard way Vue projects are set up.
- **`backend/`** — a Node.js API server (no framework needed) that saves each day's results to a JSON file and sends email alerts for faulty sites.

They run as two separate processes and talk over HTTP (the frontend dev server proxies `/api/...` calls to the backend).

## Open in VS Code
1. Unzip the download, e.g. into a folder `atm-app`
2. VS Code → File → Open Folder... → select `atm-app` (it contains both `frontend/` and `backend/`)
3. Open **two terminals** in VS Code (one for backend, one for frontend)

## 1) Start the backend (API + email alerts)
```bash
cd backend
npm install      # installs nodemailer — do this once
npm start         # starts the API on http://localhost:3000
```

## 2) Start the frontend (Vue.js / Vite)
In a **second terminal**:
```bash
cd frontend
npm install      # installs vue + vite — do this once
npm run dev        # starts the Vue app on http://localhost:5173
```

Open **http://localhost:5173** in your browser — that's the actual app. (Port 3000 is just the API; you don't need to open it directly.)

> `npm run dev` only exists inside `frontend/` (that's the Vite dev command). Running it inside `backend/` won't work — that folder only has `npm start`.

## Project structure
```
atm-app/
├── backend/
│   ├── server.js           # Node.js API (login, GET/POST /api/checklist, sends email)
│   ├── db.js                # Oracle (oracledb): login check + ATM site list (getSites)
│   ├── schema.sql            # creates "users", "atm_sites", "audit_logs" tables (run this once)
│   ├── package.json
│   ├── config.json           # SMTP + Oracle settings — edit before real use
│   ├── default-rows.json    # fallback site list, used only if Oracle isn't set up
│   └── data/                  # each day's saved tick results (auto-created)
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js         # dev-server proxy: /api -> http://localhost:3000
    └── src/
        ├── main.js
        ├── App.vue             # switches between Login and Checklist
        ├── Login.vue            # sign-in form
        ├── Checklist.vue        # the checklist page (moved out of App.vue)
        └── style.css
```

## ATM / branch site list (from Oracle)
The checklist's site list (ATMID, Adress, IP_CAM, Video_IP, alert email) is pulled **live from the `atm_sites` table** in your Oracle database — not from a static file. Add, edit, or remove branches directly in that table and the web page picks it up immediately, with no restart needed.

**Before this will work you need the Oracle Instant Client installed** on the machine running the backend — the `oracledb` npm package needs it to connect. See https://oracle.github.io/node-oracledb/INSTALL.html for the installer for your OS.

- `backend/schema.sql` creates `atm_sites` with columns `atmid`, `adress`, `ip_cam`, `video_ip`, `email` — delete the sample rows and import your real branch list (e.g. via phpMyAdmin's Import, a CSV `LOAD DATA`, or your own insert script).
- **Your real table/column names don't have to match at all.** `config.json` has a `db.sitesTable` and `db.sitesColumns` section — set those to your actual table name and column names and the app will use them, no code changes needed. Example: if your table is called `TBL_ATM` with a column `BRANCH_NAME` instead of `adress`, just set `"sitesTable": "TBL_ATM"` and `"adress": "BRANCH_NAME"` in config.json.
- If your data is spread across more than one table and needs a JOIN, that's the one case that still needs a code change — send me the table/column names and how they relate, and I'll update the query in `backend/db.js` (`getSites()`).
- If Oracle isn't configured yet (or the query fails for any reason), the app automatically falls back to `backend/default-rows.json` so it still works while you're setting things up.
- Each day's saved checkbox results are stored separately in `backend/data/YYYY-MM-DD.json` — only the branch *list* comes from the database; the daily ticks are not (see `backend/schema.sql` for an optional Oracle table to hold them instead, `checklist_records`, not wired up yet).

## The checklist sheet (matches the paper form)
Each ATM row has 4 groups — **Cam_conect, Cam_work, DRV_conect, Cam_save** — and each group has its own independent **connect** / **disconnect** checkbox (not a radio button, so both, either, or neither can be ticked, exactly like the paper sheet). A row is flagged as a fault (red highlight + alert email) when any group's **disconnect** box is checked.

## Audit log (new)
Every login and every checklist save is now recorded in the `audit_logs` table (`action_type` = `LOGIN` or `SUBMIT_INSPECTION`, plus `user_id`, `ip_address`, and a timestamp). It uses the same Oracle connection as everything else — no extra setup needed. If the database isn't configured yet, audit logging just silently skips instead of breaking login/save.

`CREATE_ATM` and `UPDATE_ATM` logging will be added once the Master Data admin screen is built — there's no ATM create/edit feature yet to log.

## Staff login (Oracle) — optional, currently OFF

**By default, login is turned OFF** (`"requireLogin": false` in `backend/config.json`), so you can use the checklist right away without setting up Oracle/users first. While it's off, the page shows "Login is currently disabled" instead of a sign-in form and anyone who reaches the page can use the checklist directly.

**To turn login on later**, once you've set up the `users` table (see below):
1. Edit `backend/config.json` and change `"requireLogin": false` to `"requireLogin": true`
2. Restart the backend (`Ctrl+C`, then `npm start` again)
3. Refresh the page — it will now show the sign-in form

The rest of this section explains how the login system works, for whenever you're ready to turn it on.

The app checks a `users` table in your Oracle database.

**1) Create the tables** — run `backend/schema.sql` against your Oracle database (e.g. with SQL*Plus or SQL Developer):
```bash
sqlplus your_oracle_user/your_oracle_password@localhost:1521/ORCLPDB1 @schema.sql
```
This creates a `users` table (`id`, `username`, `password`, `display_name`) and one sample login: **admin / admin123**. Change or delete this sample user before going live.

**2) Point the app at your database** — edit the `db` section of `backend/config.json`:
```json
"db": {
  "host": "localhost",
  "port": 3306,
  "user": "root",
  "password": "your-oracle-password",
  "database": "atm_checklist"
}
```

**3) Restart the backend** (`Ctrl+C`, then `npm start` again) so it picks up the new config.

Passwords are currently checked as **plain text**, matching `schema.sql`. This is fine to get started with, but for real deployment switch to hashed passwords:
- add the `bcrypt` package (`npm install bcrypt` inside `backend/`)
- store hashed passwords in the `password` column instead of plain text
- in `backend/db.js`, replace the plain-text comparison in `checkLogin()` with `await bcrypt.compare(password, user.password)`

If your existing `users` table has different column names, tell me what they are and I'll adjust the query in `backend/db.js` to match.

Sessions last 8 hours and live in the backend's memory, so everyone is logged out if the backend restarts — that's expected for a small internal tool like this.

## Configure real email sending
Edit `backend/config.json`:
```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "your-email@gmail.com",
    "pass": "your-app-password"
  },
  "from": "\"ATM Camera Alert\" <your-email@gmail.com>",
  "ccTo": []
}
```
- Gmail: turn on 2-Step Verification, create an **App Password**, put it in `pass`.
- Company SMTP (e.g. bank's Outlook/Exchange): ask IT for `host`/`port`/`user`/`pass`.
- `ccTo`: array of emails to always CC on alerts, e.g. `["boss@company.com"]`.

## Editing the site list / emails
Edit `backend/default-rows.json` — each entry has an `email` used for the alert when that site has a fault. Replace the placeholder `xxx@example.com` addresses with the real ones.

## Deploying as a single server (optional)
If you don't want to run two servers in production:
```bash
cd frontend
npm run build       # creates frontend/dist
cd ../backend
npm start             # will now also serve frontend/dist automatically at http://localhost:3000
```
In this mode you only need the backend running — it detects `frontend/dist` and serves the built Vue app itself.

## Notes
- Emails are sent only for sites with at least one "Faulty" item, each time "Save & send alerts" is clicked.
- The page shows a summary of which sites were emailed successfully vs. failed.
- Want more? e.g. preventing duplicate emails on repeated saves the same day, LINE/Telegram alerts, PDF/Excel export, staff login — just ask.
