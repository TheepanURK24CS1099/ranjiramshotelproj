#!/usr/bin/env bash
set -Eeuo pipefail

# Supply DATABASE_URL through the environment; do not put credentials in this script.
: "${DATABASE_URL:?Set DATABASE_URL to the hotel_management PostgreSQL connection URL.}"

database_name="${DATABASE_URL%%\?*}"
database_name="${database_name##*/}"
if [[ "$database_name" != "hotel_management" ]]; then
  printf 'Refusing backup: DATABASE_URL must target hotel_management.\n' >&2
  exit 1
fi

backup_directory="${1:-./backups}"
mkdir -p "$backup_directory"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_directory/hotel_management_${timestamp}.dump"

umask 077
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --file="$backup_file"
printf 'Backup created: %s\n' "$backup_file"
