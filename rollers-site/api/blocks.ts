// api/blocks.ts
import { db } from "../db/client.ts";

const API_KEY = "YOUR_SECRET_API_KEY";

function isServerValid(serverId: string): boolean {
    const query = db.prepare(`
    SELECT server_id FROM heartbeats
    WHERE server_id = ? AND last_heartbeat >= datetime('now', '-120 seconds');
    `);
    return !!query.get(serverId);
}

/**
 * POST /api/v1/blocks/new
 * Accepts payload:
 * {
 * "key": "...",
 * "server_id": "...",
 * "user_id": "...",
 * "username": "...",
 * "name": "Ramp",
 * "objects": [ { "Type": "Block", ... }, { "Type": "Ramp", ... } ]
 * }
 */
export async function handleBlockNew(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        const { key, server_id, user_id, username, name, objects } = body;

        // 1. Validations
        if (key !== API_KEY) {
            return Response.json({ error: "Unauthorized key" }, { status: 401 });
        }

        if (!server_id || !isServerValid(server_id)) {
            return Response.json({ error: "Unauthorized or expired server_id" }, { status: 403 });
        }

        if (!user_id || !username || !name || !Array.isArray(objects)) {
            return Response.json({ error: "Missing or invalid payload fields" }, { status: 400 });
        }

        // 2. Convert objects array to JSON string for SQLite storage
        const instructionsJson = JSON.stringify(objects);

        // 3. Insert into Database
        const insertQuery = db.prepare(`
        INSERT INTO blocks (server_id, creator_id, creator_name, name, instructions)
        VALUES (?, ?, ?, ?, ?);
        `);

        const info = insertQuery.run(
            server_id,
            String(user_id),
                                     username,
                                     name,
                                     instructionsJson
        );

        return Response.json({
            success: true,
            block_id: info.lastInsertRowid,
            name: name,
            message: "Block created successfully",
        });
    } catch {
        return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
}

/**
 * GET /api/v1/blocks/get/:ids
 * Accepts single ID ("1") or comma-separated IDs ("1,2,3,4,5,6")
 */
export function handleBlockGet(rawIds: string): Response {
    // 1. Split string by comma and filter out invalid/empty numbers
    const ids = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "" && !isNaN(Number(id)));

    if (ids.length === 0) {
        return Response.json({ error: "No valid block IDs provided" }, { status: 400 });
    }

    // 2. Build SQL dynamically for the IN clause: "SELECT ... WHERE id IN (?, ?, ?)"
    const placeholders = ids.map(() => "?").join(",");
    const query = db.prepare(`
    SELECT id, name, creator_id, creator_name, instructions
    FROM blocks
    WHERE id IN (${placeholders});
    `);

    const rows = query.all(...ids) as {
        id: number;
        name: string;
        creator_id: string;
        creator_name: string;
        instructions: string;
    }[];

    // 3. Format result as a key-value dictionary or list for the Lua client
    const blocksMap: Record<number, object> = {};

    for (const row of rows) {
        blocksMap[row.id] = {
            id: row.id,
            name: row.name,
            creator_id: row.creator_id,
            creator_name: row.creator_name,
            objects: JSON.parse(row.instructions), // Parse raw JSON back into array
        };
    }

    return Response.json({
        success: true,
        count: rows.length,
        blocks: blocksMap,
    });
}

/**
 * GET /api/v1/blocks/list
 * Returns all available blocks (useful when server starts up)
 */
export function handleBlockList(): Response {
    const query = db.prepare(`SELECT id, name, creator_name FROM blocks;`);
    const blocks = query.all();

    return Response.json({
        success: true,
        blocks: blocks,
    });
}
