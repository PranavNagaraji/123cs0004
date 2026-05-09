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
