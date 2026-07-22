# Part 19: eSSL MB160 ADMS live testing and OVH readiness

## Device configuration

Configure the MB160 ADMS/server target as `OVH_PUBLIC_IP:3021`.  Use device code
`MB160-001` (or its separately recorded serial number) and endpoint
`/iclock/cdata`.  The device must be registered and active in the Hotel API
before it is pointed at the server. Do not use a browser login or cookie.

The API process is `hotel-api` on port `3021`; the web process is `hotel-web` on
port `3020`. Set `API_PORT=3021`, the production PostgreSQL `DATABASE_URL`,
`NODE_ENV=production`, and appropriate `TRUST_PROXY`/`WEB_ORIGIN` values in the
hotel API environment. Keep credentials only in the environment, never in this
document or PM2 command arguments.

Expected device replies are plain text: valid `/iclock/cdata` punch uploads
receive `OK: 1`; valid `/iclock/getrequest` and `/iclock/devicecmd` receive
`OK`; unknown or inactive devices receive `ERROR`.

## Local test

Run `corepack pnpm db:migrate`, then `corepack pnpm dev:api` and confirm its
actual port from the startup log (normally 3022). The web app normally runs on
3020. With `API_PORT` substituted below:

```sh
curl -i "http://localhost:API_PORT/iclock/cdata?SN=MB160-001&options=all&pushver=2.4.1"
curl -i -X POST "http://localhost:API_PORT/iclock/cdata?SN=MB160-001&table=ATTLOG&Stamp=9999" -H "Content-Type: text/plain" --data-binary $'3\t2026-07-22 09:05:00\t0\t1\t0\t0\t0'
curl -i -X POST "http://localhost:API_PORT/iclock/cdata?SN=MB160-001&table=ATTLOG&Stamp=9999" -H "Content-Type: text/plain" --data-binary $'3\t2026-07-22 18:00:00\t1\t1\t0\t0\t0'
```

Repeat the first punch request: it must still return `OK: 1` but create no
second raw row. Test `SN=UNKNOWN-DEVICE`, malformed `invalid-line`, and an
unmatched biometric ID on isolated test dates. Remove only explicitly marked
test rows through the ADMIN device UI.

## OVH checklist and rollback

- Validate the local migration, database check, tests, typecheck, lint, and build first.
- Back up the Hotel PostgreSQL database and verify restore access.
- Create only the `hotel-api` PM2 process on 3021 and `hotel-web` on 3020; do not modify Hostel or Mansion processes.
- Allow only required inbound device traffic to TCP 3021; arrange Nginx browser/API routing separately.
- Confirm `/ready`, MB160 heartbeat, online status, one upload, duplicate retry, and dashboard raw-punch visibility.
- Monitor redacted API logs and PostgreSQL capacity after restart; the status monitor restarts safely with the process.

To roll back, point the device back to its previous reachable target, stop only
the Hotel PM2 processes, restore the backed-up Hotel database if required, and
remove the new firewall rule. Do not reverse a migration after production data
has been written without a database backup and maintenance plan.

Troubleshooting: check that the device code/serial matches case-insensitively,
the device is active, port 3021 is reachable, and device time is Asia/Kolkata.
`ERROR` means identity/input was rejected; malformed rows are skipped without
crashing valid rows in the same request. An OFFLINE state after five minutes
means no valid device contact was received.
