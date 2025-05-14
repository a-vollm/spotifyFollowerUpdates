const {Pool} = require('pg');
const dns = require('dns').promises;

let pool;
let poolInitialized = false;

async function initializePool() {
    if (poolInitialized) return;

    const {address} = await dns.lookup('db.nnojnnqlolbqovvoetfh.supabase.co', {family: 4});

    pool = new Pool({
        user: 'postgres',
        password: process.env.DATABASE_PASSWORD,
        host: address,
        database: 'postgres',
        port: 5432,
        ssl: {
            rejectUnauthorized: false,
            servername: 'db.nnojnnqlolbqovvoetfh.supabase.co'
        },
        connectionTimeoutMillis: 10000
    });

    poolInitialized = true;
    console.log('✅ Pool erfolgreich aufgebaut mit:', address);
}


// CRUD-Funktionen
exports.get = async (uid) => {
    await initializePool();
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
