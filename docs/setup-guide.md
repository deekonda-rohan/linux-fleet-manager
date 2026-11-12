# Setup Guide

This guide prepares a company demonstration with a Windows-hosted Fleet Manager, PostgreSQL, two Ubuntu nodes on a private ZeroTier network, Prometheus in WSL, and Grafana. The repository supplies the backend, heartbeat script, exporter-discovery tools, and restricted SSH wrapper. You must install and configure the infrastructure services separately. This project does not create AWS instances or configure ZeroTier.

## 1. Prerequisites

- A Windows backend machine with Node.js 20 or newer, npm, Git, and OpenSSH client (`ssh`). The backend's `dev` script also uses the included `nodemon` dependency.
- PostgreSQL reachable by the Windows backend. The environment template uses port `5432` by default.
- Two Ubuntu AWS EC2 instances that you are authorized to administer. Prepare instance access and network security in AWS before running these project scripts.
- ZeroTier installed on the Windows backend machine and on both Ubuntu nodes. You need administrative access to the ZeroTier network so you can approve members.
- WSL with a Linux distribution for Prometheus. The WSL environment must be able to reach each node's Node Exporter endpoint and read the discovery JSON file written by Windows.
- Grafana installed in WSL (or another machine that can reach Prometheus). A compatible dashboard must be created or imported separately; this repository does not include Grafana provisioning or dashboards.
- `curl` on the Ubuntu nodes for `scripts/heartbeat.sh`, and Node Exporter on each node for metrics collection.

Node.js 20 is the version used in `.github/workflows/test.yml`; the README specifies Node.js 20 or newer. The backend's HTTP port defaults to `3000` in `src/server.js`, while the repository's `.env.example` sets `PORT=5000`.

## 2. Project folders

- `src/` contains the Express app, API routes, controllers, middleware, PostgreSQL repositories, configuration, and services.
- `database/schema.sql` and `database/migrations/` define the database schema installed by backend startup.
- `scripts/` contains the Linux heartbeat sender, local node credential and exporter provisioning utilities, discovery generator, and SSH forced-command wrapper.
- `test/` contains automated tests run with Node's built-in test runner.
- `docs/` contains architecture and workflow notes, the codebase guide, and this setup guide.
- `.github/workflows/test.yml` runs `npm ci` and `npm test` in CI.

The backend starts at `src/server.js`; `package.json` defines `npm start`, `npm run dev`, and `npm test`.

## 3. PostgreSQL setup and migrations

Install and start PostgreSQL on the Windows backend host or on a database host reachable from it. Create a database and a login role for this application using your organization's PostgreSQL administration process (for example, pgAdmin or `psql`). Grant that role the privileges needed to create and update the application's tables. Do not put database passwords in source files or this guide.

Set the database connection values in the backend's local `.env` file as described in the next section. On startup, `src/config/db.js` creates a `pg.Pool`, checks the connection, and runs `database/schema.sql` followed by the SQL files in `database/migrations/` in numeric order. No separate migration command is needed for the normal startup path. `npm start` exits unsuccessfully if the database connection or initialization fails.

The startup order is:

1. `database/schema.sql`
2. `database/migrations/001_node_credentials.sql`
3. `database/migrations/002_node_exporter_endpoints.sql`
4. `database/migrations/003_remote_command_audit.sql`
5. `database/migrations/004_remote_diagnostic_operations.sql`

Keep these migration files in place when deploying; existing nodes are retained by the additive migrations.

## 4. Environment configuration

In Windows PowerShell, from the repository root, create the local environment file:

```powershell
Copy-Item .env.example .env
notepad .env
```

Edit `.env` locally. Do not paste its contents into tickets, documentation, chat, or source control. `.gitignore` excludes `.env` and key files. `.env.example` contains placeholders and example structure; it is not a deployable credential set.

