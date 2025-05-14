const {Pool} = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false},
    connectionTimeoutMillis: 5000,
    family: 4              // ⬅️  IPv4 only – verhindert ENETUNREACH
});

exports.get = async (uid) => {
    const {rows} = await pool.query('SELECT * FROM tokens WHERE uid = $1', [uid]);
    return rows[0] || null;
};

exports.set = async (uid, t) => {
    await pool.query(`
        INSERT INTO tokens (uid, access, refresh, exp)
        VALUES ($1, $2, $3, $4) ON CONFLICT (uid)
      DO
        UPDATE SET access=EXCLUDED.access,
            refresh=EXCLUDED.refresh,
            exp=EXCLUDED.exp,
            updated_at = CURRENT_TIMESTAMP
    `, [uid, t.access, t.refresh, t.exp]);
};

exports.delete = (uid) =>
    pool.query('DELETE FROM tokens WHERE uid=$1', [uid]);

exports.all = async () => {
    const {rows} = await pool.query('SELECT * FROM tokens');
    return Object.fromEntries(
        rows.map(r => [r.uid, {access: r.access, refresh: r.refresh, exp: r.exp}])
    );
};
