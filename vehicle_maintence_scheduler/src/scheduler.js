"use strict";

const { Log } = require("../../logging_middleware");

function knapsack(capacity, vehicles) {
  const n = vehicles.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = vehicles[i - 1];
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (Duration <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - Duration] + Impact);
      }
    }
  }

  const selectedVehicles = [];
  let remainingCapacity = capacity;

  for (let i = n; i > 0; i--) {
    if (dp[i][remainingCapacity] !== dp[i - 1][remainingCapacity]) {
      selectedVehicles.push(vehicles[i - 1]);
      remainingCapacity -= vehicles[i - 1].Duration;
    }
  }

  return {
    totalImpact: dp[n][capacity],
    selectedVehicles: selectedVehicles.reverse(),
  };
}

async function scheduleForDepot(depot, vehicles) {
  await Log(
    "backend",
    "info",
    "domain",
    `Running schedule for depot ${depot.ID} — budget: ${depot.MechanicHours} hours, vehicles: ${vehicles.length}`
  );

  if (vehicles.length === 0) {
    await Log("backend", "warning", "domain", `No vehicles available to schedule for depot ${depot.ID}`);
    return { depotID: depot.ID, mechanicHours: depot.MechanicHours, totalImpact: 0, scheduledVehicles: [] };
  }

  const result = knapsack(depot.MechanicHours, vehicles);

  const hoursUsed = result.selectedVehicles.reduce((sum, v) => sum + v.Duration, 0);

  await Log(
    "backend",
    "info",
    "domain",
    `Depot ${depot.ID} — selected ${result.selectedVehicles.length} vehicles, total impact: ${result.totalImpact}, hours used: ${hoursUsed}/${depot.MechanicHours}`
  );

  return {
    depotID: depot.ID,
    mechanicHours: depot.MechanicHours,
    totalImpact: result.totalImpact,
    hoursUsed,
    scheduledVehicles: result.selectedVehicles.map((v) => v.TaskID),
  };
}

module.exports = { scheduleForDepot };
