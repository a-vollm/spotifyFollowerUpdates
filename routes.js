const express = require('express');
const {rebuild, getCacheStatus, getReleases, getLatest, getPlaylistData} = require('./cache');
const router = express.Router();
const subscriptions = [];

// Authorization via Bearer‐Header (gesetzt über Interceptor im Frontend)
const {setAccessToken} = require('./auth');

const ensureAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.sendStatus(401);
    const token = auth.split(' ')[1];
    setAccessToken(token);          // ⬅️ Token für cache.js speichern
    next();
};


// Cache-Status
router.get('/cache-status', ensureAuth, (req, res) => {
    res.json(getCacheStatus());
});

// Neueste Releases (max 20)
router.get('/latest', ensureAuth, (req, res) => {
    const stat = getCacheStatus();
    if (stat.loading) return res.status(202).json({loading: true});
    res.json(getLatest());
});

// Releases gruppiert nach Monat für bestimmtes Jahr
router.get('/releases/:year', ensureAuth, (req, res) => {
    const stat = getCacheStatus();
    if (stat.loading) return res.status(202).json({loading: true});
    const data = getReleases(req.params.year);
    if (!data || data.length === 0) return res.status(404).json({error: 'No data yet'});
    res.json(data);
});

// Playlist inkl. aller Tracks
router.get('/playlist/:id', ensureAuth, async (req, res) => {
    try {
        const playlist = await getPlaylistData(req.params.id);
        res.json(playlist);
    } catch (e) {
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
