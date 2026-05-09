# Notification System Design

---

## Stage 1

### Core Actions

The campus notification platform must support the following actions:

| Action | Actor |
|---|---|
| Fetch all notifications for a logged-in student | Student |
| Fetch unread notifications count | Student |
| Mark a single notification as read | Student |
| Mark all notifications as read | Student |
| Create and broadcast a notification | Admin / HR |
| Fetch notifications filtered by type | Student |
| Subscribe to real-time notifications | Student |

---

### REST API Endpoints

#### 1. Get Notifications for a Student

```
GET /notifications
```

**Headers**
```json
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

**Query Parameters**
| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | No | Filter by `Placement`, `Event`, or `Result` |
| `isRead` | `boolean` | No | Filter by read status |
| `page` | `number` | No | Page number (default: 1) |
| `limit` | `number` | No | Results per page (default: 20) |

**Response — 200 OK**
```json
{
  "notifications": [
    {
      "id": "notif_01",
      "type": "Placement",
      "title": "Google is hiring!",
      "message": "Google has opened applications for SDE-1.",
      "isRead": false,
      "createdAt": "2026-05-09T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 84
  }
}
```

**Response — 401 Unauthorized**
```json
{ "error": "Invalid or expired token" }
```

---

#### 2. Get Unread Notification Count

```
GET /notifications/unread-count
```

**Headers**
```json
{ "Authorization": "Bearer <jwt_token>" }
```

**Response — 200 OK**
```json
{ "unreadCount": 12 }
```

---

#### 3. Mark a Single Notification as Read

```
PATCH /notifications/:id/read
```

**Headers**
```json
{ "Authorization": "Bearer <jwt_token>" }
```

**Response — 200 OK**
```json
{ "id": "notif_01", "isRead": true }
```

**Response — 404 Not Found**
```json
{ "error": "Notification not found" }
```

---

#### 4. Mark All Notifications as Read

```
PATCH /notifications/read-all
```

**Headers**
```json
{ "Authorization": "Bearer <jwt_token>" }
```

**Response — 200 OK**
```json
{ "updated": 12 }
```

---

#### 5. Create and Broadcast a Notification (Admin / HR)

```
POST /notifications
```

**Headers**
```json
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body**
```json
{
  "type": "Placement",
  "title": "Google is hiring!",
  "message": "Google has opened applications for SDE-1.",
  "targetAudience": "all"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | Yes | `Placement`, `Event`, or `Result` |
| `title` | `string` | Yes | Short heading |
| `message` | `string` | Yes | Full notification body |
| `targetAudience` | `string` | Yes | `all` or a specific student ID |

**Response — 201 Created**
```json
{
  "id": "notif_02",
  "type": "Placement",
  "title": "Google is hiring!",
  "message": "Google has opened applications for SDE-1.",
  "createdAt": "2026-05-09T10:05:00Z",
  "recipientCount": 50000
}
```

**Response — 403 Forbidden**
```json
{ "error": "Admin access required" }
```

---

### Real-Time Notification Mechanism

#### Options Evaluated

**1. WebSockets**
- Persistent bi-directional connection between client and server
- Best for interactive, high-frequency updates
- Higher server resource usage (one open connection per student)

**2. Server-Sent Events (SSE)**
- Uni-directional: server pushes to client over a persistent HTTP connection
- Simpler than WebSockets — built on standard HTTP, no upgrade protocol
- Clients auto-reconnect on disconnect
- Sufficient for notification delivery (server → client only)

**3. Polling**
- Client calls `GET /notifications` every N seconds
- Simple to implement but wastes bandwidth and increases DB load
- Not suitable at 50,000 active students

#### Recommendation: Server-Sent Events (SSE)

SSE is the right choice for this platform because:
- Notifications are strictly server → client (no need for bi-directional)
- Lower infrastructure overhead than WebSockets
- Built-in browser reconnection handles network drops
- Works over standard HTTP/2 multiplexing

**SSE Endpoint**

```
GET /notifications/stream
```

**Headers**
```json
{
  "Authorization": "Bearer <jwt_token>",
  "Accept": "text/event-stream"
}
```

**Server Response Headers**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Payload (pushed by server)**
```
id: notif_03
event: notification
data: {"id":"notif_03","type":"Result","title":"Semester results published","isRead":false,"createdAt":"2026-05-09T11:00:00Z"}
```

When a new notification is created via `POST /notifications`, the server fans it out to all connected SSE clients belonging to the target audience.

---

## Stage 2

### Database Choice

**PostgreSQL** is the recommended database for this platform.

| Requirement | Why PostgreSQL fits |
|---|---|
| Structured, relational data | Students, notifications, and recipients have clear relationships |
| ACID guarantees | A notification must be atomically stored before it is pushed to clients |
| Complex queries | Filtering by type, read-status, date range, and pagination are standard SQL |
| Enum support | `notificationType` maps directly to a PostgreSQL `ENUM` |
| Scalability tools | Built-in partitioning, indexing, read replicas supported natively |

---

### Schema

```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Event', 'Result');

CREATE TABLE students (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  roll_no     VARCHAR(20) UNIQUE NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         notification_type NOT NULL,
  title        VARCHAR(255) NOT NULL,
  message      TEXT NOT NULL,
  created_by   INTEGER REFERENCES students(id),
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notification_recipients (
  id              SERIAL PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  student_id      INTEGER REFERENCES students(id) ON DELETE CASCADE,
  is_read         BOOLEAN DEFAULT FALSE,
  read_at         TIMESTAMP,
  UNIQUE (notification_id, student_id)
);

CREATE INDEX idx_recipients_student ON notification_recipients (student_id);
CREATE INDEX idx_recipients_unread  ON notification_recipients (student_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications (type);
CREATE INDEX idx_notifications_created ON notifications (created_at DESC);
```

**Design rationale**: `notifications` stores the message once. `notification_recipients` is the fan-out junction table — one row per student per notification. This avoids duplicating the message content 50,000 times.

---

### Scaling Problems as Data Grows

At 50,000 students and 5,000,000 notifications:

| Problem | Root Cause |
|---|---|
| `notification_recipients` table bloat | 50k rows inserted per broadcast → tens of millions of rows quickly |
| Slow unread-count queries | Full scan of `notification_recipients` per student without a partial index |
| High write throughput on broadcast | 50,000 `INSERT` statements per "Notify All" action |
| Index maintenance overhead | Every insert updates all indexes on the table |
| `ORDER BY createdAt DESC` without index | Full sort on millions of rows |

### Solutions

1. **Partial index on unread**: `WHERE is_read = FALSE` — index shrinks as notifications are read
2. **Table partitioning by `created_at`**: Archive old notifications to cold partitions; queries only touch recent partitions
3. **Bulk insert for fan-out**: Replace 50k individual inserts with a single `INSERT INTO ... SELECT` from a student IDs array
4. **Read replicas**: Route all `GET` queries to a replica; writes go to the primary
5. **Soft-delete / archiving**: Move notifications older than 90 days to an `archived_notifications` table

---

### SQL Queries Mapped to Stage 1 APIs

**GET /notifications** — paginated, filterable

```sql
SELECT
  n.id,
  n.type,
  n.title,
  n.message,
  nr.is_read,
  n.created_at
FROM notification_recipients nr
JOIN notifications n ON n.id = nr.notification_id
WHERE nr.student_id = $1
  AND ($2::notification_type IS NULL OR n.type = $2)
  AND ($3::boolean IS NULL OR nr.is_read = $3)
ORDER BY n.created_at DESC
LIMIT $4 OFFSET $5;
```

**GET /notifications/unread-count**

```sql
SELECT COUNT(*) AS unread_count
FROM notification_recipients
WHERE student_id = $1
  AND is_read = FALSE;
```

**PATCH /notifications/:id/read**

```sql
UPDATE notification_recipients
SET is_read = TRUE, read_at = NOW()
WHERE notification_id = $1
  AND student_id = $2;
```

**PATCH /notifications/read-all**

```sql
UPDATE notification_recipients
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1
  AND is_read = FALSE;
```

**POST /notifications** — fan-out insert

```sql
INSERT INTO notifications (type, title, message, created_by)
VALUES ($1, $2, $3, $4)
RETURNING id;

INSERT INTO notification_recipients (notification_id, student_id)
SELECT $1, id FROM students;
```

---

## Stage 3

### Query Under Review

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

---

### Is This Query Accurate?

No — there are two issues beyond performance:

1. `SELECT *` fetches every column including potentially large `message` (TEXT) fields. Only the columns actually needed by the frontend should be selected.
2. Based on the schema designed in Stage 2, `studentID` and `isRead` live in `notification_recipients`, not in `notifications`. The query as written would either fail or produce wrong results. The correct version must JOIN both tables.

---

### Why Is It Slow?

At 5,000,000 rows in `notification_recipients`:

| Reason | Impact |
|---|---|
| No composite index on `(studentID, isRead, createdAt)` | Full table scan — PostgreSQL reads every row to find matches |
| `SELECT *` fetches full rows | More I/O; rows with large TEXT fields are expensive to load |
| `ORDER BY createdAt DESC` without a supporting index | Database sorts all matched rows in memory |
| `isRead = false` is low-selectivity without a partial index | Even with a single-column index on `studentID`, the planner may skip it |

**Estimated cost without index**: O(n) — linear scan over millions of rows.

---

### What to Change

**1. Fix the query — use the correct schema**

```sql
SELECT
  n.id,
  n.type,
  n.title,
  n.message,
  nr.is_read,
  n.created_at
FROM notification_recipients nr
JOIN notifications n ON n.id = nr.notification_id
WHERE nr.student_id = 1042
  AND nr.is_read = false
ORDER BY n.created_at DESC;
```

**2. Add a composite index**

```sql
CREATE INDEX idx_recipients_student_unread_date
ON notification_recipients (student_id, is_read, notification_id);
```

**3. Better: use a partial index (only indexes unread rows)**

```sql
CREATE INDEX idx_recipients_unread
ON notification_recipients (student_id)
WHERE is_read = FALSE;
```

This index automatically shrinks as students read their notifications — far more space-efficient than a full index.

---

### Computation Cost After Fix

| State | Strategy | Cost |
|---|---|---|
| Without index | Full sequential scan | O(n) — millions of row reads |
| With composite index | B-tree lookup by student_id + is_read | O(log n) lookup + O(k) result rows |
| With partial index (is_read = FALSE) | B-tree on much smaller dataset | O(log m) where m << n |

---

### Should You Index Every Column?

**No — this is bad advice.** Here is why:

| Concern | Explanation |
|---|---|
| Write amplification | Every `INSERT` and `UPDATE` must update all indexes — 50k inserts per broadcast becomes extremely slow |
| Storage overhead | Each index duplicates column data on disk |
| Query planner confusion | PostgreSQL's planner may choose a suboptimal index when too many exist |
| Low-selectivity indexes are useless | An index on a boolean column like `is_read` has near-zero benefit without a partial filter |

The correct approach is to index **only the columns and combinations that appear in your actual WHERE and ORDER BY clauses**, and prefer partial indexes where possible.

---

### Query: Students Who Received a Placement Notification in the Last 7 Days

```sql
SELECT DISTINCT nr.student_id
FROM notification_recipients nr
JOIN notifications n ON n.id = nr.notification_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

**Supporting index for this query:**

```sql
CREATE INDEX idx_notifications_type_date
ON notifications (type, created_at DESC);
```

This allows PostgreSQL to scan only `Placement` rows within the last 7 days using an index range scan instead of a full table scan.

---

## Stage 4

### Problem

Notifications are fetched from the database on every page load for every student. At 50,000 concurrent students, this produces 50,000 DB read queries simultaneously — overwhelming the primary database and causing high latency and degraded user experience.

---

### Strategies and Tradeoffs

#### 1. Redis Cache (Per-Student Notification List)

**How it works**: When a student's notifications are fetched, the result is stored in Redis with the key `notifications:{student_id}` and a TTL (e.g. 60 seconds). Subsequent requests within the TTL window are served from Redis without hitting the DB. When a new notification is created for a student, their cache key is invalidated.

| Benefit | Tradeoff |
|---|---|
| Eliminates repeated DB reads for the same student | Cache invalidation logic must be maintained — every write must invalidate the right keys |
| Sub-millisecond response times from Redis | Stale data possible within the TTL window |
| Scales horizontally (Redis cluster) | Additional infrastructure to deploy and monitor |
| Reduces DB connection pressure significantly | Memory cost — large notification lists per student |

**Recommendation: Use this.** Cache the paginated notification list with a short TTL (30–60s). On `POST /notifications`, invalidate the cache keys of all target students (or use a write-through pattern for small audiences).

---

#### 2. HTTP Cache-Control Headers

**How it works**: Set `Cache-Control: max-age=30` on `GET /notifications` responses. The browser caches the response locally and skips the network request until the TTL expires.

| Benefit | Tradeoff |
|---|---|
| Zero server cost for repeated requests within TTL | Cannot push real-time updates — browser shows stale data until TTL expires |
| No extra infrastructure needed | Incompatible with the SSE real-time mechanism chosen in Stage 1 |
| Works natively in browsers | Cannot invalidate from the server side mid-TTL |

**Verdict**: Useful as a secondary layer for static assets, but insufficient as the primary caching strategy for real-time notifications.

---

#### 3. Pagination with Cursor-Based Navigation

**How it works**: Instead of fetching all notifications, the client fetches a fixed page (e.g. 20 items). Each response includes a `cursor` pointing to the next page. The client only fetches more when the user scrolls.

| Benefit | Tradeoff |
|---|---|
| Drastically reduces result set size per query | Not a caching strategy — still hits the DB on every fetch |
| Reduces memory and bandwidth per request | Requires frontend pagination/infinite scroll implementation |
| Pairs well with Redis (cache each page independently) | Cursor invalidation is complex when new notifications arrive |

**Verdict**: Essential as a DB query strategy but not a substitute for caching.

---

#### 4. Database Read Replica

**How it works**: Route all `GET /notifications` queries to a read replica of PostgreSQL. The primary handles only writes.

| Benefit | Tradeoff |
|---|---|
| Offloads all read traffic from the primary DB | Replication lag (1–200ms) means replica may return slightly stale data |
| No application-level cache to invalidate | Additional infrastructure and cost |
| Scales read throughput independently | Does not reduce round-trips — each page load still queries the replica |

**Verdict**: A good complementary strategy alongside Redis, not a standalone replacement.

---

### Recommended Architecture

```
Student Page Load
      │
      ▼
 Redis Cache ──── HIT ──▶ Return cached notifications
      │
     MISS
      │
      ▼
 PostgreSQL Read Replica ──▶ Return results ──▶ Store in Redis (TTL: 60s)

POST /notifications (new notification created)
      │
      ▼
 Write to PostgreSQL Primary
      │
      ▼
 Invalidate Redis keys for all target students
      │
      ▼
 Push event to SSE-connected clients
```

**Cache key format**: `notifs:{student_id}:page:{page}:type:{type}:unread:{isRead}`

**TTL**: 60 seconds for the notification list; no TTL for the unread count (invalidate immediately on every read/write event).

---

## Stage 5

### Proposed Implementation Under Review

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # real-time push
```

---

### Shortcomings

| Problem | Explanation |
|---|---|
| **Synchronous loop over 50,000 students** | Each iteration blocks on three operations before moving to the next student. Sending 50k emails sequentially could take hours |
| **No fault isolation** | If `send_email` fails for student #300, the entire loop stops — students #301–50,000 receive nothing |
| **No retry mechanism** | Failed email calls are permanently lost with no way to re-attempt |
| **Sequential DB inserts** | 50,000 individual `save_to_db` calls means 50,000 round-trips to the database; should be a single bulk insert |
| **No idempotency** | If the process crashes and is restarted, students already processed get duplicate notifications |
| **Email API and DB tightly coupled** | If the Email API is slow (common), it blocks the DB insert for every student — even if DB is healthy |

---

### What Happened When Email Failed for 200 Students Midway?

With the current implementation:
- The loop exits at the first unhandled error
- Students #300–50,000 (or whichever 200 failed and all after) receive no notification
- There is no record of who was processed and who was not
- A re-run would duplicate notifications for students already processed

---

### Redesigned Approach — Message Queue with Worker Pool

**Core principle**: decouple the three operations. Each student notification is an independent, retryable unit of work.

#### Step 1 — Bulk save to DB first (single transaction)

```
INSERT INTO notification_recipients (notification_id, student_id)
SELECT notification_id, id FROM students;
```

The notification is atomically persisted for all 50,000 students in one query. DB is the source of truth — even if everything else fails, the data is safe.

#### Step 2 — Enqueue email jobs (do not send inline)

Push one job per student into a message queue (e.g. Bull with Redis, RabbitMQ, or AWS SQS):

```
for student_id in student_ids:
    email_queue.push({ student_id, message, notification_id })
```

This loop is now fast — it only enqueues, it does not send.

#### Step 3 — Workers consume and send concurrently

Worker processes pull jobs from the queue and call the Email API with configurable concurrency (e.g. 100 workers in parallel):

```
worker.process(concurrency=100, job => {
    send_email(job.student_id, job.message)
})
```

Failed jobs are retried with exponential backoff. After N retries, the job moves to a dead-letter queue for manual inspection.

#### Step 4 — Real-time push is independent

`push_to_app` fires via SSE immediately after the DB insert in Step 1, not after email — these are separate concerns.

---

### Should DB Save and Email Happen Together?

**No — they must be decoupled.** Here is why:

| Concern | Explanation |
|---|---|
| **Different failure modes** | DB inserts are fast and highly reliable. Email APIs are slow and frequently fail or rate-limit |
| **Different latency requirements** | The in-app notification must appear instantly; email delivery can tolerate a delay of seconds or minutes |
| **Atomicity mismatch** | You cannot roll back a sent email if the DB insert fails. Doing them together creates an inconsistent state either way |
| **DB is the source of truth** | Save to DB first, always. If email fails, you can re-derive the recipient list from the DB and retry |

---

### Revised Pseudocode

```
function notify_all(student_ids: array, message: string):

    # Step 1: Persist atomically — one bulk insert
    notification_id = db.insert_notification(message)
    db.bulk_insert_recipients(notification_id, student_ids)

    # Step 2: Push real-time events to connected SSE clients
    for student_id in student_ids:
        sse_server.push(student_id, { notification_id, message })

    # Step 3: Enqueue email jobs — fast, non-blocking
    for student_id in student_ids:
        email_queue.enqueue({
            job_id: uuid(),               # idempotency key
            student_id: student_id,
            notification_id: notification_id,
            message: message,
            retry_count: 0,
            max_retries: 5
        })

    return { queued: len(student_ids), notification_id: notification_id }


# Worker (runs in a separate process pool, concurrency = 100)
function email_worker(job):
    try:
        send_email(job.student_id, job.message)
        job.mark_complete()
    catch EmailAPIError as err:
        if job.retry_count < job.max_retries:
            delay = exponential_backoff(job.retry_count)
            email_queue.requeue(job, delay=delay)
        else:
            dead_letter_queue.push(job)
            log_failure(job.student_id, err)
```

**Key guarantees of the revised design**:
- DB insert is atomic — all 50,000 records saved or none
- Email failure for 200 students does not affect the other 49,800
- Failed jobs are retried automatically up to 5 times with backoff
- Permanently failed jobs land in a dead-letter queue for inspection
- Idempotency key (`job_id`) prevents duplicate emails if a worker crashes mid-send and the job is requeued
- Real-time SSE push is instant and independent of email delivery time



