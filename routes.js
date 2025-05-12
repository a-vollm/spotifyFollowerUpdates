const express = require('express');
const {
    getCacheStatus,
    getReleases,
    getLatest,
    getPlaylistData
} = require('./cache');
const {setAccessToken} = require('./auth');

const router = express.Router();
const subscriptions = [];

/* Middleware: prüft Bearer-Header und legt ihn global ab */
const ensureAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.sendStatus(401);
    setAccessToken(auth.split(' ')[1]);
    next();
};

/* ---------- API ---------- */
router.get('/cache-status', ensureAuth, (_req, res) => {
    res.json(getCacheStatus());
});

router.get('/latest', ensureAuth, (_req, res) => {
    const stat = getCacheStatus();
    if (stat.loading) return res.status(202).json({loading: true});
    res.json(getLatest());
});

router.get('/releases/:year', ensureAuth, (req, res) => {
    const stat = getCacheStatus();
    if (stat.loading) return res.status(202).json({loading: true});
    const data = getReleases(req.params.year);
    if (!data.length) return res.status(404).json({error: 'No data yet'});
    res.json(data);
});

router.get('/playlist/:id', ensureAuth, async (req, res) => {
    try {
        const playlist = await getPlaylistData(req.params.id);
        res.json(playlist);
    } catch {
        res.status(500).json({error: 'fetch_playlist_failed'});
    }
});

/* Push-Sub */
router.post('/subscribe', (req, res) => {
    if (!subscriptions.find(s => JSON.stringify(s) === JSON.stringify(req.body)))
        subscriptions.push(req.body);
    res.status(201).json({success: true});
});

module.exports = {router, subscriptions};
