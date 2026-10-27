# Distributed Linux Fleet Management System

**A centralized platform for Linux node management, health monitoring, and controlled remote operations.**

[![Node.js](https://img.shields.io/badge/Node.js-Runtime-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-Backend-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Linux](https://img.shields.io/badge/Linux-System-FCC624?logo=linux&logoColor=black)](https://www.kernel.org/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Monitoring-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Visualization-F46800?logo=grafana&logoColor=white)](https://grafana.com/)

**Status:** In Development

## Overview

The Distributed Linux Fleet Management System is a platform designed to centralize the onboarding, monitoring, and administration of Linux machines.

The system uses a backend service to maintain node inventory, process periodic heartbeats, and detect node availability failures. Prometheus and Node Exporter provide infrastructure metrics, while Grafana enables visualization and analysis. Controlled SSH-based operations are designed to support remote administration with appropriate security and audit controls.

The project emphasizes **reliability, observability, Linux systems engineering, and secure backend design**.

## Core Capabilities

- **Node Management:** Register and maintain an inventory of Linux machines.
- **Heartbeat Monitoring:** Track node liveness through periodic communication with the Fleet Manager.
- **Failure Detection:** Identify stale heartbeats and transition unavailable nodes to an offline state.
- **Infrastructure Monitoring:** Collect CPU, memory, and disk metrics using Prometheus and Node Exporter.
- **Metrics Visualization:** Analyze infrastructure health and historical trends through Grafana.
- **Controlled Remote Execution:** Support approved remote operations through restricted SSH access.
- **Auditability:** Maintain records of administrative operations and their execution results.
- **Web Interface:** Provide a centralized view of node inventory, health, and monitoring information.

> Individual capabilities are subject to implementation and verification. See the development status below.

### Architecture Components

| Component | Responsibility |
|---|---|
| React | Fleet management interface |
| Node.js and Express | REST APIs, node lifecycle, and availability logic |
| PostgreSQL | Node inventory, heartbeat state, and audit records |
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
| Frontend | React, JavaScript, CSS |
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

Authorized operators can initiate approved SSH operations. Access restrictions, input validation, execution timeouts, and audit logging are important controls for this functionality.


## API Reference

The following table describes the intended API surface. Confirm endpoint availability and request formats against the implemented routes.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `POST` | `/api/nodes` | Register a Linux node |
| `GET` | `/api/nodes` | List registered nodes |
| `GET` | `/api/nodes/:id` | Retrieve node details |
| `POST` | `/api/nodes/:id/heartbeat` | Record a node heartbeat |
| `GET` | `/api/nodes/:id/metrics` | Retrieve metrics, if implemented |
| `POST` | `/api/nodes/:id/commands` | Request an approved remote operation, if implemented |


## Reliability and Security

The design prioritizes predictable failure handling and controlled access to managed infrastructure.

- Validate incoming API requests and reject malformed data.
- Use parameterized SQL queries to prevent SQL injection.
- Authenticate and authorize administrative operations.
- Verify node identity before accepting heartbeat updates.
- Use configurable heartbeat intervals and offline thresholds.
- Restrict SSH access to dedicated accounts and approved commands.
- Apply execution timeouts and capture command exit status.
- Record administrative activity for audit and troubleshooting.
- Store credentials securely and exclude secrets from version control.
- Avoid exposing management interfaces directly to untrusted networks.

These measures should be implemented and tested before production use.

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

## Planned Enhancements

- Role-based access control
- Secure node enrollment and credential rotation
- Resource threshold alerts and node-down notifications
- Centralized log collection
- Automated provisioning and configuration
- Docker-based local deployment
- Automated tests and continuous integration
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

*Developed as a systems engineering project focused on Linux infrastructure management, backend services, and observability.*
