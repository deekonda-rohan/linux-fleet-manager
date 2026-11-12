# Distributed Linux Fleet Management System

**A centralized platform for Linux node management, health monitoring, and controlled remote operations.**

[![Node.js](https://img.shields.io/badge/Node.js-Runtime-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-Backend-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Linux](https://img.shields.io/badge/Linux-System-FCC624?logo=linux&logoColor=black)](https://www.kernel.org/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Monitoring-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Visualization-F46800?logo=grafana&logoColor=white)](https://grafana.com/)

**Status:** Development prototype with node onboarding, authenticated heartbeats, availability tracking, discovery generation, and allowlisted SSH diagnostics.

## Overview

The Distributed Linux Fleet Management System is a platform designed to centralize the onboarding, monitoring, and administration of Linux machines.

The system uses a backend service to maintain node inventory, process authenticated heartbeats, detect availability failures, and run a small allowlist of read-only SSH diagnostics. Prometheus and Node Exporter collect system metrics, while Grafana visualizes them. Prometheus/Grafana runtime configuration is maintained in the WSL environment and is not provisioned by this repository.

The project emphasizes **reliability, observability, Linux systems engineering, and secure backend design**.

## Core Capabilities

- **Node Management:** Register and maintain an inventory of Linux machines.
- **Heartbeat Monitoring:** Track node liveness through periodic communication with the Fleet Manager.
- **Failure Detection:** Identify stale heartbeats and transition unavailable nodes to an offline state.
- **Infrastructure Monitoring:** Collect CPU, memory, and disk metrics using Prometheus and Node Exporter.
- **Metrics Visualization:** Analyze infrastructure health and historical trends through Grafana.
- **Controlled Remote Execution:** Run seven fixed, read-only diagnostics over SSH after separate operator-token authentication: `uptime`, `disk_usage`, `memory_usage`, `kernel_info`, `disk_usage_all`, `memory_usage_mb`, and `node_exporter_status`.
- **Auditability:** Record operation, target, timestamps, status, and exit code without storing tokens or command output.

> This is a development prototype. Live SSH and WSL monitoring integration still depend on host-specific configuration.

### Architecture Components

| Component | Responsibility |
|---|---|
| Node.js and Express | REST APIs, node lifecycle, and availability logic |
| PostgreSQL | Node inventory, heartbeat state, exporter endpoints, and remote-operation audit records |
| Bash | Lightweight heartbeat automation |
| Node Exporter | Linux system metrics endpoint |
| Prometheus | Metrics collection and time-series storage |
| Grafana | Metrics visualization |
| SSH | Restricted remote administration |

## Technology Stack

| Layer | Technologies |
|---|---|
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Automation | Bash, curl |
| Operating system | Ubuntu, Linux |
| Monitoring | Prometheus, Node Exporter |
| Visualization | Grafana |
| API testing | Postman |
| Development environment | Windows Subsystem for Linux (WSL), Git |

## Operational Workflow

### 1. Node Registration

An administrator registers a node through the Fleet Manager. The backend validates the supplied information and persists the node's inventory details in PostgreSQL.

### 2. Heartbeat Processing

A Linux-side Bash script periodically sends an HTTP request to the backend. The Fleet Manager records the latest successful heartbeat timestamp.

### 3. Availability Management

The backend evaluates heartbeat freshness against a configurable timeout. Nodes that exceed the threshold are marked offline. Subsequent valid heartbeats allow their status to recover.

### 4. Metrics Collection

Node Exporter exposes operating-system metrics, which Prometheus collects at configured intervals.

### 5. Observability

Grafana visualizes metrics stored in Prometheus, enabling inspection of resource utilization and historical trends.

### 6. Remote Administration

An operator submits one of the fixed diagnostic operation names. The API requires a separate fleet-operator bearer token, resolves the node target from PostgreSQL, and invokes OpenSSH with strict host-key checking, batch mode, a timeout, and an output limit. Arbitrary command text and arguments are rejected. Each attempt is recorded in `remote_command_audit`.


## API Reference

Implemented API routes:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/nodes` | Register a Linux node |
| `GET` | `/api/nodes` | List registered nodes |
| `GET` | `/api/nodes/:id` | Return one node's inventory and availability details |
| `POST` | `/api/nodes/:id/heartbeat` | Record an authenticated node heartbeat |
| `POST` | `/api/nodes/:id/credential/rotate` | Rotate the authenticated node credential |
| `POST` | `/api/nodes/:id/credential/revoke` | Revoke the authenticated node credential |
| `POST` | `/api/nodes/:id/commands` | Run an allowlisted diagnostic as an authenticated operator |
| `GET` | `/api/nodes/commands/history` | List audited diagnostic outcomes with optional filtering and pagination |

Node registration, listing, details, command history, and diagnostics require
`Authorization: Bearer <FLEET_ADMIN_TOKEN>`. Configure `FLEET_ADMIN_TOKEN` with
a randomly generated value of at least 32 characters. The node heartbeat and
its credential rotation/revocation routes continue to use that node's own
credential. If the operator token is not configured, operator APIs return
`503`; missing or invalid tokens return `401`.

Node details include `status` and `last_seen_at`, so a separate status endpoint
is not required. Command history supports `node_id`, `limit` (default `25`, max
`100`), and `offset` (default `0`). It returns operation, status, timestamps,
exit code, and error code; it does not return the internal target address,
credential data, or command output.

Examples:

```http
GET /api/nodes/7
Authorization: Bearer <FLEET_ADMIN_TOKEN>
```

```http
GET /api/nodes/commands/history?node_id=7&limit=25&offset=0
Authorization: Bearer <FLEET_ADMIN_TOKEN>
```

Node registration returns a one-time `credential` alongside the node details.
The database stores only its SHA-256 hash; list responses never include the
credential or its hash. Save the credential securely when enrolling the node.
For existing nodes, an administrator with local database access can provision
one once with `node scripts/issue-node-credential.js <node-id>`. Use the
`--rotate` option to replace an existing or revoked credential; the previous
credential becomes invalid immediately. The command prints the new credential
once to its local terminal.

Credential rotation and revocation endpoints require the node's current
`Authorization: Bearer <credential>` header and can only affect that same node.
Registration and administrative local provisioning are the initial credential
issuance paths. A revoked credential cannot authenticate; local provisioning
with `--rotate` can issue a replacement.

The heartbeat script requires `NODE_ID`, `NODE_TOKEN`, and `API_BASE_URL` (for
example, `API_BASE_URL=http://localhost:5000`). `HEARTBEAT_INTERVAL_SECONDS` is
optional and defaults to `10`. Pass the token in the process environment, not
as a command-line argument. Bearer credentials must be sent over HTTPS or a
trusted private network/tunnel; plain HTTP does not encrypt the Authorization
header. Node registration requires a non-empty name (up to 100 characters), a
valid DNS hostname, and a valid IPv4 or IPv6 address.

The backend reads `HEARTBEAT_TIMEOUT_SECONDS` (default `30`) and
`OFFLINE_CHECK_INTERVAL_SECONDS` (default `10`). Both must be positive integers.
The heartbeat interval should be shorter than the timeout to tolerate missed
requests. A node is considered stale only after its last heartbeat is older
than the timeout; polling means the offline transition can occur up to one poll
interval later. A heartbeat arriving before detection restores the node to
online.

Metrics are exposed by Node Exporter and queried through Prometheus/Grafana. The Fleet Manager does not yet proxy metric queries through its API.

### Backend setup

Use Node.js 20 or newer and PostgreSQL. Copy `.env.example` to `.env`, fill in the database connection values locally, then run:

```sh
npm ci
npm test
npm start
```

Startup checks the database and applies the idempotent migrations. The backend listens on `PORT` (default `3000`; this project is commonly run on `5000`). Do not commit `.env`.

### Controlled remote diagnostics

Set `FLEET_ADMIN_TOKEN` to a privately generated, high-entropy base64url token of at least 32 characters. Configure `FLEET_SSH_NODES` as a JSON object keyed by registered node ID; each entry must contain only `sshUser` and an absolute backend-local `sshKeyPath`. There is no global-key fallback: a missing or invalid mapping disables execution for that request. Keep keys outside the repository and restrict each key file ACL to the backend process account and SYSTEM. For example, for this AWS inventory:

```dotenv
FLEET_SSH_NODES={"5":{"sshUser":"fleetdiag","sshKeyPath":"C:\\path\\to\\node-5-key.pem"},"6":{"sshUser":"fleetdiag","sshKeyPath":"C:\\path\\to\\node-6-key.pem"}}
```

OpenSSH must be installed on the backend host, and each node host key must already be independently verified and trusted. The client explicitly sets `IdentityFile`, `IdentitiesOnly=yes`, `BatchMode=yes`, `StrictHostKeyChecking=yes`, and `PasswordAuthentication=no`.

Generate a token locally when configuring the environment:

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Send `POST /api/nodes/:id/commands` with `Authorization: Bearer <FLEET_ADMIN_TOKEN>` and a JSON body such as `{"operation":"uptime"}`. Existing operations are preserved: `uptime`, `disk_usage`, `memory_usage`, and `kernel_info`. Additional operations are `disk_usage_all` (`df -h`), `memory_usage_mb` (`free -m`), and `node_exporter_status` (`systemctl status node_exporter.service --no-pager`). Node credentials do not authorize remote operations. A missing operator token disables this route with `503`.

The audit table stores operation metadata and result status, not command output. The synchronous API request times out after 10 seconds and captures stdout and stderr under a combined 8 KiB limit. The host-side `scripts/fleet-command-wrapper.sh` accepts only exact approved command strings and executes fixed absolute executable paths. Install it root-owned and use an authorized-key entry with `restrict,command="/usr/local/sbin/fleet-command-wrapper"`; the wrapper rejects all other requests without evaluating them in a shell.

#### SSH host setup

On Windows, create a dedicated key pair for this integration and grant read access only to the backend process account and SYSTEM. Do not copy the private key to a Linux node:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\fleet-manager-ed25519" -N ""
$key = "$env:USERPROFILE\.ssh\fleet-manager-ed25519"
icacls $key /inheritance:r /grant:r "$($env:USERNAME):(R)" "SYSTEM:(R)"
```

Set the corresponding `FLEET_SSH_NODES` entry to that absolute private-key path in the backend's local environment. If the backend runs as a different Windows account, grant that account read access instead. Copy only the matching `.pub` file to its node.

On each Ubuntu node, create the locked, unprivileged account, install the wrapper, and add the public key with a forced command. Run these commands from a trusted administrator session; substitute the copied public key file path if it differs:

```sh
sudo useradd --create-home --shell /bin/sh fleetdiag
sudo passwd --lock fleetdiag
sudo install -o root -g root -m 0755 scripts/fleet-command-wrapper.sh /usr/local/sbin/fleet-command-wrapper
sudo install -d -o fleetdiag -g fleetdiag -m 0700 /home/fleetdiag/.ssh
sudo sh -c 'printf "%s\n" "restrict,command=\"/usr/local/sbin/fleet-command-wrapper\" $(cat /path/to/fleet-manager-ed25519.pub)" >> /home/fleetdiag/.ssh/authorized_keys'
sudo chown fleetdiag:fleetdiag /home/fleetdiag/.ssh/authorized_keys
sudo chmod 0600 /home/fleetdiag/.ssh/authorized_keys
```

The account must not be in `sudo` or have passwordless sudo rules. Before trusting a host, read its Ed25519 fingerprint from the Ubuntu console with `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Obtain the host public key from Windows with `ssh-keyscan -t ed25519 <node-address>`, calculate that key's fingerprint with `ssh-keygen -lf` on a saved public-key file, compare the fingerprints, and only then append the matching scan result to the backend account's `known_hosts`. `ssh-keyscan` alone does not authenticate a host. The API targets each node's registered IP address, so that address must be reachable from the Windows backend and correspond to the pinned host key.

The Node Exporter diagnostic uses Ubuntu's `node_exporter.service` unit. The command output is returned only to the authenticated operator and is not stored in the audit table.

### Automatic Prometheus discovery refresh

Set `PROMETHEUS_DISCOVERY_FILE` to a dedicated JSON file in a directory shared with the Prometheus host, for example `C:\path\to\prometheus-file-sd\fleet-manager-nodes.json`. Set `PROMETHEUS_DISCOVERY_REFRESH_SECONDS` to a positive integer; it defaults to 15. A blank output path disables backend publishing. The backend reads registered nodes from PostgreSQL at startup and refreshes on the configured interval. Nodes without both exporter fields are omitted; heartbeat status is not used to filter targets. Refreshes use a same-directory temporary file and atomic rename to update the explicitly configured output.

Configure the active Prometheus `file_sd_configs` to read the same file through the Prometheus host's mount path. For WSL, the corresponding path might be `/mnt/<drive>/path/to/prometheus-file-sd/fleet-manager-nodes.json`; replace `<drive>` and the remaining directories with the actual shared location. Prometheus discovers JSON changes on its file-SD refresh interval without a process restart or reload. When changing the active Prometheus YAML itself, back it up, validate with `promtool check config`, then reload or restart Prometheus once. Subsequent node registrations and trusted exporter endpoint provisioning flow into the target file on the next backend refresh. Provisioning an exporter endpoint remains a trusted local database operation; public registration cannot set it.

### Prometheus target provisioning (Phase 4A/4B)

Exporter endpoints are configured locally by an operator; public node
registration cannot set them. On backend startup, the idempotent migration
`database/migrations/002_node_exporter_endpoints.sql` adds nullable endpoint
columns and constraints without changing existing node rows. You can also
apply it manually:

```sh
psql -d <database> -v ON_ERROR_STOP=1 -f database/migrations/002_node_exporter_endpoints.sql
```

Get the existing node IDs from `GET /api/nodes`, then configure each exporter
from a trusted terminal with database access:

```sh
node scripts/provision-exporter-endpoint.js <linux-node-01-id> localhost 9100
node scripts/provision-exporter-endpoint.js <linux-node-02-id> localhost 9101
```

Generate a dedicated discovery file at a chosen path:

```sh
node scripts/generate-prometheus-discovery.js "D:\\fleet-discovery\\fleet-manager-nodes.json"
```

The generator reads all nodes, includes configured endpoints regardless of
online status, and omits nodes whose endpoint is unset. It refuses to replace
an existing file unless `--overwrite` is supplied. Do not point it at the live
WSL `nodes.json`; the protected basename is rejected. To refresh periodically,
schedule this command in Windows Task Scheduler with `--overwrite` after the
first successful generation. This phase only generates the file; it does not
change Prometheus configuration, reload Prometheus, or alter Grafana.


## Reliability and Security

The design prioritizes predictable failure handling and controlled access to managed infrastructure.

- Validate incoming API requests and reject malformed data.
- Use parameterized SQL queries to prevent SQL injection.
- Authenticate node heartbeats with per-node credentials and remote diagnostic requests with a separate operator token.
- Verify node identity before accepting heartbeat updates.
- Use configurable heartbeat intervals and offline thresholds.
- Restrict SSH access to dedicated accounts and approved commands.
- Apply execution timeouts and capture command exit status.
- Record administrative activity for audit and troubleshooting.
- Store credentials securely and exclude secrets from version control.
- Avoid exposing management interfaces directly to untrusted networks.

Node registration and node listing require the fleet-operator bearer token through `requireFleetOperator`, as do node details, command history, and remote diagnostics. Production deployment still needs operator identity management, rate limits, TLS, and a reviewed enrollment policy.

## Testing Strategy

The implementation should be validated against the following scenarios:

- Successful and invalid node registration.
- Duplicate node registration.
- Heartbeat timestamp updates.
- Automatic offline detection after a missed-heartbeat threshold.
- Recovery after communication resumes.
- Backend and database connectivity failures.
- Accuracy of collected system metrics.
- Unauthorized or disallowed remote command attempts.
- Command execution failures and audit record creation.
- End-to-end operation across the dashboard, backend, database, and monitoring stack.
- SSH argument allowlisting, timeout handling, output caps, and operator-token rejection.

## Planned Enhancements

- Role-based access control
- Operator identities and role-based authorization
- Secure node enrollment for untrusted networks
- Resource threshold alerts and node-down notifications
- Centralized log collection
- Automated provisioning and configuration
- Docker-based local deployment
- Improved scalability and fault recovery

## Project Goals

This project explores practical engineering challenges in:

- Linux fleet administration
- REST API and backend development
- Relational data modeling
- Heartbeat-based failure detection
- Infrastructure monitoring and observability
- Secure remote execution
- Operational auditing
- System integration and reliability testing

See [the architecture](docs/architecture.md) and [the system workflow](docs/system-workflow.md) for component boundaries, operational flows, setup, and security assumptions.
