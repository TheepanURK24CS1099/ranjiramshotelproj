# Part 20: Hotel production deployment

This guide prepares only the Ranjirams Hotel project for a manual deployment. It does not deploy anything.

## Target layout

- Server project directory: `/home/ubuntu/HOTEL_PROJECT`
- Repository path: `/home/ubuntu/HOTEL_PROJECT` (the cloned Ranjirams Hotel repository)
- Web port: `3020` (`hotel-web`)
- API port: `3021` (`hotel-api`)
- Database: `hotel_management`
- Recommended database role: `hotel_app`

Keep the production API environment file at `apps/api/.env.production` and the web environment file at `apps/web/.env.production`, copied from their corresponding `.example` files. Put real values only in those ignored local files, never in source control. The API accepts the deployment names `PORT` and `CORS_ORIGIN`.

## Deployment commands

Run the following from `/home/ubuntu/HOTEL_PROJECT` after updating the intended revision manually:

```bash
corepack pnpm install --frozen-lockfile
cp apps/api/.env.production.example apps/api/.env.production
cp apps/web/.env.production.example apps/web/.env.production
# Edit both production files with the real deployment values.
corepack pnpm build
corepack pnpm db:migrate:status
corepack pnpm db:migrate
mkdir -p logs/pm2
pm2 start infrastructure/pm2/hotel-ecosystem.config.cjs --env production
pm2 save
```

Use `corepack pnpm db:migrate:status` before migrations and `corepack pnpm db:migrate` to apply pending migrations. Back up the database immediately before applying a migration.

Useful PM2 commands:

```bash
pm2 status
pm2 logs hotel-web
pm2 logs hotel-api
pm2 reload hotel-web
pm2 reload hotel-api
pm2 describe hotel-api
```

## Nginx

Install the example as the Hotel-only site configuration, then verify it before reloading:

```bash
sudo cp infrastructure/nginx/hotel.srcheckin.com.conf.example /etc/nginx/sites-available/hotel.srcheckin.com
sudo ln -s /etc/nginx/sites-available/hotel.srcheckin.com /etc/nginx/sites-enabled/hotel.srcheckin.com
sudo nginx -t
sudo systemctl reload nginx
```

The template is HTTP-only and intentionally contains no certificate paths. DNS must point `hotel.srcheckin.com` to the intended server before obtaining a certificate. Then obtain and install SSL using the approved certificate process, verify renewal, and redirect HTTP to HTTPS only after the HTTPS virtual host has been verified.

## Network and health checklist

- Create an A/AAAA record for `hotel.srcheckin.com`; verify DNS propagation.
- Permit TCP 80 and 443 through the host and provider firewalls. Do not expose 3020, 3021, or PostgreSQL publicly.
- Confirm PostgreSQL accepts the `hotel_app` role only as required and that `DATABASE_URL` selects `hotel_management`.
- Confirm PM2 shows `hotel-web` and `hotel-api` online.
- Check `curl -fsS http://127.0.0.1:3021/health` (running API only).
- Check `curl -fsS http://127.0.0.1:3021/readiness` (running API plus PostgreSQL access).
- Check `curl -fsS https://hotel.srcheckin.com/api/health` after proxy and SSL setup.
- ADMS heartbeat check: `curl -i "https://hotel.srcheckin.com/iclock/getrequest?SN=DEVICE_SERIAL"`. Replace `DEVICE_SERIAL` with a configured device serial; do not use a real production serial in tickets or documentation.

`/health` confirms the API process is running. `/readiness` performs a read-only `SELECT 1` against PostgreSQL; it returns 503 without database details when PostgreSQL is unavailable.

## Backup and restore

Back up before releases or migrations. The backup script only permits a `DATABASE_URL` that selects `hotel_management`; it uses PostgreSQL authentication supplied by the environment or normal libpq mechanisms and never stores a password.

```bash
export DATABASE_URL='postgresql://hotel_app@127.0.0.1:5432/hotel_management'
infrastructure/backup/backup-hotel-db.sh /home/ubuntu/hotel-backups
```

To restore, first stop the API and web processes, select and verify the intended dump, and supply the target database explicitly. The restore script refuses every database other than `hotel_management` and uses `--clean`, so it replaces existing schema objects.

```bash
pm2 stop hotel-api hotel-web
infrastructure/backup/restore-hotel-db.sh /home/ubuntu/hotel-backups/hotel_management_YYYYMMDDTHHMMSSZ.dump hotel_management
pm2 start hotel-api hotel-web
```

## Rollback

1. Stop or reload the affected PM2 process only after identifying the last known-good project revision and matching database backup.
2. Restore the prior application revision, reinstall with the lockfile, rebuild, and run `pm2 reload hotel-web hotel-api`.
3. If the release included a migration, restore the verified `hotel_management` backup only after accepting the data-loss window; otherwise use a tested down migration where available.
4. Re-run `/health`, `/readiness`, and the public `/api/health` check. Review `pm2 logs hotel-api` and Nginx errors.

## Hostel and Mansion safety checks

- Confirm the working directory and repository are exactly `/home/ubuntu/HOTEL_PROJECT`.
- Confirm the PM2 process names are exactly `hotel-web` and `hotel-api` before start, reload, stop, or delete actions.
- Confirm the Nginx site is `hotel.srcheckin.com` and upstream ports are 3020 and 3021.
- Run `rg -n -i '(hostel|mansion)' infrastructure` before installing the infrastructure files; it must return no project-reference matches.
- Do not copy, link, restart, reload, or alter any Hostel or Mansion configuration, processes, databases, or directories.
