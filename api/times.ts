// api/times.ts
import { db } from "../db/client.ts";

const API_KEY = "YOUR_SECRET_API_KEY";

/**
 * Helper: Checks if a server name is registered and has sent a heartbeat recently
 */
function isServerValid(serverId: string): boolean {
    const query = db.prepare(`
    SELECT server_id FROM heartbeats
    WHERE server_id = ? AND last_heartbeat >= datetime('now', '-120 seconds');
    `);
    const row = query.get(serverId);
    return !!row;
}

/**
 * Handles POST /api/v1/times/new
 */
export async function handleTimeNew(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        const { key, server_id, user_id, username, map_id, time } = body;

        // 1. Verify API Key
        if (key !== API_KEY) {
            return Response.json({ error: "Unauthorized key" }, { status: 401 });
        }

        // 2. Verify Active Server
        if (!server_id || !isServerValid(server_id)) {
            return Response.json({ error: "Unauthorized or expired server_id" }, { status: 403 });
        }

        // 3. Validate Inputs
        if (!user_id || !username || !map_id || typeof time !== "number") {
            return Response.json({ error: "Missing or invalid payload parameters" }, { status: 400 });
        }

        // 4. Upsert Time Record (Only updates if the new time is faster)
        const upsertQuery = db.prepare(`
        INSERT INTO map_times (server_id, user_id, username, map_id, time_ms, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, map_id) DO UPDATE SET
            time_ms = excluded.time_ms,
            username = excluded.username,
            server_id = excluded.server_id,
            created_at = datetime('now')
        WHERE excluded.time_ms < map_times.time_ms;
        `);

        upsertQuery.run(server_id, String(user_id), username, String(map_id), time);

        return Response.json({ success: true, message: "Time processed successfully" });
    } catch (err) {
        return Response.json({ error: "Invalid JSON payload or internal error" }, { status: 400 });
    }
}

/**
 * Handles GET /api/v1/times/map/:map_id
 */
export function handleMapLeaderboard(mapId: string): Response {
    const query = db.prepare(`
    SELECT user_id, username, time_ms, created_at
    FROM map_times
    WHERE map_id = ?
    ORDER BY time_ms ASC
    LIMIT 100;
    `);

    const leaderboard = query.all(mapId);

    return Response.json({
        success: true,
        map_id: mapId,
        leaderboard: leaderboard,
    });
}

/**
 * Handles GET /api/v1/times/user/:user_id
 */
export function handleUserTimes(userId: string): Response {
    const query = db.prepare(`
    SELECT map_id, time_ms, created_at
    FROM map_times
    WHERE user_id = ?
    ORDER BY created_at DESC;
    `);

    const userTimes = query.all(userId);

    return Response.json({
        success: true,
        user_id: userId,
        times: userTimes,
    });
}
