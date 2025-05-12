const express = require('express');
const {
    startRebuild,
    getCacheStatus,
    getReleases,
    getLatest,
    getPlaylistData
} = require('./cache');

const {store, setCurrentAccess} = require('./auth');

const router = express.Router();

/* ─────────────────  Auth-Middleware ───────────────── */
let firstLoginDone = false;

const ensureAuth = (req, res, next) => {
    const uid = req.headers['x-user-id'];
    if (!uid) return res.sendStatus(401);

    const token = store.get(uid);
    if (!token || token.exp - Date.now() / 1000 < 60) {
        return res.sendStatus(401);
    }

    /* Token global für cache.js bereitstellen */
    setCurrentAccess(token.access);

    /* Cache-Rebuild nur beim ersten eingeloggten Request starten */
    if (!firstLoginDone) {
        firstLoginDone = true;
        startRebuild();
    }

    next();
};

/* ─────────────────  API-Routen  ──────────────────── */
router.get('/cache-status', ensureAuth, (_req, res) => {
    res.json(getCacheStatus());           // sofortige Antwort
});

router.get('/latest', ensureAuth, (_req, res) => {
    const s = getCacheStatus();
    if (s.loading) return res.status(202).json(s);
    res.json(getLatest());
});

router.get('/releases/:year', ensureAuth, (req, res) => {
    const s = getCacheStatus();
    if (s.loading) return res.status(202).json(s);

    const data = getReleases(req.params.year);
    if (!data.length) return res.status(404).json({error: 'No data yet'});
    res.json(data);
});

router.get('/playlist/:id', ensureAuth, async (req, res) => {
    try {
        const data = await getPlaylistData(req.params.id);
        res.json(data);
    } catch {
        res.status(500).json({error: 'fetch_playlist_failed'});
    }
});

module.exports = {router};