| Variable | Purpose and behavior |
|---|---|
| `PORT` | Backend HTTP port. `src/server.js` defaults to `3000`; `.env.example` selects `5000`. Use one chosen port consistently in firewall rules and URLs. |
| `DB_USER` | PostgreSQL login role used by the backend. |
| `DB_HOST` | PostgreSQL server host name or address. The template uses loopback. |
| `DB_NAME` | Application database name. |
| `DB_PASSWORD` | Password for the PostgreSQL role. Keep the real value only in the protected local environment. |
| `DB_PORT` | PostgreSQL TCP port; the template uses `5432`. |
| `HEARTBEAT_TIMEOUT_SECONDS` | Age after which a node heartbeat is considered expired; default `30`. Must be a positive integer. |
| `OFFLINE_CHECK_INTERVAL_SECONDS` | Frequency of offline checks; default `10`. Must be a positive integer. |
| `FLEET_ADMIN_TOKEN` | Optional operator bearer token. Set a high-entropy value at least 32 characters long to enable operator-protected routes. When unset, those routes are unavailable. |
| `FLEET_SSH_NODES` | Optional JSON map from registered node IDs to each node's SSH username and absolute private-key path on the backend. Missing mappings fail closed. Keep private keys outside the repository and restrict file access. |
| `FLEET_SSH_TIMEOUT_MS` | Maximum SSH operation duration; default `10000` ms, with accepted values from `1` to `120000`. |
| `PROMETHEUS_DISCOVERY_FILE` | Optional absolute path for the backend-generated file-SD JSON. Blank disables automatic publishing. Use a dedicated `.json` file; the application protects the `nodes.json` basename. |
| `PROMETHEUS_DISCOVERY_REFRESH_SECONDS` | Automatic discovery refresh interval; default `15`, allowed range `1` to `3600`. |

The heartbeat script has separate Linux process environment values: `NODE_ID`, `NODE_TOKEN`, and `API_BASE_URL` are required; `HEARTBEAT_INTERVAL_SECONDS` defaults to `10`. Do not add the node token to a command-line argument or commit it.

For a demonstration without SSH diagnostics, `FLEET_SSH_NODES` can remain unset. Heartbeats and exporter scraping do not depend on SSH configuration. Operator routes, including registration and listing, require `FLEET_ADMIN_TOKEN`.

## 5. Install and start the Windows backend

Open Windows PowerShell in the repository root:

```powershell
npm ci
npm test
npm start
```

`npm start` starts `src/server.js`: it loads `.env`, checks PostgreSQL, applies the schema and migrations, starts the HTTP listener, and then starts the availability checker and (if configured) discovery refresher. For development with automatic restarts, use `npm run dev` instead of `npm start`.

Check the health endpoint from PowerShell. Substitute the port selected in `.env`:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:<BACKEND_PORT>/api/health"
```

The server binds to `0.0.0.0`, but Windows Firewall and network policy still control who can connect. Permit the backend port only from the trusted demonstration network and node addresses that need it. A listening address does not configure ZeroTier or open a firewall rule.

## 6. Private connectivity with ZeroTier

ZeroTier membership is managed separately from this application. An administrator must create or select an authorized private network, install the ZeroTier client on the Windows backend host and both Ubuntu nodes, join each device to that network, and authorize each member in the ZeroTier Central network console. Use only your organization's assigned network ID and managed addresses. The official [ZeroTier network setup guide](https://docs.zerotier.com/start/) describes joining and authorizing devices.

After authorization, record the managed IP address of each node and confirm the required paths in both directions:

- Each Ubuntu node must reach `http://<BACKEND_ZEROTIER_IP>:<BACKEND_PORT>` for heartbeats. The address must be reachable from the Linux host running the heartbeat script.
- The Windows backend must reach each registered node address over TCP port `22` if you enable remote diagnostics.
- The Prometheus process in WSL must be able to reach each exporter address and port (normally TCP `9100`). Test from WSL itself; do not assume that a Windows ZeroTier route is automatically available to the WSL network namespace.
- Grafana must be able to reach the Prometheus HTTP endpoint.

Configure the AWS security group, Ubuntu and Windows firewalls, and ZeroTier flow rules for the network path you actually use. ZeroTier carries an overlay network, so do not assume AWS security-group rules for direct public TCP connections describe or control every overlay flow; test the path from each participating process and apply restrictions at the layer that sees that traffic. Keep the API and exporters private; do not expose them publicly. If using ordinary HTTP for heartbeats, it must remain on a trusted private network because the bearer credential is not encrypted by HTTP.

Useful connectivity checks:

**Windows PowerShell** (ZeroTier CLI commands may require an elevated shell):

```powershell
zerotier-cli status
zerotier-cli listnetworks
Test-NetConnection -ComputerName <NODE_ZEROTIER_IP> -Port 22
Test-NetConnection -ComputerName <NODE_ZEROTIER_IP> -Port 9100
```

**Ubuntu shell:**

