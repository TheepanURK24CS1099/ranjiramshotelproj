# Biometric devices and ADMS raw punches

Part 12 registers biometric machines and receives their raw events. It deliberately does not interpret punches as attendance; Punch In/Out, working time, and attendance calculation belong to Part 13.

## Identity boundary

`devices.device_code` and `devices.serial_number` identify an eSSL MB160 machine. `employees.biometric_id` identifies the employee PIN/User ID enrolled on that machine. A punch from device `MB160-01` for PIN `3` is stored with that device's UUID and `biometric_id = 3`. Employee IDs are never compared with device codes or serial numbers. Unknown employee PINs remain in the raw table for investigation.

## Request flow

The isolated `/iclock` router accepts heartbeat polling at `GET /iclock/getrequest`, uploads at `/iclock/cdata`, and `POST /iclock/devicecmd` polling. The `SN` query parameter may match a configured device code or serial number, case-insensitively. Unknown and inactive devices receive a small plain-text error and are not created. The router accepts raw text and URL-encoded `ATTLOG`/`data` payloads with a configurable 64 KB default limit. The vendor parser supports the common tab-delimited record: `PIN`, local machine timestamp, punch state, verify mode, followed by optional vendor fields.

Every accepted request updates `last_seen`, `last_ip`, and stored status to `ONLINE`. The machine's timezone-less timestamps use `ADMS_TIMEZONE_OFFSET` (default India `+05:30`) and are stored as UTC `timestamptz` values. Each original record is retained in `raw_payload.payload`.

## Status and deduplication

An active device is calculated as online only while `last_seen` is within `DEVICE_OFFLINE_THRESHOLD_MS` (five minutes by default). A one-minute background monitor marks stale rows offline; API responses calculate status again to protect against stale persisted values. Inactive devices always appear offline. The monitor timer is unreferenced and is explicitly stopped during graceful shutdown.

`source_event_key` is a SHA-256 digest of device UUID, biometric PIN, UTC punch time, punch state, and verify mode. Its database unique constraint plus `ON CONFLICT DO NOTHING` makes device retries idempotent.

## Manual simulation

After creating a device through the authenticated API, replace `MB160-01` with its configured code:

```sh
curl -i 'http://127.0.0.1:3022/iclock/getrequest?SN=MB160-01'
curl -i -X POST 'http://127.0.0.1:3022/iclock/cdata?SN=MB160-01' \
  -H 'Content-Type: text/plain' \
  --data-binary $'3\t2026-07-20 09:15:00\t0\t1\t0'
```

Physical MB160 confirmation is required for the exact firmware field ordering, heartbeat method/query spelling, response acknowledgement text, device timezone, and whether the configured ADMS server path includes `/iclock`.
