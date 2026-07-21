// main.ts
import {
  handleHeartbeatNew,
  handleHeartbeatPost,
  handleHeartbeatStatus,
  handleHeartbeatHistory,
  recordHeartbeatSnapshot,
} from "./api/heartbeat.ts";
import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { handleTimeNew, handleMapLeaderboard, handleUserTimes } from "./api/times.ts";
import { handleBlockNew, handleBlockGet, handleBlockList } from "./api/blocks.ts";
import {
  handleMapNew,
  handleMapGet,
  handleMapRecordView,
  handleMapRecordLoad,
  handleMapSearch,
  handleMapHome,
  handleMapHistory,
  recordMapStatsSnapshot,
} from "./api/maps.ts";

const HEARTBEAT_SNAPSHOT_INTERVAL_MS = 60_000;
const MAP_SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;

function startHistoryTracking(): void {
  recordHeartbeatSnapshot();
  recordMapStatsSnapshot();

  setInterval(() => {
    recordHeartbeatSnapshot();
  }, HEARTBEAT_SNAPSHOT_INTERVAL_MS);

  setInterval(() => {
    recordMapStatsSnapshot();
  }, MAP_SNAPSHOT_INTERVAL_MS);
}

if (!Deno.env.get("DENO_TEST")) {
  startHistoryTracking();
}

export function handler(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/") {
    return serveFile(req, "./site/index.html");
  }

  if (req.method === "GET" && path === "/api") {
    return Response.json({ message: "Hello, world!", time: new Date().toISOString() });
  }

  if (req.method === "GET" && (path === "/styles.css" || path === "/app.js")) {
    const filePath = path === "/styles.css" ? "./site/styles.css" : "./site/app.js";
    return serveFile(req, filePath);
  }

  // --- Heartbeat Routes ---
  if (req.method === "POST" && path === "/api/v1/heartbeat/new") return handleHeartbeatNew(req);
  if (req.method === "POST" && path === "/api/v1/heartbeat/post") return handleHeartbeatPost(req);
  if (req.method === "GET" && path === "/api/v1/heartbeat/status") return handleHeartbeatStatus();
  if (req.method === "GET" && path === "/api/v1/heartbeat/history") return handleHeartbeatHistory(url.searchParams.get("limit"));

  // --- Times / Leaderboard Routes ---
  if (req.method === "POST" && path === "/api/v1/times/new") return handleTimeNew(req);
  if (req.method === "GET" && path.startsWith("/api/v1/times/map/")) return handleMapLeaderboard(path.replace("/api/v1/times/map/", ""));
  if (req.method === "GET" && path.startsWith("/api/v1/times/user/")) return handleUserTimes(path.replace("/api/v1/times/user/", ""));

  // --- Blocks Routes ---
  if (req.method === "POST" && path === "/api/v1/blocks/new") return handleBlockNew(req);
  if (req.method === "GET" && path === "/api/v1/blocks/list") return handleBlockList();
  if (req.method === "GET" && path.startsWith("/api/v1/blocks/get/")) {
    const rawIds = path.replace("/api/v1/blocks/get/", "");
    if (rawIds) return handleBlockGet(rawIds);
  }

  // --- Maps Routes ---
  if (req.method === "POST" && path === "/api/v1/maps/new") return handleMapNew(req);

  if (req.method === "POST" && path.startsWith("/api/v1/maps/view/")) {
    const mapId = path.replace("/api/v1/maps/view/", "");
    if (mapId) return handleMapRecordView(mapId);
  }

  if (req.method === "POST" && path.startsWith("/api/v1/maps/load/")) {
    const mapId = path.replace("/api/v1/maps/load/", "");
    if (mapId) return handleMapRecordLoad(mapId);
  }

  if (req.method === "GET" && path === "/api/v1/maps/search") {
    const query = url.searchParams.get("q") || "";
    return handleMapSearch(query);
  }

  if (req.method === "GET" && path === "/api/v1/maps/home") {
    const sort = url.searchParams.get("sort");
    return handleMapHome(sort);
  }

  if (req.method === "GET" && path === "/api/v1/maps/history") {
    return handleMapHistory(url.searchParams.get("map_id"), url.searchParams.get("limit"));
  }

  if (req.method === "GET" && path.startsWith("/api/v1/maps/history/")) {
    const mapId = path.replace("/api/v1/maps/history/", "");
    if (mapId) return handleMapHistory(mapId);
  }

  if (req.method === "GET" && path.startsWith("/api/v1/maps/get/")) {
    const mapId = path.replace("/api/v1/maps/get/", "");
    if (mapId) return handleMapGet(mapId);
  }

  // 404 Fallback
  return Response.json({ error: "Not Found" }, { status: 404 });
}

if (!Deno.env.get("DENO_TEST")) {
  Deno.serve({ port: 8033 },(req: Request): Promise<Response> | Response => handler(req));
}
