const express = require('express');
const cache = require('./cache');
const {store} = require('./auth');

const router = express.Router();

const ensureAuth = (req, res, next) => {
    const uid = req.headers['x-user-id'];
    if (!uid) return res.sendStatus(401);

    const token = store.get(uid);
    if (!token || token.exp - Date.now() / 1000 < 60) {
        return res.sendStatus(401);
    }

    req.token = token.access;
    next();
};

let initialCacheLoaded = false;

router.get('/cache-status', ensureAuth, async (req, res) => {
    if (!initialCacheLoaded) {
        initialCacheLoaded = true;
        await cache.rebuild(req.token);
    }
    res.json(cache.getCacheStatus());
});

router.get('/latest', ensureAuth, (_req, res) => {
    res.json(cache.getLatest());
});

router.get('/releases/:year', ensureAuth, (req, res) => {
    const data = cache.getReleases(req.params.year);
    if (!data.length) return res.status(404).json({error: 'No data yet'});
    res.json(data);
});

router.get('/playlist/:id', ensureAuth, async (req, res) => {
    try {
        const data = await cache.getPlaylistData(req.params.id, req.token);
        res.json(data);
    } catch (err) {
        console.error('Playlist fetch error:', err.message);
        res.status(500).json({error: err.message});
    }
});

module.exports = {router};
