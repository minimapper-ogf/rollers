// api/maps.ts
import { db } from "../db/client.ts";

const API_KEY = "YOUR_SECRET_API_KEY";

function isServerValid(serverId: string): boolean {
    const query = db.prepare(`
    SELECT server_id FROM heartbeats
    WHERE server_id = ? AND last_heartbeat >= datetime('now', '-120 seconds');
    `);
    return !!query.get(serverId);
}

interface MapBlockPlacement {
    Id: number;
    X: number;
    Y: number;
    Z: number;
    Rotation: number;
}

/**
 * POST /api/v1/maps/new
 */
export async function handleMapNew(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        const {
            key,
            server_id,
            user_id,
            username,
            name,
            description = "",
            gold_time,
            silver_time,
            bronze_time,
            map_data,
        } = body;

        if (key !== API_KEY) {
            return Response.json({ error: "Unauthorized key" }, { status: 401 });
        }

        if (!server_id || !isServerValid(server_id)) {
            return Response.json({ error: "Unauthorized or expired server_id" }, { status: 403 });
        }

        if (
            !user_id ||
            !username ||
            typeof name !== "string" ||
            name.trim().length < 2 ||
            name.trim().length > 48 ||
            typeof username !== "string" ||
            username.length > 64 ||
            typeof description !== "string" ||
            description.length > 280 ||
            !Number.isFinite(Number(gold_time)) ||
            !Number.isFinite(Number(silver_time)) ||
            !Number.isFinite(Number(bronze_time)) ||
            Number(gold_time) <= 0 ||
            Number(gold_time) >= Number(silver_time) ||
            Number(silver_time) >= Number(bronze_time) ||
            !Array.isArray(map_data) ||
            map_data.length < 1 ||
            map_data.length > 500
        ) {
            return Response.json({ error: "Missing or invalid payload fields" }, { status: 400 });
        }

        const validPlacements = map_data.every((placement) =>
            placement !== null &&
            typeof placement === "object" &&
            Number.isInteger(Number(placement.Id)) && Number(placement.Id) > 0 &&
            Number.isInteger(Number(placement.X)) &&
            Number.isInteger(Number(placement.Y)) &&
            Number.isInteger(Number(placement.Z)) &&
            Number.isInteger(Number(placement.Rotation)) &&
            Number(placement.Rotation) >= 0 && Number(placement.Rotation) <= 3
        );

        if (!validPlacements) {
            return Response.json({ error: "Map placements must have a positive block ID, integer grid coordinates, and rotation from 0 to 3" }, { status: 400 });
        }

        const mapDataJson = JSON.stringify(map_data);
        const blockCount = map_data.length;

        const insertQuery = db.prepare(`
        INSERT INTO maps (
            server_id, creator_id, creator_name, name, description,
            gold_time, silver_time, bronze_time, map_data, block_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);

        const info = insertQuery.run(
            server_id,
            String(user_id),
            username,
            name.trim(),
            description,
            Number(gold_time),
            Number(silver_time),
            Number(bronze_time),
            mapDataJson,
            blockCount
        );

        return Response.json({
            success: true,
            map_id: info.lastInsertRowid,
            name: name,
            message: "Map created successfully",
        });
    } catch {
        return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
}

/**
 * GET /api/v1/maps/get/:map_id
 */
export function handleMapGet(mapId: string): Response {
    const query = db.prepare(`
    SELECT m.id, m.name, m.description, m.creator_id, m.creator_name,
    m.gold_time, m.silver_time, m.bronze_time, m.map_data, m.block_count,
    COUNT(DISTINCT v.id) AS total_views,
    COUNT(DISTINCT CASE WHEN v.viewed_at >= datetime('now', '-24 hours') THEN v.id END) AS daily_views,
    COUNT(DISTINCT l.id) AS total_loads,
    COUNT(DISTINCT CASE WHEN l.loaded_at >= datetime('now', '-24 hours') THEN l.id END) AS daily_loads
    FROM maps m
    LEFT JOIN map_views v ON m.id = v.map_id
    LEFT JOIN map_loads l ON m.id = l.map_id
    WHERE m.id = ?
    GROUP BY m.id;
    `);

    const map = query.get(mapId) as any;

    if (!map) {
        return Response.json({ error: "Map not found" }, { status: 404 });
    }

    const parsedMapData: MapBlockPlacement[] = JSON.parse(map.map_data);
    const uniqueBlockIds = Array.from(new Set(parsedMapData.map((item) => item.Id))).sort((a, b) => a - b);

    return Response.json({
        success: true,
        metadata: {
            id: map.id,
            name: map.name,
            description: map.description,
            author: map.creator_name,
            author_id: map.creator_id,
            block_count: map.block_count,
            views: {
                total: map.total_views,
                daily: map.daily_views,
            },
            loads: {
                total: map.total_loads,
                daily: map.daily_loads,
            },
            medals: {
                Gold: map.gold_time,
                Silver: map.silver_time,
                Bronze: map.bronze_time,
            },
        },
        required_block_ids: uniqueBlockIds,
        map_data: parsedMapData,
    });
}

/**
 * POST /api/v1/maps/view/:map_id
 * Logs a menu/page view
 */
export function handleMapRecordView(mapId: string): Response {
    const query = db.prepare(`INSERT INTO map_views (map_id) VALUES (?);`);
    query.run(mapId);
    return Response.json({ success: true, message: "View recorded" });
}

/**
 * POST /api/v1/maps/load/:map_id
 * Logs when a map is actually loaded in-game to be played
 */
export function handleMapRecordLoad(mapId: string): Response {
    const query = db.prepare(`INSERT INTO map_loads (map_id) VALUES (?);`);
    query.run(mapId);
    return Response.json({ success: true, message: "Load recorded" });
}

/**
 * Saves a snapshot of each map's cumulative view/load totals.
 */
export function recordMapStatsSnapshot(): void {
    const mapRows = db.prepare(`SELECT id FROM maps;`).all() as Array<{ id: number }>;

    const insertQuery = db.prepare(`
    INSERT INTO map_history (map_id, total_views, total_loads)
    VALUES (?, ?, ?);
    `);

    for (const map of mapRows) {
        const stats = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM map_views WHERE map_id = ?) AS total_views,
            (SELECT COUNT(*) FROM map_loads WHERE map_id = ?) AS total_loads;
        `).get(map.id, map.id) as { total_views: number; total_loads: number };

        insertQuery.run(map.id, stats.total_views, stats.total_loads);
    }
}

