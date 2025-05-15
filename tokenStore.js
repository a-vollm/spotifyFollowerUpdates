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

exports.setPlaylistCache = async (playlistId, uid, trackIds) => {
    await pool.query(`
        INSERT INTO playlist_cache (playlist_id, uid, track_ids)
        VALUES ($1, $2, $3) ON CONFLICT (playlist_id, uid) DO
        UPDATE
            SET track_ids = EXCLUDED.track_ids
    `, [playlistId, uid, trackIds]);
};


exports.getPlaylistCache = async (playlistId, uid) => {
    const {rows} = await pool.query(
        'SELECT track_ids FROM playlist_cache WHERE playlist_id = $1 AND uid = $2',
        [playlistId, uid]
    );
    return new Set(rows[0]?.track_ids ?? []);
};

exports.getPlaylistCache = async (playlistId, uid) => {
    const {rows} = await pool.query(
        'SELECT track_ids FROM playlist_cache WHERE playlist_id = $1 AND uid = $2',
        [playlistId, uid]
    );
    return new Set(rows[0]?.track_ids ?? []);
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

// hole alle Subscriptions
exports.getAllSubscriptions = async () => {
    const {rows} = await pool.query('SELECT uid, subscription FROM subscriptions');
    return rows.map(r => ({
        uid: r.uid,
        subscription: r.subscription
    }));
};

// neue Subscription hinzufügen (verhindert Duplikate)
exports.addSubscription = async (uid, subscription) => {
    await pool.query(`
        INSERT INTO subscriptions (uid, subscription)
        VALUES ($1, $2) ON CONFLICT DO NOTHING
    `, [uid, subscription]);
};

// optional: Subscription löschen (z.B. wenn Push fehlschlägt)
exports.removeSubscription = async (uid, subscription) => {
    await pool.query(`
        DELETE
        FROM subscriptions
        WHERE uid = $1
          AND subscription = $2
    `, [uid, subscription]);
};

exports.removeAllSubscriptions = async (uid) => {
    await pool.query('DELETE FROM subscriptions WHERE uid = $1', [uid]);
};

// Neue Funktion, die alte Subscriptions ersetzt (vorhandene löschen + neue hinzufügen)
exports.replaceSubscription = async (uid, newSub) => {
    await this.removeAllSubscriptions(uid);
    await this.addSubscription(uid, newSub);
};

exports.delete = uid => pool.query('DELETE FROM tokens WHERE uid=$1', [uid]);

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
