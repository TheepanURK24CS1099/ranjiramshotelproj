#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s <backup-file.dump> <target-database>\n' "$0" >&2
  exit 1
fi

backup_file="$1"
target_database="$2"

if [[ ! -f "$backup_file" ]]; then
  printf 'Backup file does not exist: %s\n' "$backup_file" >&2
  exit 1
fi

if [[ "$target_database" != "hotel_management" ]]; then
  printf 'Refusing restore: the explicit target database must be hotel_management.\n' >&2
  exit 1
fi

# PostgreSQL authentication is intentionally delegated to libpq (for example,
# DATABASE_URL, PGHOST/PGUSER, a protected .pgpass file, or peer auth).
pg_restore --dbname="$target_database" --clean --if-exists --no-owner --no-privileges "$backup_file"
printf 'Restore completed for database: %s\n' "$target_database"
