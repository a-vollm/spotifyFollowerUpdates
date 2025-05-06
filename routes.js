const express = require('express')
const {getCacheStatus, getReleases, getLatest, getPlaylistData, getSpotifyUser} = require('./cache')
const {ensureAccess} = require('./auth')
const router = express.Router()

const ensureAuth = (req, res, next) => {
    try {
        ensureAccess();
        next()
    } catch {
        res.sendStatus(401)
    }
}

router.get('/cache-status', ensureAuth, (req, res) => res.json(getCacheStatus()))
router.get('/releases/:year', ensureAuth, (req, res) => res.json(getReleases(req.params.year)))
router.get('/latest', ensureAuth, (req, res) => res.json(getLatest()))
router.get('/playlist/:id', ensureAuth, async (req, res) => {
    const playlistId = req.params.id;
    try {
        const playlist = await getPlaylistData(playlistId);
        res.json(playlist);
    } catch (err) {
        res.status(500).send({error: 'Failed to fetch playlist data'});
    }
});

router.post('/map-usernames', ensureAuth, async (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids)) return res.status(400).json({error: 'ids must be an array'});

    const unique = [...new Set(ids)];
    const results = {};

    for (const id of unique) {
        try {
            const user = await getSpotifyUser(id);
            results[id] = user.display_name;
        } catch {
            results[id] = null;
        }
    }

    res.json(results);
});

module.exports = router
