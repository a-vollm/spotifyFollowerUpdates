const express = require('express')
const {getCacheStatus, getReleases, getLatest, getPlaylistData} = require('./cache')
const {ensureAccess} = require('./auth')
const router = express.Router()
const subscriptions = [];

const ensureAuth = (req, res, next) => {
    const sessionId = req.cookies.sessionId;

    if (!sessionId) return res.sendStatus(401);

    const session = sessions.get(sessionId);
    if (!session || Date.now() >= session.expires_at) {
        res.clearCookie('sessionId');
        return res.sendStatus(401);
    }

    // Token an Request hängen
    req.access_token = session.access_token;
    next();
};

router.get('/cache-status', ensureAuth, (req, res) => res.json(getCacheStatus()))
router.get('/releases/:year', ensureAuth, (req, res) => {
    const status = getCacheStatus();
    if (status.loading) {
        return res.status(202).json({loading: true});
    }

    const data = getReleases(req.params.year);
    if (!data || data.length === 0) {
        return res.status(404).json({error: 'No data yet'});
    }

    res.json(data);
});

router.get('/latest', ensureAuth, (req, res) => {
    const status = getCacheStatus();
    if (status.loading) {
        return res.status(202).json({loading: true});
    }
    res.json(getLatest());
});

router.get('/playlist/:id', ensureAuth, async (req, res) => {
    const playlistId = req.params.id;
    try {
        const playlist = await getPlaylistData(playlistId);
        res.json(playlist);
    } catch (err) {
        res.status(500).send({error: 'Failed to fetch playlist data'});
    }
});

router.post('/subscribe', express.json(), (req, res) => {
    const sub = req.body;
    const alreadyExists = subscriptions.some(s => JSON.stringify(s) === JSON.stringify(sub));
    if (!alreadyExists) subscriptions.push(sub);
    res.status(201).json({success: true});
});

module.exports = {
    router,
    subscriptions
};
