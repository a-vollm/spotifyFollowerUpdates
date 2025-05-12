const express = require('express');
const router = express.Router();
const {ensureAuth} = require('./auth');
const {getCacheStatus, getLatest, getPlaylistData, getReleasesByYear} = require('./cache');

// Cache-Status
router.get('/cache-status', ensureAuth, (req, res) => {
    const status = getCacheStatus();
    res.json(status);
});

// Neueste Releases
router.get('/latest', ensureAuth, (req, res) => {
    const status = getCacheStatus();
    if (status.loading) return res.status(202).json({loading: true});
    res.json(getLatest());
});

// Playlist-Daten
router.get('/playlist/:id', ensureAuth, async (req, res) => {
    try {
        const playlist = await getPlaylistData(req.params.id);
        res.json(playlist);
    } catch (err) {
        res.status(500).json({error: 'fetch_playlist_failed'});
    }
});

// Releases nach Jahr
router.get('/releases/:year', ensureAuth, async (req, res) => {
    try {
        const year = req.params.year;
        const data = await getReleasesByYear(year);
        res.json(data);
    } catch (err) {
        res.status(500).json({error: 'fetch_releases_failed'});
    }
});

module.exports = router;
