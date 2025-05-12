const express = require('express');
const {startRebuild, getCacheStatus, getReleases, getLatest, getPlaylistData} = require('./cache');
const {setAccessToken} = require('./auth');

const router = express.Router();
const subscriptions = [];

let hasRebuiltOnce = false;

const ensureAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.sendStatus(401);

    setAccessToken(auth.split(' ')[1]);

    if (!hasRebuiltOnce) {
        hasRebuiltOnce = true;
        startRebuild();
    }

    next();
};


router.get('/cache-status', ensureAuth, (_req, res) => {
    res.json(getCacheStatus());
});

router.get('/latest', ensureAuth, (_req, res) => {
    const s = getCacheStatus();
    if (s.loading) return res.status(202).json({loading: true});
    res.json(getLatest());
});

router.get('/releases/:year', ensureAuth, (req, res) => {
    const s = getCacheStatus();
    if (s.loading) return res.status(202).json({loading: true});
    const d = getReleases(req.params.year);
    if (!d.length) return res.status(404).json({error: 'No data yet'});
    res.json(d);
});

router.get('/playlist/:id', ensureAuth, async (req, res) => {
    try {
        res.json(await getPlaylistData(req.params.id));
    } catch {
        res.status(500).json({error: 'fetch_playlist_failed'});
    }
});

router.post('/subscribe', (req, res) => {
    if (!subscriptions.find(s => JSON.stringify(s) === JSON.stringify(req.body))) subscriptions.push(req.body);
    res.status(201).json({success: true});
});

module.exports = {router, subscriptions};
