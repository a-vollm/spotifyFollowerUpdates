const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const crypto = require('crypto');
const tokenStore = require('./tokenStore');

const router = express.Router();

const {
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    REDIRECT_URI,
    FRONTEND_URI
} = process.env;

/* ─────────────────────────  OAuth Einstieg  ───────────────────────── */
router.get('/auth/spotify', (_, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const p = new URLSearchParams({
        response_type: 'code',
        client_id: SPOTIFY_CLIENT_ID,
        scope: 'user-read-email user-follow-read user-library-read',
        redirect_uri: REDIRECT_URI,
        state
    });
    res.redirect(`https://accounts.spotify.com/authorize?${p}`);
});

/* ───────────────────  Spotify Redirect (Code → Tokens)  ───────────── */
router.get('/auth/spotify/callback', async (req, res) => {
    const {code, state} = req.query;

    const tok = await axios.post(
        'https://accounts.spotify.com/api/token',
        qs.stringify({grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI}),
        {
            headers: {
                Authorization: 'Basic ' + Buffer
                    .from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    const {access_token, refresh_token, expires_in} = tok.data;

    /* Benutzer-ID holen */
    const me = await axios.get('https://api.spotify.com/v1/me', {
        headers: {Authorization: `Bearer ${access_token}`}
    });
    const uid = me.data.id;

    /* Tokens in Datei-Store ablegen */
    tokenStore.set(uid, {
        access: access_token,
        refresh: refresh_token,
        exp: Date.now() / 1000 + expires_in   // Unix-Sekunden
    });
    /* Access-Token für den aktuellen Benutzer setzen */
    setCurrentAccess(access_token);

    /* Aktuelles Access-Token global verfügbar machen */
    currentAccessToken = access_token;

    /* Zurück ins Frontend */
    res.redirect(
        `${FRONTEND_URI}/#/callback?uid=${uid}` +
        `&access=${access_token}&refresh=${refresh_token}&exp=${expires_in}&state=${state}`
    );
});

/* ──────────────────────────  Refresh-Endpoint  ────────────────────── */
router.post('/auth/refresh', async (req, res) => {
    const {uid} = req.body;
    const saved = tokenStore.get(uid);
    if (!saved) return res.sendStatus(400);

    const tok = await axios.post(
        'https://accounts.spotify.com/api/token',
        qs.stringify({grant_type: 'refresh_token', refresh_token: saved.refresh}),
        {
            headers: {
                Authorization: 'Basic ' + Buffer
                    .from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    saved.access = tok.data.access_token;
    saved.exp = Date.now() / 1000 + tok.data.expires_in;
    tokenStore.set(uid, saved);

    currentAccessToken = saved.access;
    res.json({access: saved.access, expires_in: tok.data.expires_in});
});

/* ──────────────  Globale Access-Token-Bridge für cache.js  ─────────── */
let currentAccessToken = null;

function setCurrentAccess(token) {
    currentAccessToken = token;
}

function getAccessToken() {
    return currentAccessToken;
}

function ensureAccess() {
    if (!currentAccessToken) throw new Error('no access token yet');
}

module.exports = {
    initAuth: app => app.use(router),
    store: tokenStore,
};
