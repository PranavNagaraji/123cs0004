"use strict";

const axios = require("axios");
const { Log } = require("../../logging_middleware");

const BASE_URL = process.env.EVAL_BASE_URL || "http://4.224.186.213/evaluation-service";
const TOKEN = process.env.LOG_API_TOKEN || "";

const authHeaders = {
  Authorization: `Bearer ${TOKEN}`,
};

async function fetchDepots() {
  await Log("backend", "info", "repository", "Fetching depots from evaluation service...");

  const response = await axios.get(`${BASE_URL}/depots`, { headers: authHeaders });

  await Log("backend", "info", "repository", `Received ${response.data.depots.length} depots`);
  return response.data.depots;
}

async function fetchVehicles() {
  await Log("backend", "info", "repository", "Fetching vehicles from evaluation service...");

  const response = await axios.get(`${BASE_URL}/vehicles`, { headers: authHeaders });

  await Log("backend", "info", "repository", `Received ${response.data.vehicles.length} vehicles`);
  return response.data.vehicles;
}

module.exports = { fetchDepots, fetchVehicles };
