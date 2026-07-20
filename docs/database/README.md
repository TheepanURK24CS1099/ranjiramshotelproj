# Database Foundation Notes

This repository now has a PostgreSQL foundation for the API layer, with the default local connection targeting the `hotel_management` database.

## Current Status

- PostgreSQL pool foundation is in place for the API.
- Database configuration is validated and guarded against empty or unsafe values.
- The `/health` endpoint remains liveness-only and does not query PostgreSQL.
- The `/ready` endpoint checks PostgreSQL readiness.
- `corepack pnpm db:check` runs a safe connectivity probe.

## Isolation

The hotel system remains isolated from Hostel and Mansion databases. No shared database, credentials, or runtime components are introduced here.

## Scope

No business tables, migration system, authentication, or attendance modules exist yet.

## Safety

- No credentials or production backups belong in Git.
- Future schema changes must be reviewed and introduced through reviewed migrations.
- This foundation does not create databases or schema objects automatically; create the `hotel_management` database manually if it does not already exist.
