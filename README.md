# 123cs0004

A backend submission consisting of a reusable logging middleware package, a vehicle maintenance scheduling microservice, a priority notification inbox, and a system design document covering a campus notifications platform.

## Structure

```
├── .env                          # Environment config (not tracked)
├── logging_middleware/           # Reusable Log() package
├── vehicle_scheduling/           # Vehicle maintenance scheduler microservice
├── priority_inbox/               # Priority notification inbox (Stage 6)
└── notification_system_design.md # System design — Stages 1–6
```

## Logging Middleware

A reusable `Log(stack, level, package, message)` function that prints structured logs locally and forwards them to an evaluation server.

```bash
cd logging_middleware
npm install
```

## Vehicle Scheduling Microservice

Fetches depots and vehicles from the evaluation API, runs a 0/1 Knapsack algorithm per depot to maximise vehicle impact within mechanic-hour budgets, and returns optimal schedules.

```bash
cd vehicle_scheduling
npm install
node index.js
```

**Endpoints**

| Method | Path | Description |
|---|---|---|
| `POST` | `/schedule` | Run knapsack scheduler for all depots |
| `GET` | `/health` | Health check |

## Priority Inbox

Fetches notifications from the evaluation API and returns the top N by priority. Priority is scored by type weight (`Placement > Result > Event`) and recency.

```bash
cd priority_inbox
npm install
node index.js 10   # top 10
```

## Environment Variables

Create a `.env` file at the root:

```
EVAL_BASE_URL=http://4.224.186.213/evaluation-service
LOG_API_URL=http://4.224.186.213/evaluation-service/logs
LOG_API_TOKEN=<your_token>
SCHEDULER_PORT=4000
```
