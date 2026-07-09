#!/usr/bin/env bash
# Stop the local ICKU PostgreSQL.
PGDIR="$HOME/.local/opt/pgsql"
DATA="$HOME/.local/var/icku-pgdata"

"$PGDIR/bin/pg_ctl" -D "$DATA" -m fast stop
echo "Postgres stopped."
