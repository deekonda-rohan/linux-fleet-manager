# Codebase Guide

This guide follows the implementation in this repository. It explains how requests and background work move through the code, and distinguishes repository behavior from monitoring configuration maintained outside it.

## Project structure

```text
database/
  schema.sql                 Base node table
  migrations/                Additive schema changes applied at startup
docs/                        Architecture, workflow, and codebase documentation
scripts/                     Heartbeat, provisioning, and discovery utilities
src/
  app.js                     Express application and common error handling
  server.js                  Startup, background services, and shutdown wiring
  config/                    Database, availability, SSH, and discovery settings
  controllers/               HTTP request handlers
  middleware/                Operator and node credential authentication
  repositories/               PostgreSQL queries grouped by data area
  routes/                     HTTP route definitions
  services/                   Validation, credentials, availability, SSH, discovery
test/                         Node's built-in test runner tests
.github/workflows/             CI workflow that installs dependencies and runs tests
```

The database is PostgreSQL. The Express API and scheduled work run in the same Node.js process. Prometheus and Grafana configuration are not provisioned by this repository.

## Backend startup and shutdown

`src/server.js` loads `.env` with dotenv, reads availability and Prometheus discovery settings, checks the PostgreSQL connection, and applies the schema and migrations. It starts the Express application on `0.0.0.0` using `PORT` (default `3000`). After the HTTP listener is ready, it starts the heartbeat availability checker. When a Prometheus discovery output path is configured, it also starts the discovery refresher.

On `SIGINT` or `SIGTERM`, the shutdown handler in `src/services/shutdown.js` stops background work, closes the HTTP listener, and closes the PostgreSQL pool. Startup failures also attempt to close the pool and set a failing process exit code.

## Database connection and schema changes

`src/config/db.js` creates a shared `pg.Pool` using the `DB_*` environment variables. It tests connectivity with a small query before the API starts. Its `initializeDatabase()` function reads and executes `database/schema.sql`, then applies these SQL files in order:

1. `database/migrations/001_node_credentials.sql`
2. `database/migrations/002_node_exporter_endpoints.sql`
3. `database/migrations/003_remote_command_audit.sql`
4. `database/migrations/004_remote_diagnostic_operations.sql`

The schema creates the `nodes` table. The migrations add credential storage, exporter endpoint fields, and the remote-command audit structures and supported operations. Startup applies these files directly; there is no migration-runner framework in this code. Repository queries use PostgreSQL parameters for values.

The query modules are `src/repositories/node.repository.js`, `src/repositories/node-exporter.repository.js`, and `src/repositories/remote-command.repository.js`.

## Node registration and heartbeat

The node routes are mounted at `/api/nodes` in `src/app.js` and declared in `src/routes/node.route.js`. Registration (`POST /api/nodes`) first passes through `requireFleetOperator` in `src/middleware/require-fleet-operator.js`. `src/controllers/node.controller.js` validates the node fields using `src/services/node-validation.js`, creates a random node credential, hashes it, and inserts the node and credential hash. The plaintext credential is returned once in the response; it is not stored in the database.

Heartbeat requests (`POST /api/nodes/:id/heartbeat`) instead use `authenticateNode` from `src/middleware/authenticate-node.js`. It checks the bearer credential against the stored hash for that same node, using constant-time hash comparison and rejecting revoked credentials. The controller calls `recordNodeHeartbeat()` in `src/services/node-availability.js`, which updates `last_seen_at` and sets the node online.

The availability checker periodically marks online nodes offline when their non-null heartbeat timestamp is older than the configured timeout. Its defaults and validation are in `src/config/availability.js`; the checker is implemented in `src/services/node-availability.js`. The Linux-side sender is `scripts/heartbeat.sh`.

## Prometheus dynamic service discovery

Exporter endpoints are stored on node records and can be set by the local utility `scripts/provision-exporter-endpoint.js`. Public node registration does not set these values. `src/repositories/node-exporter.repository.js` reads configured endpoints for all nodes, without filtering on heartbeat status.

When `PROMETHEUS_DISCOVERY_FILE` is configured, `src/server.js` creates the refresher in `src/services/prometheus-discovery-refresh.js`. It reads nodes, asks `src/services/prometheus-discovery.js` to format Prometheus file-SD JSON, and publishes it through `src/services/atomic-discovery-file.js`. The publisher writes a temporary file beside the target and renames it into place. It validates the output name and refuses to target the protected `nodes.json` basename. The refresh interval is configured by `PROMETHEUS_DISCOVERY_REFRESH_SECONDS` in `src/config/prometheus-discovery.js`.

The standalone `scripts/generate-prometheus-discovery.js` utility can publish a file manually. This project writes the discovery file; it does not change Prometheus configuration or reload Prometheus. Prometheus must separately be configured to read that file through `file_sd_configs`.

## Remote SSH diagnostics and restrictions

