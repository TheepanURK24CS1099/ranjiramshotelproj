# Database Foundation Notes

This repository now has a PostgreSQL foundation for the API layer, with the default local connection targeting the `hotel_management` database.

## Current Status

- PostgreSQL pool foundation is in place for the API.
- Database configuration is validated and guarded against empty or unsafe values.
- The `/health` endpoint remains liveness-only and does not query PostgreSQL.
- The `/ready` endpoint checks PostgreSQL readiness.
- `corepack pnpm db:check` runs a safe connectivity probe.

## Migrations

- Migrations are managed with `node-pg-migrate` in `apps/api`.
- Migration commands (root):
	- `pnpm db:migrate` — run pending migrations against `hotel_management`.
	- `pnpm db:migrate:status` — show migration status.
- API-level scripts (in `apps/api`):
	- `pnpm --filter @hotel/api run db:migrate`
	- `pnpm --filter @hotel/api run db:migrate:status`
	- `pnpm --filter @hotel/api run db:migrate:down <count>`

Note: `apps/api` ships a migration runner at `apps/api/src/scripts/migrate.ts` which validates `DATABASE_URL` via the existing environment validation before invoking migrations. The migrations table name is `schema_migrations`.

## Core schema (intent, initial migration)

This repository includes an initial, safe migration that creates the following tables (no business logic or payroll/attendance summaries are implemented):

- `app_users` — API users table. UUID `id`, `email` (unique, case-insensitive), `password_hash`, `role`, `active`, `created_at`, `updated_at`.
- `shifts` — named shifts with `start_time`, `end_time`, `grace_minutes` and `minimum_work_minutes`. Non-negative constraints and case-insensitive unique `name`.
- `employees` — staff with `biometric_id` (positive, unique), contact fields, `joining_date`, `weekly_off_day` (0–6), `active`, timestamps.
- `employee_shift_assignments` — assignment of employees to shifts with `effective_from`/`effective_to`, FK to `employees` and `shifts`, check that `effective_to` is null or >= `effective_from`, and indexes on employee and effective date ranges.
- `salary_history` — historical monthly salary records with `monthly_salary` numeric(12,2) > 0, `effective_from`/`effective_to`, timestamps, and uniqueness/indexing to support non-overlapping ranges per employee.
- `advance_transactions` — preserves advance/repayment history: `type` limited to `OPENING_ADVANCE`, `ADVANCE`, `REPAYMENT`, `ADJUSTMENT`, `amount` numeric(12,2) > 0, `transaction_date`, `notes`, timestamps; references `employees` with RESTRICT on delete.
- `devices` — timeclock device registry with `device_code` unique, status `ONLINE|OFFLINE`, `last_seen`, `last_ip`, firmware, active flag and timestamps.
- `raw_attendance_punches` — immutable raw punches: bigint identity `id`, `device_id`, `biometric_id`, `punch_time` timestamptz, optional `punch_state`/`verify_mode`, optional `source_event_key` unique, `raw_payload` jsonb and `received_at` timestamptz. Indexes on biometric_id/punch_time and device_id/punch_time. Raw punches are retained even if employee record changes.

## Important constraints & design choices

- Uses `pgcrypto` and `gen_random_uuid()` for UUID generation.
- Reusable `hotel_updated_at_trigger()` sets `updated_at` automatically for modified rows.
- All migrations are executed transactionally where possible.
- Foreign keys use `ON DELETE RESTRICT` to preserve history (no cascade deletes).
- The migrations table is `schema_migrations` to keep migration state private to this system.

## What is intentionally not included

- No attendance summaries, payroll or payslip tables.
- No seed users or admin credentials.
- No ADMS routes, authentication logic, attendance calculations, or payroll code.

## How to run (local developer)

1. Ensure you have a local `hotel_management` PostgreSQL database reachable from `DATABASE_URL` (see `apps/api/.env.example`).
2. Install dependencies:

```bash
corepack pnpm install --frozen-lockfile
```

3. Run typecheck, lint and tests for API:

```bash
corepack pnpm --filter @hotel/api typecheck
corepack pnpm --filter @hotel/api lint
corepack pnpm --filter @hotel/api test
```

4. Run migrations:

```bash
corepack pnpm db:migrate
corepack pnpm db:migrate:status
```

## Relationship summary

- `employees` is the core staff table referenced by `employee_shift_assignments`, `salary_history`, and `advance_transactions`.
- `shifts` are referenced by `employee_shift_assignments`.
- `devices` are referenced by `raw_attendance_punches` (no cascade deletes).

## Notes on safety and review

- Migrations are the single source of truth for schema changes and must be reviewed before running in non-development environments.
- This initial migration is conservative: it avoids destructive cascade rules and preserves historical records.


## Isolation

The hotel system remains isolated from Hostel and Mansion databases. No shared database, credentials, or runtime components are introduced here.

## Scope

No business tables, migration system, authentication, or attendance modules exist yet.

## Safety

- No credentials or production backups belong in Git.
- Future schema changes must be reviewed and introduced through reviewed migrations.
- This foundation does not create databases or schema objects automatically; create the `hotel_management` database manually if it does not already exist.
