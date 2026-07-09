#!/usr/bin/env bash
# Start the local ICKU PostgreSQL (Postgres.app binaries, self-contained — no Homebrew).
set -e
PGDIR="$HOME/.local/opt/pgsql"
DATA="$HOME/.local/var/icku-pgdata"

"$PGDIR/bin/pg_ctl" -D "$DATA" -l "$DATA/server.log" -o "-p 5432" -w start
"$PGDIR/bin/pg_isready" -h localhost -p 5432
echo "Postgres is running on localhost:5432 (db: icku)."
