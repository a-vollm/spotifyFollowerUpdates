const {Pool} = require('pg');
const dns = require('dns').promises;

// Hardcoded IPv4 address from Supabase (REPLACE WITH YOUR ACTUAL IPv4)
const SUPABASE_IPV4 = 'YOUR_SUPABASE_IPv4_ADDRESS'; // Get this from Supabase dashboard
const DB_HOST = 'db.nnojnnqlolbqovvoetfh.supabase.co';

let pool;

async function verifyIPv4() {
    try {
        // Verify DNS records
        const [v4Addrs, v6Addrs] = await Promise.all([
            dns.resolve4(DB_HOST).catch(() => []),
            dns.resolve6(DB_HOST).catch(() => [])
        ]);

        console.log('DNS Verification:');
        console.log(`IPv4 Addresses: ${v4Addrs.join(', ') || 'None'}`);
        console.log(`IPv6 Addresses: ${v6Addrs.join(', ') || 'None'}`);

        if (v4Addrs.length === 0) {
            throw new Error('No IPv4 DNS records found. Contact Supabase support.');
        }

        return v4Addrs[0];
    } catch (error) {
        console.error('DNS verification failed:', error);
        console.log('Falling back to hardcoded IPv4:', SUPABASE_IPV4);
        return SUPABASE_IPV4;
    }
}

async function initializePool() {
    const ipv4 = await verifyIPv4();

    pool = new Pool({
        host: ipv4,
        user: 'postgres',
        password: process.env.DATABASE_PASSWORD,
        database: 'postgres',
        port: 5432,
        ssl: {
            rejectUnauthorized: false,
            servername: DB_HOST // Maintain TLS SNI
        },
        connectionTimeoutMillis: 10000,
        // Final enforcement
        lookup: (host, options, callback) => {
            dns.lookup(host, {family: 4}, (err, address) => {
                if (err) return callback(err);
                console.log(`DNS lookup result: ${address}`);
                callback(null, address, 4);
            });
        }
    });

    // Test connection
    try {
        const client = await pool.connect();
        client.release();
        console.log('Successfully connected to database via IPv4');
    } catch (error) {
        console.error('Connection test failed:', error);
        process.exit(1);
    }
}

// Initialize immediately
initializePool();

// CRUD functions with connection check
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
