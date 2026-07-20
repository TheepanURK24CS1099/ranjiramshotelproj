# Hotel API Foundation

This package contains the production-oriented Express API foundation for the Ranjirams Hotel Management System.

## Purpose

- Provide a separate backend foundation for `hotel-api`
- Keep the API isolated from the Next.js frontend
- Establish health checks, request IDs, structured logging, and central error handling
- Provide a PostgreSQL connection foundation with validated environment configuration

## Local Development

The API targets Node.js 24 for both development and production.

```bash
corepack pnpm --filter @hotel/api dev
```

## Commands

- Typecheck: `corepack pnpm --filter @hotel/api typecheck`
- Lint: `corepack pnpm --filter @hotel/api lint`
- Test: `corepack pnpm --filter @hotel/api test`
- Build: `corepack pnpm --filter @hotel/api build`
- Production start: `corepack pnpm --filter @hotel/api start`
- Database connectivity check: `corepack pnpm db:check`

## Local URLs

- Internal API URL: http://127.0.0.1:3022
- Health URL: http://127.0.0.1:3022/health
- Readiness URL: http://127.0.0.1:3022/ready

## Completed Part 8 Work

- PostgreSQL pool foundation
- Validated database configuration
- `/ready` endpoint
- Graceful pool shutdown
- Database check command

## Pending Work

- Schema and migrations
- Authentication
- Employees
- Shifts
- Attendance and ADMS
- Salary and advances
- Reports

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `development` |
| `API_HOST` | Bind host | `127.0.0.1` |
| `API_PORT` | Internal API port | `3022` |
| `WEB_ORIGIN` | Allowed frontend origin | `http://localhost:3020` |
| `LOG_LEVEL` | Pino log level | `info` |
| `TRUST_PROXY` | Express trust proxy setting | `false` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://127.0.0.1:5432/hotel_management` |
| `DB_POOL_MAX` | Maximum pool size | `10` |
| `DB_IDLE_TIMEOUT_MS` | Idle timeout in milliseconds | `30000` |
| `DB_CONNECTION_TIMEOUT_MS` | Connection timeout in milliseconds | `5000` |
| `DB_STATEMENT_TIMEOUT_MS` | Statement timeout in milliseconds | `10000` |
| `DB_SSL` | Enable SSL for PostgreSQL | `false` |
| `DB_SSL_REJECT_UNAUTHORIZED` | Reject unauthorized SSL certificates | `true` |

## Safety Note

Never commit `.env` files.
