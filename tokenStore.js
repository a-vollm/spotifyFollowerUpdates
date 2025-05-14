// tokenStore.js  – IPv4-Safe  Version
const {Pool} = require('pg');
const {URL} = require('url');

const dbUrl = new URL(process.env.DATABASE_URL);

const pool = new Pool({
    user: dbUrl.username,
    password: dbUrl.password,
    host: dbUrl.hostname,      //  → pg nutzt jetzt DNS-A Record
    database: dbUrl.pathname.slice(1),
    port: Number(dbUrl.port) || 5432,
    ssl: {rejectUnauthorized: false},
    family: 4,                   // IPv4 erzwingen
    connectionTimeoutMillis: 5000
});

/* ---------- CRUD-Funktionen ---------- */
exports.get = async (uid) => {
    const {rows} = await pool.query(
        'SELECT access, refresh, exp FROM tokens WHERE uid=$1', [uid]
    );
    return rows[0] || null;
};

exports.set = async (uid, t) => {
    await pool.query(`
        INSERT INTO tokens (uid, access, refresh, exp)
        VALUES ($1, $2, $3, $4) ON CONFLICT (uid)
      DO
        UPDATE SET access = EXCLUDED.access,
            refresh = EXCLUDED.refresh,
            exp = EXCLUDED.exp,
            updated_at = CURRENT_TIMESTAMP
    `, [uid, t.access, t.refresh, t.exp]);
};

exports.delete = (uid) =>
    pool.query('DELETE FROM tokens WHERE uid=$1', [uid]);

exports.all = async () => {
    const {rows} = await pool.query('SELECT uid, access, refresh, exp FROM tokens');
    return Object.fromEntries(rows.map(r => [r.uid, {
        access: r.access,
        refresh: r.refresh,
        exp: r.exp
    }]));
};
