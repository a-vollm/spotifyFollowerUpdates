const {Pool} = require('pg');
const dns = require('dns').promises;

// 1. IPv4 einmalig auflösen
async function getIPv4() {
    const {address} = await dns.lookup(
        'db.nnojnnqlolbqovvoetfh.supabase.co',
        {family: 4}
    );
    return address;            // z. B. 34.159.123.45
}

let pool;

(async () => {
    const ipv4 = await getIPv4();
    console.log('Supabase IPv4:', ipv4);

    pool = new Pool({
        host: ipv4,               // 2.  ► direkte IP
        port: 5432,
        user: 'postgres',
        password: process.env.DATABASE_PASSWORD,
        database: 'postgres',
        ssl: {
            rejectUnauthorized: false,
            servername: 'db.nnojnnqlolbqovvoetfh.supabase.co'
        } // SNI für TLS
    });

    // Test-Query
    await pool.query('SELECT 1');
    console.log('DB ready via IPv4');
})().catch(err => {
    console.error('Fatal DB init error:', err);
    process.exit(1);
});

/* ---------- CRUD ---------- */

exports.get = async uid => {
    const {rows} = await pool.query(
        'SELECT access, refresh, exp FROM tokens WHERE uid=$1', [uid]
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
        'SELECT uid,access,refresh,exp FROM tokens'
    );
    return Object.fromEntries(rows.map(r => [r.uid,
        {access: r.access, refresh: r.refresh, exp: r.exp}]));
};
