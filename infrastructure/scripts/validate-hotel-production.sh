#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
api_environment_file="${API_ENV_FILE:-$repository_root/apps/api/.env.production}"
web_environment_file="${WEB_ENV_FILE:-$repository_root/apps/web/.env.production}"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
require_file() { [[ -f "$1" ]] || fail "missing $1"; }
require_file "$api_environment_file"
require_file "$web_environment_file"

required_api=(NODE_ENV PORT DATABASE_URL SESSION_SECRET JWT_SECRET CORS_ORIGIN TRUST_PROXY ADMS_BODY_LIMIT ADMS_TIMEZONE_OFFSET ATTENDANCE_SCHEDULER_ENABLED ATTENDANCE_SCHEDULER_CRON ATTENDANCE_SCHEDULER_TIMEZONE FAST2SMS_API_KEY OWNER_WHATSAPP_NUMBER WHATSAPP_TEMPLATE_DAILY WHATSAPP_TEMPLATE_SHIFT)
required_web=(NODE_ENV PORT NEXT_PUBLIC_API_URL)

require_value() {
  local file="$1" key="$2" value
  value="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
  [[ -n "$value" ]] || fail "$key is missing or empty in $file"
}

for key in "${required_api[@]}"; do require_value "$api_environment_file" "$key"; done
for key in "${required_web[@]}"; do require_value "$web_environment_file" "$key"; done

grep -qx 'NODE_ENV=production' "$api_environment_file" || fail "API NODE_ENV must be production"
grep -qx 'PORT=3021' "$api_environment_file" || fail "API PORT must be 3021"
grep -qx 'CORS_ORIGIN=https://hotel.srcheckin.com' "$api_environment_file" || fail "API CORS_ORIGIN is incorrect"
grep -Eq '^DATABASE_URL=.*[/]hotel_management([?].*)?$' "$api_environment_file" || fail "DATABASE_URL must target hotel_management"
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
