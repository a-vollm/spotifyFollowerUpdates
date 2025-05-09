const express = require('express');
const {rebuild, getCacheStatus, getReleases, getLatest, getPlaylistData} = require('./cache');
const router = express.Router();
const subscriptions = [];

// Authorization via Bearer‐Header
const ensureAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.sendStatus(401);
    req.access_token = auth.split(' ')[1];
    next();
};

// Cache-Status
router.get('/cache-status', ensureAuth, (req, res) => {
    res.json(getCacheStatus());
});

// Releases nach Jahr
router.get('/releases/:year', ensureAuth, (req, res) => {
    const stat = getCacheStatus();
    if (stat.loading) return res.status(202).json({loading: true});
    const data = getReleases(req.params.year);
    if (!data || data.length === 0) return res.status(404).json({error: 'No data yet'});
    res.json(data);
});

// Neueste Releases
router.get('/latest', ensureAuth, (req, res) => {
    const stat = getCacheStatus();
    if (stat.loading) return res.status(202).json({loading: true});
    res.json(getLatest(req.access_token));
});

// Playlist-Details
router.get('/playlist/:id', ensureAuth, async (req, res) => {
    try {
        const playlist = await getPlaylistData(req.params.id, req.access_token);
        res.json(getLatest());
    } catch {
        res.status(500).json({error: 'fetch_playlist_failed'});
    }
});

// Push-Subscription speichern
router.post('/subscribe', (req, res) => {
    const sub = req.body;
    if (!subscriptions.some(s => JSON.stringify(s) === JSON.stringify(sub))) {
        subscriptions.push(sub);
    }
    res.status(201).json({success: true});
});

module.exports = {router, subscriptions};