`POST /api/nodes/:id/commands` is protected by the fleet operator bearer token. `src/controllers/remote-command.controller.js` validates the node ID and operation, looks up the registered node address, then requires an SSH mapping for that node from `FLEET_SSH_NODES`, parsed by `src/config/ssh.js`. An audit record is created before execution and updated with the result afterward through `src/repositories/remote-command.repository.js`.

The operation names map to fixed command strings in `src/services/remote-operations.js`; requests cannot supply arbitrary commands or extra arguments. The code launches `ssh` with `shell: false`, an explicit per-node identity file, `IdentitiesOnly=yes`, batch mode, password authentication disabled, strict host-key checking, and a connection timeout. Execution has a configurable timeout and an 8 KiB combined stdout/stderr capture limit. The response can include output for the authorized caller, but the audit stores operation metadata and outcome rather than command output.

On the Linux host, `scripts/fleet-command-wrapper.sh` enforces the command allowlist for a forced-command SSH key. This wrapper is part of the host setup procedure; the backend does not install or configure it remotely.

## Grafana monitoring flow

The monitoring path described by the repository is: Node Exporter exposes Linux metrics; Prometheus scrapes configured exporter endpoints; Grafana visualizes data held by Prometheus. The Fleet Manager contributes endpoint records and a generated file-SD target list, but does not proxy metric queries, deploy Node Exporter, or contain the active Prometheus/Grafana configuration. The active monitoring configuration and dashboards are managed outside this repository. See `docs/architecture.md` for the system boundary and `docs/system-workflow.md` for operator setup details.

## API request flow and examples

`src/app.js` installs JSON parsing, mounts the health and node routers, and maps malformed or oversized JSON to client errors. `src/routes/healthcheck.route.js` and `src/routes/node.route.js` map HTTP methods and paths to handlers. Controllers validate request data and call service and repository modules; authentication middleware runs on protected routes before the controller.

| Method and path | Authentication | Purpose |
|---|---|---|
| `GET /api/health` | None | Health response |
| `POST /api/nodes` | Fleet operator bearer token | Register a node; returns its credential once |
| `GET /api/nodes` | Fleet operator bearer token | List node inventory |
| `GET /api/nodes/:id` | Fleet operator bearer token | Read one node |
| `POST /api/nodes/:id/heartbeat` | That node's bearer credential | Record heartbeat |
| `POST /api/nodes/:id/credential/rotate` | That node's current bearer credential | Rotate its credential |
| `POST /api/nodes/:id/credential/revoke` | That node's current bearer credential | Revoke its credential |
| `POST /api/nodes/:id/commands` | Fleet operator bearer token | Run one approved diagnostic |
| `GET /api/nodes/commands/history` | Fleet operator bearer token | Read paginated audit history |

For example, a heartbeat uses the node's own credential:

```http
POST /api/nodes/5/heartbeat
Authorization: Bearer <node-credential>
```

A diagnostic uses the operator credential and one operation name:

```http
POST /api/nodes/5/commands
Authorization: Bearer <fleet-operator-token>
Content-Type: application/json

{"operation":"uptime"}
```

History accepts `node_id`, `limit`, and `offset`, for example `GET /api/nodes/commands/history?node_id=7&limit=25&offset=0`. These examples use placeholders; do not put actual credentials in source or documentation. The route table in `src/routes/node.route.js` is the source of truth for registered paths.

## Automated tests

Tests are in `test/` and use Node.js's built-in `node:test` runner and strict assertions. They cover API routes and operator authorization, node validation and credentials, heartbeats and availability, SSH operation constraints and execution behavior, Prometheus discovery formatting/configuration/refresh/file publication, exporter endpoint validation, and graceful shutdown. The test files are organized around these areas; the related implementation is typically in the correspondingly named service, middleware, controller, or repository.

Run the complete suite from the repository root with:

```sh
npm test
```

The same command is run in `.github/workflows/test.yml` after dependency installation.

## Recommended reading order

1. `src/app.js` — see how middleware and routers are assembled.
2. `src/routes/node.route.js` and `src/routes/healthcheck.route.js` — learn the actual HTTP surface and authentication boundaries.
3. `src/controllers/node.controller.js` and `src/controllers/remote-command.controller.js` — follow request validation and response handling.
4. `src/middleware/` and `src/services/node-validation.js` — understand authentication and input checks.
5. `src/services/node-credentials.js` and `src/services/node-availability.js` — follow node identity and liveness behavior.
6. `src/repositories/` and `database/schema.sql` plus `database/migrations/` — connect application operations to persisted data.
7. `src/services/remote-operations.js` and `src/config/ssh.js` — inspect SSH allowlisting and execution safeguards.
8. `src/config/prometheus-discovery.js` and `src/services/prometheus-discovery*.js` — follow discovery configuration and refresh behavior.
9. `src/server.js` and `src/services/shutdown.js` — understand process lifecycle and background services.
10. The matching files in `test/` — see expected behavior at each boundary.

For broader component relationships and operational procedures, use `docs/architecture.md` and `docs/system-workflow.md`.
