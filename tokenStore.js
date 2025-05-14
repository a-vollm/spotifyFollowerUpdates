const {Pool} = require('pg');
const dns = require('dns').promises;
const {setTimeout} = require('timers/promises');

let pool;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function resolveHost() {
    try {
        // First try explicit IPv4 resolution
        const ips = await dns.resolve4('db.nnojnnqlolbqovvoetfh.supabase.co');
        return ips[0];
    } catch (error) {
        // Fallback to OS resolution with IPv4 priority
        dns.setDefaultResultOrder('ipv4first');
        const lookup = await dns.lookup('db.nnojnnqlolbqovvoetfh.supabase.co');
        return lookup.address;
    }
}

async function createPool(retries = MAX_RETRIES) {
    try {
        const host = await resolveHost();
        console.log(`Using database host: ${host}`);

        return new Pool({
            host,
            user: 'postgres',
            password: process.env.DATABASE_PASSWORD,
            database: 'postgres',
            port: 5432,
            ssl: {
                rejectUnauthorized: false,
                servername: 'db.nnojnnqlolbqovvoetfh.supabase.co'
            },
            connectionTimeoutMillis: 10000,
            // Final enforcement at TCP layer
            lookup: (host, options, callback) =>
                dns.lookup(host, {family: 4}, callback)
        });
    } catch (error) {
        if (retries > 0) {
            console.log(`Retrying connection... (${retries} left)`);
            await setTimeout(RETRY_DELAY);
            return createPool(retries - 1);
        }
        throw new Error(`Database connection failed: ${error.message}`);
    }
}

// Initialize connection immediately
createPool().then(p => {
    pool = p;
    console.log('Database connection established');
}).catch(error => {
    console.error('Fatal database error:', error);
    process.exit(1);
});

// Unified query handler with connection check
async function query(sql, params) {
    if (!pool) {
        console.log('No active pool - reinitializing');
        pool = await createPool();
    }
    return pool.query(sql, params);
}

// CRUD functions using unified handler
exports.get = async (uid) => {
    const {rows} = await query('SELECT access, refresh, exp FROM tokens WHERE uid=$1', [uid]);
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