/**
 * GET /api/v1/maps/history/:map_id
 */
export function handleMapHistory(mapId: string | null, limit: string | null = "200"): Response {
    const parsedLimit = Number.parseInt(limit ?? "200", 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200;

    let history;
    if (mapId) {
        history = db.prepare(`
        SELECT id, map_id, recorded_at, total_views, total_loads
        FROM map_history
        WHERE map_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?;
        `).all(mapId, safeLimit) as Array<{
            id: number;
            map_id: number;
            recorded_at: string;
            total_views: number;
            total_loads: number;
        }>;
    } else {
        history = db.prepare(`
        SELECT id, map_id, recorded_at, total_views, total_loads
        FROM map_history
        ORDER BY recorded_at DESC, map_id ASC
        LIMIT ?;
        `).all(safeLimit) as Array<{
            id: number;
            map_id: number;
            recorded_at: string;
            total_views: number;
            total_loads: number;
        }>;
    }

    return Response.json({
        success: true,
        map_id: mapId ? Number(mapId) : null,
        count: history.length,
        history,
    });
}

/**
 * GET /api/v1/maps/search?q=name_query
 */
export function handleMapSearch(searchQuery: string): Response {
    if (!searchQuery) {
        return Response.json({ error: "Search query 'q' parameter missing" }, { status: 400 });
    }

    const query = db.prepare(`
    SELECT m.id, m.name, m.description, m.creator_id, m.creator_name,
    m.block_count, m.created_at,
    COUNT(DISTINCT v.id) AS total_views,
    COUNT(DISTINCT l.id) AS total_loads
    FROM maps m
    LEFT JOIN map_views v ON m.id = v.map_id
    LEFT JOIN map_loads l ON m.id = l.map_id
    WHERE m.name LIKE ?
    GROUP BY m.id
    ORDER BY total_views DESC
    LIMIT 100;
    `);

    const results = query.all(`%${searchQuery}%`);

    return Response.json({
        success: true,
        count: results.length,
        maps: results,
    });
}

/**
 * GET /api/v1/maps/home?sort=trending|views|loads|newest|times|blocks
 */
export function handleMapHome(sortBy: string | null): Response {
    let orderByClause = "COUNT(DISTINCT v.id) DESC";

    if (sortBy === "trending") {
        orderByClause = "COUNT(DISTINCT CASE WHEN v.viewed_at >= datetime('now', '-24 hours') THEN v.id END) DESC";
    } else if (sortBy === "loads") {
        orderByClause = "COUNT(DISTINCT l.id) DESC";
    } else if (sortBy === "newest") {
        orderByClause = "m.created_at DESC";
    } else if (sortBy === "times") {
        orderByClause = "(SELECT COUNT(*) FROM map_times t WHERE t.map_id = CAST(m.id AS TEXT)) DESC";
    } else if (sortBy === "blocks") {
        orderByClause = "m.block_count DESC";
    }

    const query = db.prepare(`
    SELECT m.id, m.name, m.description, m.creator_id, m.creator_name,
    m.block_count, m.created_at,
    COUNT(DISTINCT v.id) AS total_views,
    COUNT(DISTINCT CASE WHEN v.viewed_at >= datetime('now', '-24 hours') THEN v.id END) AS daily_views,
    COUNT(DISTINCT l.id) AS total_loads,
    COUNT(DISTINCT CASE WHEN l.loaded_at >= datetime('now', '-24 hours') THEN l.id END) AS daily_loads,
    (SELECT COUNT(*) FROM map_times t WHERE t.map_id = CAST(m.id AS TEXT)) AS total_times_set
    FROM maps m
    LEFT JOIN map_views v ON m.id = v.map_id
    LEFT JOIN map_loads l ON m.id = l.map_id
    GROUP BY m.id
    ORDER BY ${orderByClause}
    LIMIT 50;
    `);

    const results = query.all();

    return Response.json({
        success: true,
        sort: sortBy || "views",
        maps: results,
    });
}
