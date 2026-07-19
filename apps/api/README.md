# Hotel API Foundation

This package contains the production-oriented Express API foundation for the Ranjirams Hotel Management System.

## Purpose

- Provide a separate backend foundation for `hotel-api`
- Keep the API isolated from the Next.js frontend
- Establish health checks, request IDs, structured logging, and central error handling

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

## Local URLs

- Internal API URL: http://127.0.0.1:3022
- Health URL: http://127.0.0.1:3022/health

## Not Implemented Yet

Database, authentication, ADMS, attendance, payroll, salary, advance payments, and reports are not implemented yet.

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `development` |
| `API_HOST` | Bind host | `127.0.0.1` |
| `API_PORT` | Internal API port | `3022` |
| `WEB_ORIGIN` | Allowed frontend origin | `http://localhost:3020` |
| `LOG_LEVEL` | Pino log level | `info` |
| `TRUST_PROXY` | Express trust proxy setting | `false` |

## Safety Note

Never commit `.env` files.
