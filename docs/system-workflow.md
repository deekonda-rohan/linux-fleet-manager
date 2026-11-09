# System workflow and operator guide

## Start the backend

1. Copy `.env.example` to `.env` and set the local PostgreSQL values.
2. Run `npm ci`, `npm test`, and `npm start` from the repository root.
3. Confirm `GET http://localhost:5000/api/health` returns `200` when `PORT=5000` is configured.

Startup checks PostgreSQL and applies the additive migrations. Do not commit `.env`.

## Enroll a node and start heartbeats

1. Register with `POST /api/nodes`, sending `name`, `hostname`, and `ip_address`.
2. Save the returned credential securely. It is shown only once; PostgreSQL stores only its hash.
3. On the Linux node, set `NODE_ID`, `NODE_TOKEN`, `API_BASE_URL`, and optionally `HEARTBEAT_INTERVAL_SECONDS`; run `bash scripts/heartbeat.sh`.
4. Send `Authorization: Bearer <node-credential>` to `POST /api/nodes/:id/heartbeat` when testing manually.

The default heartbeat script interval is 10 seconds. The backend default offline timeout is 30 seconds and its polling interval is 10 seconds.

## Configure Prometheus endpoints

Use `GET /api/nodes` to find the IDs. From a trusted machine with the backend's database settings available, run `scripts/provision-exporter-endpoint.js <node-id> <host-or-ip> <port>`. Then generate a separate JSON file with `scripts/generate-prometheus-discovery.js <output-path.json>`. The first run refuses to replace an existing file; use `--overwrite` only for the dedicated file you intend to refresh.

Prometheus must separately be configured to read that file. No WSL Prometheus configuration, active `nodes.json`, or Grafana dashboard is modified by these commands.

## Run an approved remote diagnostic

1. Install/configure OpenSSH on the backend host. Use a non-root account and ensure its key is available to the backend process.
2. Pin each managed host key in that account's `known_hosts`; host-key checking is strict.
3. Set `FLEET_SSH_USER` and a generated `FLEET_ADMIN_TOKEN` of at least 32 characters in the backend environment. Keep both out of source control.
4. Send `POST /api/nodes/:id/commands` with the fleet admin bearer token and one operation body, for example `{"operation":"uptime"}`.

The only operations currently accepted are `uptime`, `disk_usage`, `memory_usage`, and `kernel_info`. There is no arbitrary-command or argument interface. Inspect `remote_command_audit` for status and exit code; command output is returned to the authorized caller and is not persisted.

## Failure and recovery checks

- Stop a node's heartbeat process and observe `status` after the 30-second timeout plus up to one polling interval.
- Restart heartbeats with the matching node credential; a valid heartbeat should set the node online and refresh `last_seen_at`.
- A missing, invalid, revoked, or other node's credential must not update heartbeat state.
- A remote-command SSH/network failure is recorded as a failed operation; a timeout returns `504` and is recorded as `timed_out`.
