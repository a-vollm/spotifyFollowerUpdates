const express = require('express');
const {startRebuild, getCacheStatus, getReleases, getLatest, getPlaylistData} = require('./cache');
const {store} = require('./auth');

const router = express.Router();

const ensureAuth = (req, res, next) => {
    const uid = req.headers['x-user-id'];
    if (!uid) return res.sendStatus(401);

    const tokenData = store.get(uid);
    if (!tokenData || tokenData.exp - Date.now() / 1000 < 60) return res.sendStatus(401);

    req.token = tokenData.access;
    startRebuild();
    next();
};

router.get('/cache-status', ensureAuth, (_req, res) => {
    res.json(getCacheStatus());
});

router.get('/latest', ensureAuth, (_req, res) => {
    const status = getCacheStatus();
    if (status.loading) return res.status(202).json({loading: true});
    res.json(getLatest());
});

router.get('/releases/:year', ensureAuth, (req, res) => {
    const status = getCacheStatus();
    if (status.loading) return res.status(202).json({loading: true});

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
