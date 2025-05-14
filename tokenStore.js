const {Pool} = require('pg');
const dns = require('dns');

// Force IPv4 for all DNS lookups
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString: `postgres://postgres:${process.env.DATABASE_PASSWORD}@db.nnojnnqlolbqovvoetfh.supabase.co:5432/postgres`,
    ssl: {
        rejectUnauthorized: false,
        servername: 'db.nnojnnqlolbqovvoetfh.supabase.co'
    },
    connectionTimeoutMillis: 10000,
    // Force IPv4 for TCP connections
    lookup: (host, options, callback) =>
        dns.lookup(host, {family: 4}, callback)
});

// Keep your existing CRUD functions unchanged
exports.get = async (uid) => {
    const {rows} = await pool.query('SELECT access, refresh, exp FROM tokens WHERE uid=$1', [uid]);
    return rows[0] || null;
};

exports.set = async (uid, t) => {
    await initializePool();
    await pool.query(`
        INSERT INTO tokens (uid, access, refresh, exp)
        VALUES ($1, $2, $3, $4) ON CONFLICT (uid)
      DO
        UPDATE SET access=EXCLUDED.access,
            refresh=EXCLUDED.refresh,
            exp=EXCLUDED.exp,
            updated_at= CURRENT_TIMESTAMP
    `, [uid, t.access, t.refresh, t.exp]);
};

exports.delete = async (uid) => {
    await initializePool();
    await pool.query('DELETE FROM tokens WHERE uid=$1', [uid]);
};

exports.all = async () => {
    await initializePool();
    const {rows} = await pool.query('SELECT uid, access, refresh, exp FROM tokens');
    return Object.fromEntries(rows.map(r => [r.uid, {
        access: r.access,
        refresh: r.refresh,
        exp: r.exp
    }]));
};
