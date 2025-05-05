// router.js
const express = require('express');
const passport = require('passport');
const { getCacheStatus, getReleases, getLatest } = require('./cache');
const router = express.Router();

let spotifyTokens = { access: null, refresh: null };

router.get('/auth/spotify',
    passport.authenticate('spotify', { scope: ['user-read-private','user-read-email'] })
);

router.get('/auth/spotify/callback',
    passport.authenticate('spotify', { failureRedirect: '/' }),
    (req, res) => {
        spotifyTokens.access = req.user.accessToken;
        spotifyTokens.refresh = req.user.refreshToken;
        res.redirect('/callback');
    }
);

router.get('/callback', (req, res) => {
    res.sendStatus(200);
});

const ensureAuth = (req, res, next) => {
    if (spotifyTokens.access) return next();
    res.sendStatus(401);
};

router.get('/cache-status', ensureAuth, (req, res) => res.json(getCacheStatus(spotifyTokens)));
router.get('/releases/:year', ensureAuth, (req, res) => res.json(getReleases(req.params.year, spotifyTokens)));
router.get('/latest', ensureAuth, (req, res) => res.json(getLatest(spotifyTokens)));

module.exports = router;
