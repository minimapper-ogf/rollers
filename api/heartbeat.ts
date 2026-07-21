// api/heartbeat.ts
import { db } from "../db/client.ts";

const API_KEY = "YOUR_SECRET_API_KEY";

/**
 * Helper: Deletes servers that haven't sent a heartbeat in over 2 minutes (120 seconds)
 */
function cleanupExpiredServers(): void {
    const query = db.prepare(`
    DELETE FROM heartbeats
    WHERE last_heartbeat < datetime('now', '-120 seconds');
    `);
    query.run();
}

function getHeartbeatSummary(): { total_players: number; active_servers: number } {
    cleanupExpiredServers();

    const query = db.prepare(`
    SELECT
        COALESCE(SUM(player_count), 0) AS total_players,
        COUNT(server_id) AS active_servers
    FROM heartbeats;
    `);

    const result = query.get() as { total_players: number; active_servers: number };
    return {
        total_players: result.total_players,
        active_servers: result.active_servers,
    };
}

/**
 * Handles POST /api/v1/heartbeat/new
 */
export async function handleHeartbeatNew(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        if (body.key !== API_KEY) {
            return Response.json({ error: "Unauthorized key" }, { status: 401 });
        }

        // 1. Clean up stale servers first
        cleanupExpiredServers();

        // 2. Check if there are any gaps in server names currently in use
        const activeServers = db.prepare(`SELECT server_id FROM heartbeats`).all() as { server_id: string }[];
        const activeNumbers = new Set(
            activeServers
                .map((s) => parseInt(s.server_id.replace("rollers-", ""), 10))
                .filter((num) => !isNaN(num))
        );

        // 3. Find the lowest available number starting from 1
        let nextNum = 1;
        while (activeNumbers.has(nextNum)) {
            nextNum++;
        }

        const serverId = `rollers-${nextNum}`;

        // 4. Reserve this server ID by inserting a dummy record (or placeholder) in heartbeats
        const reserveQuery = db.prepare(`
        INSERT INTO heartbeats (server_id, player_count, last_heartbeat)
        VALUES (?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(server_id) DO UPDATE SET
        last_heartbeat = CURRENT_TIMESTAMP;
        `);
        reserveQuery.run(serverId);

        return Response.json({
            success: true,
            server_id: serverId,
        });
    } catch {
        return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
}

/**
 * Handles POST /api/v1/heartbeat/post
 */
export async function handleHeartbeatPost(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        const { key, server_id, player_count } = body;

        if (key !== API_KEY) {
            return Response.json({ error: "Unauthorized key" }, { status: 401 });
        }

        if (!server_id || typeof player_count !== "number") {
            return Response.json(
                { error: "Missing or invalid server_id or player_count" },
                { status: 400 }
            );
        }

        // Clean up expired servers before posting new data
        cleanupExpiredServers();

        const query = db.prepare(`
        INSERT INTO heartbeats (server_id, player_count, last_heartbeat)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(server_id) DO UPDATE SET
        player_count = excluded.player_count,
        last_heartbeat = CURRENT_TIMESTAMP;
        `);

        query.run(server_id, player_count);

        return Response.json({ success: true, message: "Heartbeat recorded" });
    } catch {
        return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
}

/**
 * Handles GET /api/v1/heartbeat/status
 */
export function handleHeartbeatStatus(): Response {
    const summary = getHeartbeatSummary();

    return Response.json({
        success: true,
        total_players: summary.total_players,
        active_servers: summary.active_servers,
    });
}

/**
 * Saves a snapshot of the current server/player totals for history tracking.
 */
export function recordHeartbeatSnapshot(): void {
    const summary = getHeartbeatSummary();
    const query = db.prepare(`
    INSERT INTO heartbeat_history (total_players, active_servers)
    VALUES (?, ?);
    `);
    query.run(summary.total_players, summary.active_servers);
}

/**
 * Handles GET /api/v1/heartbeat/history
 */
export function handleHeartbeatHistory(limit: string | null = "100"): Response {
    const parsedLimit = Number.parseInt(limit ?? "100", 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;

    const query = db.prepare(`
    SELECT id, recorded_at, total_players, active_servers
    FROM heartbeat_history
    ORDER BY recorded_at DESC
    LIMIT ?;
    `);

    const history = query.all(safeLimit) as Array<{
        id: number;
        recorded_at: string;
        total_players: number;
        active_servers: number;
    }>;

    return Response.json({
        success: true,
        count: history.length,
        history,
    });
}
