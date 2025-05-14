const {Pool} = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false}
});

exports.get = async (uid) => {
    const res = await pool.query('SELECT * FROM tokens WHERE uid = $1', [uid]);
    return res.rows[0] || null;
};

exports.set = async (uid, token) => {
    await pool.query(`
        INSERT INTO tokens (uid, access, refresh, exp)
        VALUES ($1, $2, $3, $4) ON CONFLICT (uid)
    DO
        UPDATE SET access = EXCLUDED.access, refresh = EXCLUDED.refresh, exp = EXCLUDED.exp, updated_at = CURRENT_TIMESTAMP
    `, [uid, token.access, token.refresh, token.exp]);
};

exports.delete = async (uid) => {
    await pool.query('DELETE FROM tokens WHERE uid = $1', [uid]);
};

exports.all = async () => {
    const res = await pool.query('SELECT * FROM tokens');
    return Object.fromEntries(
        res.rows.map(row => [row.uid, {
            access: row.access,
            refresh: row.refresh,
            exp: row.exp
        }])
    );
};
