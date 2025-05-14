const {Pool} = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,     // ← nur noch die URI
    ssl: {rejectUnauthorized: false},              // Render verlangt das
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
    await pool.query(
        `INSERT INTO tokens (uid, access, refresh, exp)
         VALUES ($1, $2, $3, $4) ON CONFLICT (uid) DO
        UPDATE
            SET access = EXCLUDED.access,
            refresh = EXCLUDED.refresh,
            exp = EXCLUDED.exp,
            updated_at = CURRENT_TIMESTAMP`,
        [uid, t.access, t.refresh, t.exp]
    );
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
