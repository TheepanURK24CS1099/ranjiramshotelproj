#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${API_ENV_FILE:-}" ]]; then
  api_environment_file="$API_ENV_FILE"
elif [[ -f "$repository_root/apps/api/.env" ]]; then
  # dotenv/config loads this file by default.
  api_environment_file="$repository_root/apps/api/.env"
else
  # Retain support for the previous production-file convention.
  api_environment_file="$repository_root/apps/api/.env.production"
fi
web_environment_file="${WEB_ENV_FILE:-$repository_root/apps/web/.env.production}"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
require_file() { [[ -f "$1" ]] || fail "missing $1"; }
require_file "$api_environment_file"
require_file "$web_environment_file"

required_web=(NODE_ENV PORT NEXT_PUBLIC_API_URL)

has_assignment() {
  local file="$1" key="$2"
  grep -q "^${key}=" "$file"
}

environment_value() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

require_value() {
  local file="$1" key="$2" value
  value="$(environment_value "$file" "$key")"
  [[ -n "$value" ]] || fail "$key is missing or empty in $file"
}

require_effective_value() {
  local file="$1" primary_key="$2" fallback_key="$3"
  if has_assignment "$file" "$primary_key"; then
    require_value "$file" "$primary_key"
    environment_value "$file" "$primary_key"
  else
    require_value "$file" "$fallback_key"
    environment_value "$file" "$fallback_key"
  fi
}

for key in NODE_ENV DATABASE_URL TRUST_PROXY ADMS_BODY_LIMIT ADMS_TIMEZONE_OFFSET ATTENDANCE_SCHEDULER_ENABLED ATTENDANCE_SCHEDULER_CRON ATTENDANCE_SCHEDULER_TIMEZONE; do
  require_value "$api_environment_file" "$key"
done
for key in "${required_web[@]}"; do require_value "$web_environment_file" "$key"; done

grep -qx 'NODE_ENV=production' "$api_environment_file" || fail "API NODE_ENV must be production"
api_host="127.0.0.1"
if has_assignment "$api_environment_file" API_HOST; then
  api_host="$(environment_value "$api_environment_file" API_HOST)"
  [[ -n "$api_host" ]] || fail "API_HOST is empty in $api_environment_file"
fi
[[ -n "$api_host" ]] || fail "API_HOST must be configured or use its valid default"

[[ "$(require_effective_value "$api_environment_file" API_PORT PORT)" == '3021' ]] || fail "API_PORT or PORT must be 3021"
[[ "$(require_effective_value "$api_environment_file" WEB_ORIGIN CORS_ORIGIN)" == 'https://hotel.srcheckin.com' ]] || fail "API WEB_ORIGIN or CORS_ORIGIN is incorrect"
grep -qx 'TRUST_PROXY=true' "$api_environment_file" || fail "API TRUST_PROXY must be true"
grep -Eq '^DATABASE_URL=.*[/]hotel_management([?].*)?$' "$api_environment_file" || fail "DATABASE_URL must target hotel_management"
grep -qx 'ATTENDANCE_SCHEDULER_ENABLED=true' "$api_environment_file" || fail "ATTENDANCE_SCHEDULER_ENABLED must be true"
grep -qx 'ATTENDANCE_SCHEDULER_TIMEZONE=Asia/Kolkata' "$api_environment_file" || fail "ATTENDANCE_SCHEDULER_TIMEZONE must be Asia/Kolkata"
grep -qx 'NODE_ENV=production' "$web_environment_file" || fail "web NODE_ENV must be production"
grep -qx 'PORT=3020' "$web_environment_file" || fail "web PORT must be 3020"
grep -qx 'NEXT_PUBLIC_API_URL=https://hotel.srcheckin.com/api' "$web_environment_file" || fail "web API URL is incorrect"

[[ -d "$repository_root/apps/api/dist" ]] || fail "API build folder is missing"
[[ -d "$repository_root/apps/web/.next" ]] || fail "web build folder is missing"
if rg -n -i '(hostel|mansion)' "$repository_root/infrastructure/pm2" "$repository_root/infrastructure/nginx" "$repository_root/infrastructure/backup" "$repository_root/infrastructure/scripts"; then
  fail "deployment infrastructure contains Hostel or Mansion references"
fi

curl --fail --silent --show-error http://127.0.0.1:3021/health >/dev/null || fail "API /health is unavailable on port 3021"
curl --fail --silent --show-error http://127.0.0.1:3021/readiness >/dev/null || fail "API /readiness is unavailable on port 3021"
printf 'Production validation passed.\n'
