# Device management API

All `/devices` endpoints require a valid session. `ADMIN` and `MANAGER` may call `GET /devices`, `GET /devices/:id`, and `GET /devices/:id/recent-punches?limit=25`. Only `ADMIN` may call `POST /devices`, `PATCH /devices/:id`, `PATCH /devices/:id/activate`, and `PATCH /devices/:id/deactivate`.

Creation and editing accept `device_code`, `name`, `model`, `serial_number`, `firmware_version`, and `active` (creation only). Device code and non-null serial number are unique case-insensitively. Devices are deactivated rather than deleted, preserving their raw attendance records.

Device-facing routes are unauthenticated by browser session because the machine identifies itself by configured code or serial through `SN`, `sn`, `device_code`, or `X-Device-Code`. They return only plain text:

- `GET|POST /iclock/getrequest` and `/iclock/getrequest.aspx` record a heartbeat and return `OK`.
- `GET|POST /iclock/cdata` and `/iclock/cdata.aspx` record a heartbeat, ingest valid `ATTLOG` rows, and return `OK: n`.
- `POST /iclock/devicecmd` and `/iclock/devicecmd.aspx` record a heartbeat and return `OK`.

See [the architecture note](../architecture/biometric-devices-adms.md) for parsing, identity, status, deduplication, and device simulation details.
