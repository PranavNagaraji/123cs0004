"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const axios = require("axios");

const NOTIFICATION_API = `${process.env.EVAL_BASE_URL}/notifications`;
const TOKEN = process.env.LOG_API_TOKEN || "";

const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function scoreNotification(notif) {
  const typeWeight = TYPE_WEIGHT[notif.Type] || 0;
  const recencyMs = new Date(notif.Timestamp).getTime();
  return typeWeight * 1e13 + recencyMs;
}

class MinHeap {
  constructor() {
    this.heap = [];
  }

  size() {
    return this.heap.length;
  }

  peek() {
    return this.heap[0];
  }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].score <= this.heap[idx].score) break;
      [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
      idx = parent;
    }
  }

  _sinkDown(idx) {
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < n && this.heap[left].score < this.heap[smallest].score) smallest = left;
      if (right < n && this.heap[right].score < this.heap[smallest].score) smallest = right;
      if (smallest === idx) break;
      [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
      idx = smallest;
    }
  }
}

function getTopN(notifications, n) {
  const heap = new MinHeap();

  for (const notif of notifications) {
    const scored = { ...notif, score: scoreNotification(notif) };

    if (heap.size() < n) {
      heap.push(scored);
    } else if (scored.score > heap.peek().score) {
      heap.pop();
      heap.push(scored);
    }
  }

  const result = [];
  while (heap.size() > 0) result.push(heap.pop());
  return result.reverse();
}

function printTable(notifications, n) {
  const divider = "─".repeat(100);
  console.log(`\n${"─".repeat(100)}`);
  console.log(` PRIORITY INBOX — Top ${n} Notifications  (Placement > Result > Event, then by recency)`);
  console.log(divider);
  console.log(` Rank  Type          Message                          Timestamp              Priority Score`);
  console.log(divider);

  notifications.forEach((notif, i) => {
    const rank = String(i + 1).padStart(4, " ");
    const type = notif.Type.padEnd(13, " ");
    const msg = notif.Message.length > 30
      ? notif.Message.slice(0, 27) + "..."
      : notif.Message.padEnd(30, " ");
    const ts = notif.Timestamp.padEnd(22, " ");
    const score = notif.score.toExponential(4);
    console.log(` ${rank}. ${type} ${msg}  ${ts}  ${score}`);
  });

  console.log(divider);
}

async function main() {
  const n = parseInt(process.argv[2]) || 10;

  console.log(`\nFetching notifications...`);

  const response = await axios.get(NOTIFICATION_API, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  const notifications = response.data.notifications;
  console.log(`Total received: ${notifications.length} notifications`);

  const top = getTopN(notifications, n);

  printTable(top, n);

  console.log(`\nType weights used:  Placement=3  Result=2  Event=1`);
  console.log(`Score formula:      score = typeWeight × 10¹³ + timestamp_ms\n`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
