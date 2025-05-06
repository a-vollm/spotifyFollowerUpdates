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

router.get('/map-username/:id', ensureAuth, async (req, res) => {
    const userId = req.params.id;
    try {
        const user = await getSpotifyUser(userId);
        res.json(user);
    } catch (error) {
        res.status(500).send('Error fetching user data from Spotify');
    }
});

module.exports = router