```sh
sudo zerotier-cli status
sudo zerotier-cli listnetworks
curl --max-time 5 http://<BACKEND_ZEROTIER_IP>:<BACKEND_PORT>/api/health
```

If ZeroTier reports the device as unauthorized or `ACCESS_DENIED`, authorize it in the network console before troubleshooting the application. AWS security groups must also permit the traffic appropriate to your network design; AWS documents the required SSH rule for direct EC2 SSH access [here](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html). Avoid unrestricted inbound rules.

## 7. Prometheus in WSL

Prometheus is not installed or configured by this repository. Install a Prometheus release in WSL using the official [Prometheus installation instructions](https://prometheus.io/docs/prometheus/latest/installation/). Keep its configuration and data in a WSL-owned directory. The Prometheus web interface normally uses port `9090`.

Choose a dedicated discovery output file in a directory visible to both Windows and WSL. Configure `PROMETHEUS_DISCOVERY_FILE` in the backend `.env` with its Windows path. In WSL, use the corresponding mounted path (for example, a drive mount under `/mnt/<drive>/...`). These are two views of the same file; substitute your actual drive and folder. Do not point this feature at another Prometheus job's `nodes.json`.

Configure Prometheus `prometheus.yml` to read the generated file. In the `scrape_configs` section, the relevant job shape is:

```yaml
scrape_configs:
  - job_name: linux-nodes
    file_sd_configs:
      - files:
          - /mnt/<drive>/<shared-directory>/fleet-manager-targets.json
```

Use the actual WSL path to the file. Prometheus periodically notices file-SD changes; this repository publishes the file atomically but does not edit `prometheus.yml` or reload Prometheus. Validate the configuration before starting or reloading it.

Start Prometheus from its extracted directory in **WSL/Linux**:

```sh
cd <PROMETHEUS_INSTALL_DIRECTORY>
./prometheus --config.file=<PROMETHEUS_CONFIG_PATH>/prometheus.yml
```

Keep this process running in its terminal for a demonstration, or configure a service using your organization's WSL practices. Browse to `http://localhost:9090/targets` from a browser that can reach WSL. The WSL Prometheus process must have a working network route to the Node Exporter addresses in the file.

## 8. Grafana setup and dashboard access

Grafana is also external to this repository. Install it in WSL using the official [Grafana Linux installation guide](https://grafana.com/docs/grafana/latest/setup-grafana/installation/), then start it according to the official [Grafana service instructions](https://grafana.com/docs/grafana/latest/setup-grafana/start-restart-grafana/). The default Grafana web port is `3000`; verify the actual configured port if you changed it.

In Grafana:

1. Open the Grafana URL from a browser that can reach the WSL service, commonly `http://localhost:3000` when local forwarding is available.
2. Complete the initial administrator setup and sign in. Do not reuse demonstration credentials outside a disposable demo.
3. Add a **Prometheus** data source. If Grafana and Prometheus run in the same WSL environment, the Prometheus server URL is commonly `http://localhost:9090`. If they run in different network environments, enter an address reachable from the Grafana process. Save and test the data source.
4. Create or import a Node Exporter dashboard compatible with the metrics available in your Prometheus instance. No dashboard JSON or Grafana provisioning is included in this repository, so dashboard panels and names depend on what you import or build.

The Prometheus data source is built into Grafana; see the official [Prometheus data-source configuration guide](https://grafana.com/docs/grafana/latest/datasources/prometheus/configure/).

## 9. Prepare the AWS Ubuntu nodes

This application does not launch or configure AWS instances. Provision two Ubuntu EC2 instances using your company's approved process. For each node:

- Confirm Ubuntu is supported by your chosen AMI, the instance is running, and you can administer it.
- Install and start the ZeroTier client, join the approved private network, and authorize the member.
- Install `curl` for the heartbeat script.
- Install and run Prometheus Node Exporter. The project expects exporter endpoints configured by an operator; `9100` is the conventional Node Exporter port and is used in the repository's examples. Follow the official [Node Exporter guide](https://prometheus.io/docs/guides/node-exporter/) for installation. If enabling the `node_exporter_status` SSH diagnostic, the node must expose a systemd unit named `node_exporter.service`.
- If using SSH diagnostics, install/enable the OpenSSH server and use a dedicated unprivileged diagnostic account with the forced command described in `docs/system-workflow.md`. Install `scripts/fleet-command-wrapper.sh` on each node as root-owned `/usr/local/sbin/fleet-command-wrapper`; configure a dedicated authorized key with the forced-command restriction. Do not grant this account sudo access.
- Restrict inbound traffic in the AWS security group, Ubuntu firewall, and ZeroTier rules to the backend and Prometheus paths required. Port `22` is only needed for SSH administration/diagnostics; exporter traffic normally uses `9100` and should be limited to the monitoring source.

### Start a heartbeat on each node

Copy the repository's `scripts/heartbeat.sh` to each Ubuntu node through your approved deployment method. Set process environment variables on that node, then run it from **Ubuntu shell**:

```sh
export NODE_ID='<REGISTERED_NODE_ID>'
export NODE_TOKEN='<CREDENTIAL_FOR_THIS_NODE>'
export API_BASE_URL='http://<BACKEND_ZEROTIER_IP>:<BACKEND_PORT>'
export HEARTBEAT_INTERVAL_SECONDS='10'
bash ./heartbeat.sh
```

Use the credential returned when registering that node; never reuse one node's credential for the other. The process logs HTTP success or failure and repeats every 10 seconds by default. Keep it running during the demo. For a durable service, create and review a systemd unit through your normal Linux operations process; the repository supplies a script, not a heartbeat service unit.

## 10. Register nodes and configure exporter discovery

Once both nodes can reach the backend, register each using the operator-protected `POST /api/nodes` endpoint. Supply the node's name, hostname, and address that the backend should use. When Prometheus is remote from the nodes, configure the exporter address to one that WSL can reach (often each node's authorized ZeroTier managed IP). The endpoint returns a node ID and a one-time credential. Store that credential securely on the matching node; do not include it in screenshots, logs, or source control.

For example, from **Windows PowerShell**, using placeholders for local variables:

```powershell
$Headers = @{ Authorization = "Bearer $env:FLEET_ADMIN_TOKEN" }
$Body = @{ name = '<NODE_NAME>'; hostname = '<NODE_HOSTNAME>'; ip_address = '<NODE_ADDRESS>' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:<BACKEND_PORT>/api/nodes" -Headers $Headers -ContentType 'application/json' -Body $Body
```

Use the same authorized operator token stored in the backend environment. Do not paste a real token into a shared shell transcript. Record each returned node ID and deliver its credential only to that node using an approved secret-handling method.

From the Windows repository root, configure an exporter endpoint for each registered ID using the project's trusted local provisioning script:

```powershell
node scripts/provision-exporter-endpoint.js <NODE_ID> <NODE_EXPORTER_REACHABLE_ADDRESS> 9100
```

The script reads the backend database configuration and updates an existing node. Public registration cannot set exporter fields. Set `PROMETHEUS_DISCOVERY_FILE` to the dedicated shared output path in `.env`, start/restart the backend, and watch its log for the discovery refresh message. The refresher writes immediately at startup and then at the configured interval. For a one-time publication, use `node scripts/generate-prometheus-discovery.js <OUTPUT_FILE.json>`; it refuses to overwrite an existing file unless passed `--overwrite`.

## 11. Verification checklist for both nodes

Verify each layer separately:

1. **ZeroTier membership:** confirm the Windows host and both nodes are authorized and show the expected network addresses.
2. **Backend health:** from PowerShell, request `http://127.0.0.1:<BACKEND_PORT>/api/health` and confirm a successful response.
3. **Node inventory and heartbeat:** use the operator-protected node list/detail APIs. Confirm both node IDs exist and each has a recent `last_seen_at` and `status: online`. A valid heartbeat updates these fields; a missed heartbeat can take the timeout plus up to one offline-check interval to mark offline.
4. **Exporter reachability:** from WSL, request `http://<NODE_EXPORTER_REACHABLE_ADDRESS>:9100/metrics` for each node and confirm metric text is returned.
5. **Discovery file:** confirm the generated JSON includes both configured nodes and their `node_id` / `node_name` labels. Nodes without exporter endpoints are omitted; heartbeat status does not filter discovery targets.
6. **Prometheus targets:** open `http://localhost:9090/targets` and confirm the `linux-nodes` job has one target per node and each is `UP`. If not, inspect the target address, WSL route, security-group/firewall rules, and Node Exporter service.
7. **Prometheus queries:** in the Prometheus expression browser, check `up` and a Node Exporter metric such as `node_exporter_build_info`. `up` reports whether Prometheus successfully scraped an endpoint; it does **not** represent the Fleet Manager heartbeat status.
8. **Grafana:** confirm the Prometheus data source test succeeds, then open the dashboard you created/imported. In Explore, try standard Node Exporter metrics such as `node_exporter_build_info`, `node_cpu_seconds_total`, or `node_memory_MemAvailable_bytes`; panels should return series for both expected node labels/instances. Empty panels may mean the dashboard expects different labels or metric names.

The heartbeat status is held by the Fleet Manager database and exposed in the node detail API. It is separate from Prometheus scrape health.

## 12. Common setup errors

| Symptom | Checks |
|---|---|
| Backend exits during startup | Confirm PostgreSQL is running, `DB_*` values are correct, the database is reachable from Windows, and the configured database role can apply schema changes. Read the backend startup error. |
| Health URL refuses connection | Check the backend process is still running and that you used the configured `PORT` (template default `5000`, code default `3000`). |
| Operator API returns `503` | `FLEET_ADMIN_TOKEN` is missing, too short, or was not loaded by the process. Configure a high-entropy value at least 32 characters long and restart the backend. |
| Operator API returns `401` | Check the bearer header and ensure the client uses the same operator token as the backend. |
| Heartbeat script rejects input | `NODE_ID` must be a positive integer, `NODE_TOKEN` must be the credential issued for that same node, and the API URL must include the reachable backend address and correct port. |
| Heartbeat reports HTTP `401` | Confirm the node credential has not been rotated/revoked and that it belongs to the node ID in the request. |
| Heartbeat cannot connect | Verify ZeroTier membership/authorization, the route from Ubuntu to the Windows managed address, backend port, Windows Firewall, and any network flow rules. |
| Node stays offline | Confirm the heartbeat process is still running, inspect its HTTP status, and wait for a successful heartbeat. Offline detection is periodic, not instantaneous. |
| Discovery file is not created | Check `PROMETHEUS_DISCOVERY_FILE` is an absolute `.json` path in a writable location, not `nodes.json`; inspect backend logs and make sure the database has configured exporter endpoints. |
| Prometheus target is missing | Check shared file path, valid JSON, `file_sd_configs`, that exporter endpoint is set, and that Prometheus can read the path. |
| Prometheus target is `DOWN` | From WSL, check the node address/port, ZeroTier route, AWS security group, host firewall, and that Node Exporter is running. |
| Grafana data source test fails | Confirm Prometheus is running and use a server URL reachable from the Grafana process. `localhost` means the Grafana host/network namespace. |
| SSH diagnostic returns unavailable/failed | Verify OpenSSH client on Windows, per-node `FLEET_SSH_NODES` mapping, private-key ACL, registered node address, host key in the backend account's `known_hosts`, SSH reachability, and the restricted Linux account/wrapper. Missing mappings intentionally fail closed. |

## 13. Safe shutdown

- Stop the heartbeat script on each Ubuntu node with `Ctrl+C` in its terminal. If you created a systemd service separately, stop that service using the unit name you chose.
- Stop Prometheus in its WSL terminal with `Ctrl+C`, or stop the service you configured. Prometheus data retention and storage are controlled by your Prometheus installation, not this repository.
- Stop Grafana using the service manager or process method used during its installation.
- Stop the backend with `Ctrl+C` in its terminal. `src/server.js` handles `SIGINT` and `SIGTERM`: it stops the availability checker and discovery refresher, closes HTTP, and closes the PostgreSQL pool.
- Keep PostgreSQL running if it is shared with other applications. If it is dedicated to this demonstration, stop it through Windows Services or the PostgreSQL installation's management tool after the backend has closed.
- Do not delete the discovery JSON, database, or credentials as part of ordinary shutdown. Remove demonstration resources only through the approved infrastructure and data-retention process.

## Further reading

- [Architecture](architecture.md) — components, trust boundaries, and data flows.
- [Codebase guide](codebase-guide.md) — source layout and request/background-service paths.
- [System workflow](system-workflow.md) — operator procedures for enrollment, SSH setup, and Prometheus discovery.
- [Prometheus Node Exporter guide](https://prometheus.io/docs/guides/node-exporter/)
- [Grafana Prometheus data source guide](https://grafana.com/docs/grafana/latest/datasources/prometheus/configure/)
- [ZeroTier getting started](https://docs.zerotier.com/start/)
