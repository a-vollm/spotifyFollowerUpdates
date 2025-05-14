const express = require('express');
const cache = require('./cache');
const {store} = require('./auth');
const axios = require('axios');
const qs = require('querystring');
const router = express.Router();
const subscriptions = [];

const ensureAuth = async (req, res, next) => {
    const uid = req.headers['x-user-id'];
    if (!uid) return res.status(401).json({error: 'no_uid'});

    let token = await store.get(uid);
    const now = Date.now() / 1000;

    if (!token || !token.access) {
        console.warn(`⚠️ Kein Token vorhanden für ${uid}`);
        return res.status(401).json({error: 'token_missing'});
    }

    if (token.exp - now < 30) {
        try {
            const resToken = await axios.post(
                'https://accounts.spotify.com/api/token',
                qs.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: token.refresh
                }),
                {
                    headers: {
                        Authorization: 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            token.access = resToken.data.access_token;
            token.exp = now + resToken.data.expires_in;

            if (resToken.data.refresh_token) {
                token.refresh = resToken.data.refresh_token;
            }

            store.set(uid, token);
            console.log(`🔁 Token direkt erneuert für ${uid}`);
        } catch (err) {
            console.error(`❌ Direkter Refresh fehlgeschlagen für ${uid}:`, err.message);
            return res.status(401).json({error: 'refresh_failed'});
        }
    }

    req.uid = uid;
    req.token = token.access;
    next();
};

router.get('/cache-status', ensureAuth, async (req, res) => {
    const uid = req.uid;
    const token = req.token;
    const st = cache.getCacheStatus(uid);

    if (!st.loading && st.totalArtists === 0 && st.doneArtists === 0) {
        cache.rebuild(uid, token).catch(console.error);
    }

    res.json(st);
});


router.get('/latest', ensureAuth, (req, res) => {
    res.json(cache.getLatest(req.uid));
});

router.get('/releases/:year', ensureAuth, (req, res) => {
    const data = cache.getReleases(req.uid, req.params.year);
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

router.post('/subscribe', (req, res) => {
    try {
        if (!subscriptions.find(s => JSON.stringify(s) === JSON.stringify(req.body))) subscriptions.push(req.body);
        res.status(201).json({success: true});
    } catch (err) {
        console.error('Subscription Error:', err.message);
        res.status(500).json({error: err.message});
    }
});

module.exports = {router, subscriptions};
