# ICKU — Full-Stack App

Production build of the ICKU platform. Monorepo with two workspaces:

- **`client/`** — React + Vite + Tailwind (the UI)
- **`server/`** — Node + Express + Prisma + PostgreSQL (the API)

This is **Step 1 (Foundation)** from [`../ARCHITECTURE.md`](../ARCHITECTURE.md):
the walking skeleton — client ↔ API ↔ database wired together, with your real
`users` and `departments` seeded from the prototype.

---

## ✅ Already set up on this Mac

Everything below (Node, PostgreSQL, dependencies, database, seed) is **already done**.
Node lives at `~/.local/opt/node`, Postgres at `~/.local/opt/pgsql` (data in
`~/.local/var/icku-pgdata`), both added to your `~/.zshrc`. To run it day-to-day:

```bash
cd "ICKU/app"
./scripts/db-start.sh      # start PostgreSQL (once per boot)
npm run dev                # start API (:4000) + web (:5173)
```

Open **http://localhost:5173**. To stop the database later: `./scripts/db-stop.sh`.

> Note: because your macOS Command Line Tools are older than Homebrew's prebuilt
> binaries expect, we installed **Node** and **PostgreSQL** from official prebuilt
> downloads instead of `brew` (which tried to compile from source). The steps in the
> next section are the generic Homebrew path for a fresh machine.

---

## Prerequisites (install once)

You need two tools that aren't on this machine yet:

1. **Node.js** (v18 or newer) — the JavaScript runtime for both client and server.
2. **PostgreSQL** (v14 or newer) — the database.

On macOS with Homebrew (already installed):

```bash
brew install node
brew install postgresql@16
brew services start postgresql@16
```

Verify:

```bash
node -v      # should print v18+ (e.g. v22.x)
npm -v
psql --version
```

---

## First-time setup

From this `app/` folder:

```bash
# 1. Install all dependencies (both client and server)
npm install

# 2. Create the database and a db user
createdb icku
psql -d icku -c "CREATE USER icku WITH PASSWORD 'icku'; GRANT ALL PRIVILEGES ON DATABASE icku TO icku;"

# 3. Configure the server's environment
cp server/.env.example server/.env
#   -> open server/.env and confirm DATABASE_URL matches the db/user above

# 4. Create the tables from the Prisma schema
npm run prisma:migrate        # name the migration e.g. "init"

# 5. Seed real data (10 departments, 53 users, 5 login accounts)
npm run seed
```

---

## Run it

```bash
npm run dev
```

- API → http://localhost:4000/api/v1
- Web → http://localhost:5173

Open the web URL. You should see the departments and org loaded **from the database
through the API** — that proves all three tiers are wired together.

You can also hit the API directly:

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:4000/api/v1/departments
curl http://localhost:4000/api/v1/users
```

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Run client + server together |
| `npm run dev:server` | Run only the API |
| `npm run dev:client` | Run only the web app |
| `npm run seed` | Re-seed departments/users/logins |
| `npm run prisma:migrate` | Apply schema changes to the DB |
| `npm run prisma:studio` | Open a visual DB browser |

---

## Demo login accounts (seeded)

| Username | Password | Role |
|---|---|---|
| `ceo` | `ceo@123` | CEO (full admin) |
| `cos` | `cos@123` | Chief of Staff |
| `coursemgr` | `cm@123` | Course Manager |
| `hod78` | `hod@123` | Academic HOD |
| `hrhead` | `hr@123` | HR Head (admin) |

> Passwords are stored **hashed** (bcrypt). Login itself is built in **Step 2**.

---

## What's next

Step 2 (Auth) adds `/auth/login`, JWT, protected routes, and the app shell
(sidebar + topbar). See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) Part 10 for the
full build order.
