const {Pool} = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false},
    connectionTimeoutMillis: 10_000
});

/* ---------- CRUD ---------- */
exports.get = async uid => {
    const {rows} = await pool.query(
        'SELECT access, refresh, exp FROM tokens WHERE uid=$1',
        [uid]
    );
    return rows[0] ?? null;
};

exports.set = async (uid, t) => {
    const exp = Math.floor(t.exp); // PostgreSQL erwartet BIGINT
    await pool.query(`
        INSERT INTO tokens (uid, access, refresh, exp)
        VALUES ($1, $2, $3, $4) ON CONFLICT (uid) DO
        UPDATE
            SET access = EXCLUDED.access,
            refresh = EXCLUDED.refresh,
            exp = EXCLUDED.exp,
            updated_at = CURRENT_TIMESTAMP
    `, [uid, t.access, t.refresh, exp]);
};

exports.getPlaylistCache = async (playlistId) => {
    const {rows} = await pool.query(
        'SELECT track_ids FROM playlist_cache WHERE playlist_id = $1',
        [playlistId]
    );
    return new Set(rows[0]?.track_ids ?? []);
};

exports.setPlaylistCache = async (playlistId, trackIds) => {
    await pool.query(`
        INSERT INTO playlist_cache (playlist_id, track_ids)
        VALUES ($1, $2) ON CONFLICT (playlist_id) DO
        UPDATE
            SET track_ids = EXCLUDED.track_ids
    `, [playlistId, trackIds]);
};

exports.getReleaseCache = async (uid) => {
    const {rows} = await pool.query(
        'SELECT id FROM release_cache WHERE uid=$1', [uid]
    );
    return new Set(rows.map(r => r.id));
};

exports.setReleaseCache = async (uid, ids) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM release_cache WHERE uid=$1', [uid]);
        for (const id of ids) {
            await client.query(
                'INSERT INTO release_cache (uid, id) VALUES ($1, $2)', [uid, id]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};


exports.delete = uid =>
    pool.query('DELETE FROM tokens WHERE uid=$1', [uid]);

exports.all = async () => {
    const {rows} = await pool.query(
        'SELECT uid, access, refresh, exp FROM tokens'
    );
    return Object.fromEntries(rows.map(r => [r.uid, {
        access: r.access,
        refresh: r.refresh,
        exp: r.exp
    }]));
};
