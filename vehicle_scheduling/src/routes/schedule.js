"use strict";

const { Log } = require("../../../logging_middleware");
const { fetchDepots, fetchVehicles } = require("../evaluationClient");

const { scheduleForDepot } = require("../scheduler");


async function handleSchedule(req, res) {
  await Log("backend", "info", "handler", "POST /schedule — request received");

  try {
    const [depots, vehicles] = await Promise.all([fetchDepots(), fetchVehicles()]);

    await Log(
      "backend",
      "info",
      "handler",
      `Data fetched — depots: ${depots.length}, vehicles: ${vehicles.length}`
    );

    const schedules = await Promise.all(depots.map((depot) => scheduleForDepot(depot, vehicles)));

    await Log("backend", "info", "handler", `Scheduling complete for all ${schedules.length} depots`);

    return res.status(200).json({ schedules });
  } catch (err) {
    await Log("backend", "error", "handler", `Schedule computation failed: ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
}

module.exports = { handleSchedule };
