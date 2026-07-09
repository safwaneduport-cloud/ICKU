# Deploying ICKU

ICKU deploys as **one Render web service** (it serves both the API and the built
React app), with the **database on Supabase** (managed PostgreSQL). Everything
below is free-tier. Total time: ~20 minutes.

You need two free accounts: **Supabase** (supabase.com) and **Render**
(render.com). Signing up with GitHub for both is easiest.

---

## What's already done (by the code)

- ✅ Express serves the built React app in production (single service, same origin
  → no CORS or cross-site-cookie problems).
- ✅ `render.yaml` blueprint (web service, JWT secrets auto-generated).
- ✅ `prisma migrate deploy` runs automatically on every start (creates the tables).
- ✅ Configured for Supabase — the app just needs your `DATABASE_URL`.

---

## Step 1 — Push to GitHub

Create an **empty** repo on GitHub (no README/gitignore), name it e.g. `icku`.
Then, from the `ICKU/app` folder:

```bash
git remote add origin https://github.com/<your-username>/icku.git
git push -u origin main
```

> The `app/` folder **is** the repo root (that's where `.git` and `render.yaml` live).

---

## Step 2 — Create the database on Supabase

1. Go to **https://supabase.com** → sign in → **New project**.
2. Give it a name (e.g. `icku`), set a **database password** (save it somewhere),
   pick a region near you → **Create new project**. Wait ~1 minute for it to spin up.
3. Get your connection string: **Project Settings** (gear icon) → **Database** →
   **Connection string** → choose the **Session pooler** tab. Copy the string —
   it looks like:

   ```
   postgresql://postgres.abcdxyz:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

4. Replace `[YOUR-PASSWORD]` with the database password from step 2. **Keep this
   final string handy** — you'll paste it into Render in the next step.

> Why the "Session pooler" one? It works over IPv4 (which Render needs) and
> handles both the app's queries and the database migrations with a single URL.

---

## Step 3 — Deploy on Render (Blueprint)

1. Go to **https://render.com** → sign in.
2. Dashboard → **New +** → **Blueprint**.
3. Connect the GitHub repo you pushed. Render reads `render.yaml` and shows a
   **Web Service** named `icku`.
4. Render will prompt you to enter **`DATABASE_URL`** — paste the Supabase string
   from Step 2 here.
5. Click **Apply**. Render will install deps, build the client, run
   `prisma migrate deploy` (creates all tables in Supabase), and start the server.

First build takes ~3–5 minutes. When it's **Live**, open the service URL
(`https://icku-XXXX.onrender.com`). You'll see the login page — but no accounts
exist yet. Do Step 4.

---

## Step 4 — Seed the database (one time)

The tables exist but are empty. Seed the demo data (departments, 53 users, logins,
sample records):

- In the Render dashboard → your **icku** service → **Shell** tab → run:

  ```bash
  npm run seed
  ```

Refresh the site and log in with a demo account (e.g. `ceo` / `ceo@123`).

> The seed is idempotent (safe to re-run). You can also watch the data appear in
> Supabase → **Table Editor**.

---

## Done 🎉

Your app is live at the Render URL, with all data stored in Supabase. Share it,
log in, click around.

---

## Good to know (free tier)

- **Render web service sleeps** after ~15 min idle; the next request takes ~50s to
  wake. Upgrade the service to avoid this.
- **Supabase free projects pause** after ~1 week of no activity. If that happens,
  just open the project in the Supabase dashboard and **Restore/Resume** it —
  your data is kept.
- **Change the demo passwords** before sharing widely — they're public in this repo.
- **Auto-deploy:** every `git push` to `main` redeploys automatically.
- **Local dev is unchanged** — it still uses your local Postgres. Only production
  uses Supabase. (To use Supabase locally too, put the Supabase URL in
  `server/.env` as `DATABASE_URL`.)

## Custom domain (optional)

Render service → **Settings → Custom Domains** → add your domain and follow the DNS
instructions. HTTPS is automatic.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Can't reach database server` on deploy | You likely used the **Direct** connection (IPv6). Use the **Session pooler** string (port 5432) instead |
| Password error connecting | Make sure you replaced `[YOUR-PASSWORD]` in the URL with your real Supabase DB password |
| Build fails on `prisma` | `prisma` is in `dependencies` (it is) so it installs in production |
| Login works then logs out | Confirm `NODE_ENV=production` is set (makes the auth cookie `Secure`); `trust proxy` is already enabled |
| 404 on client routes | The SPA fallback is enabled in production — make sure the build ran (`client/dist` exists) |
