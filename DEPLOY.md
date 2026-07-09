# Deploying ICKU to Render

ICKU deploys as **one Render web service** that serves both the API and the built
React app, backed by a **managed PostgreSQL** database. The code is already
production-ready and committed — these are the steps only you can do (they need
your accounts).

Everything below is free-tier. Total time: ~15 minutes.

---

## What's already done (by the code)

- ✅ Express serves the built React app in production (single service, same origin
  → no CORS or cross-site-cookie problems).
- ✅ `render.yaml` blueprint (web service + Postgres, JWT secrets auto-generated).
- ✅ `prisma migrate deploy` runs automatically on every start.
- ✅ Git repo initialised, first commit on `main`.
- ✅ Verified: the production build runs locally as a single service.

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

## Step 2 — Deploy on Render (Blueprint)

1. Sign up at **https://render.com** (log in with GitHub — easiest).
2. Dashboard → **New +** → **Blueprint**.
3. Connect the GitHub repo you just pushed. Render detects `render.yaml` and shows:
   - a **Web Service** named `icku`
   - a **PostgreSQL** database named `icku-db`
4. Click **Apply**. Render will:
   - create the database,
   - install deps, build the client, generate the Prisma client,
   - run `prisma migrate deploy` (creates all tables),
   - start the server.

First build takes ~3–5 minutes. When it's **Live**, open the service URL
(`https://icku-XXXX.onrender.com`).

> You'll see the login page — but no accounts exist yet. Do Step 3.

---

## Step 3 — Seed the database (one time)

The tables exist but are empty. Seed the demo data (departments, 53 users, logins,
sample records):

- In the Render dashboard → your **icku** service → **Shell** tab → run:

  ```bash
  npm run seed
  ```

Refresh the site and log in with a demo account (e.g. `ceo` / `ceo@123`).

> Alternatively, add `npm run seed && ` to the start command temporarily, or run
> the shell command above — the seed is idempotent (safe to re-run).

---

## Done 🎉

Your app is live at the Render URL. Share it, log in, click around.

---

## Good to know (free tier)

- **Cold starts:** the free web service sleeps after ~15 min idle; the next request
  takes ~50s to wake. Upgrade the service to avoid this.
- **Free Postgres** on Render expires after 90 days — fine for a demo. For anything
  real, use a paid plan or **Neon** (swap the `DATABASE_URL` env var).
- **Change the demo passwords** before sharing widely — they're public in this repo.
- **Auto-deploy:** every `git push` to `main` redeploys automatically.

## Custom domain (optional)

Render service → **Settings → Custom Domains** → add your domain and follow the DNS
instructions. HTTPS is automatic.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails on `prisma` | Ensure `prisma` is in `dependencies` (it is) so it installs in prod |
| DB connection error | On the DB page, copy the **Internal** connection string; Prisma may need `?sslmode=require` appended to `DATABASE_URL` |
| Login works then logs out | Confirm `NODE_ENV=production` is set (makes the auth cookie `Secure`); `trust proxy` is already enabled |
| 404 on client routes | The SPA fallback is enabled in production — make sure the build ran (`client/dist` exists) |
