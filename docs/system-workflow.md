# System workflow and operator guide

## Start the backend

1. Copy `.env.example` to `.env` and set the local PostgreSQL values.
2. Run `npm ci`, `npm test`, and `npm start` from the repository root.
3. Confirm `GET http://localhost:5000/api/health` returns `200` when `PORT=5000` is configured.

Startup checks PostgreSQL and applies the additive migrations. Do not commit `.env`.

## Enroll a node and start heartbeats

1. Register with `POST /api/nodes`, sending `name`, `hostname`, and `ip_address`, with the fleet operator bearer token.
2. Save the returned credential securely. It is shown only once; PostgreSQL stores only its hash.
3. On the Linux node, set `NODE_ID`, `NODE_TOKEN`, `API_BASE_URL`, and optionally `HEARTBEAT_INTERVAL_SECONDS`; run `bash scripts/heartbeat.sh`.
4. Send `Authorization: Bearer <node-credential>` to `POST /api/nodes/:id/heartbeat` when testing manually.

The default heartbeat script interval is 10 seconds. The backend default offline timeout is 30 seconds and its polling interval is 10 seconds.

## Configure Prometheus endpoints

Use `GET /api/nodes` with the fleet operator bearer token to find the IDs. `GET /api/nodes/:id` returns a node's full inventory and availability fields. From a trusted machine with the backend's database settings available, run `scripts/provision-exporter-endpoint.js <node-id> <host-or-ip> <port>`. Then generate a separate JSON file with `scripts/generate-prometheus-discovery.js <output-path.json>`. The first run refuses to replace an existing file; use `--overwrite` only for the dedicated file you intend to refresh.

Prometheus must be configured to read that file. For automatic updates, set `PROMETHEUS_DISCOVERY_FILE` in the backend environment to a dedicated JSON file visible to both Windows and WSL, and optionally set `PROMETHEUS_DISCOVERY_REFRESH_SECONDS` (default `15`). The backend publishes once at startup and polls PostgreSQL periodically; the refresher stops during graceful shutdown. Configure Prometheus `file_sd_configs` to read the matching WSL mount path. Its file-SD refresh interval picks up each atomic file replacement without restarting Prometheus. Offline nodes remain in discovery; Prometheus `up` reflects scrape health independently of heartbeat status. Nodes without an endpoint are omitted until a trusted operator provisions one. Existing WSL `nodes.json` and Grafana dashboards remain untouched.

## Run an approved remote diagnostic

1. Install/configure OpenSSH on the backend host. Set `FLEET_SSH_NODES` to a JSON object keyed by registered node ID. Each entry sets that node's `sshUser` and absolute `sshKeyPath`; missing or invalid mappings fail closed with HTTP 503, with no global-key fallback. Keep private keys on the backend host, outside the repository, and grant access only to the backend process account and SYSTEM.
2. Independently verify each Linux SSH host-key fingerprint, then add the matching host key to the Windows backend account's `known_hosts`; host-key checking is strict.
3. Set a generated `FLEET_ADMIN_TOKEN` of at least 32 characters in the backend environment. Keep it out of source control.
4. Send `POST /api/nodes/:id/commands` with the fleet admin bearer token and one operation body, for example `{"operation":"uptime"}`. The same operator token is required for registration, listing, node details, and `GET /api/nodes/commands/history`.

The accepted operations are `uptime`, `disk_usage`, `memory_usage`, `kernel_info`, `disk_usage_all`, `memory_usage_mb`, and `node_exporter_status`. The last operation checks the Ubuntu unit `node_exporter.service`. There is no arbitrary-command or argument interface. The host wrapper performs exact command matching and executes fixed absolute executable paths. Inspect `remote_command_audit` for status and exit code; command output is returned to the authorized caller and is not persisted.

Command history can be read through `GET /api/nodes/commands/history?node_id=<id>&limit=25&offset=0`. The response excludes target addresses, credentials, and command output.

Create or provision a dedicated key for each node, restrict each key ACL to the backend process account and SYSTEM, and map each node ID to its key path and SSH user in `FLEET_SSH_NODES`. Copy only each matching public key to its node. On Ubuntu, use a locked unprivileged `fleetdiag` account with no sudo access, install `scripts/fleet-command-wrapper.sh` as root-owned `/usr/local/sbin/fleet-command-wrapper`, and place the public key in `~fleetdiag/.ssh/authorized_keys` with the options `restrict,command="/usr/local/sbin/fleet-command-wrapper"`. Keep the `.ssh` directory mode `0700` and `authorized_keys` mode `0600`.

Read the node's Ed25519 host fingerprint independently at its console, compare it with the fingerprint of the key obtained from the backend with `ssh-keyscan`, then add that key to the backend account's `known_hosts`. The backend uses strict host-key checking and will fail closed for an untrusted or changed key. Ensure the registered node IP is reachable from Windows; WSL localhost forwarding is only suitable when the registered target is `127.0.0.1`.

## Failure and recovery checks

- Stop a node's heartbeat process and observe `status` after the 30-second timeout plus up to one polling interval.
- Restart heartbeats with the matching node credential; a valid heartbeat should set the node online and refresh `last_seen_at`.
- A missing, invalid, revoked, or other node's credential must not update heartbeat state.
- A remote-command SSH/network failure is recorded as a failed operation; a timeout returns `504` and is recorded as `timed_out`.
