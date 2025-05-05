// auth.js
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const router = express.Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FRONTEND_URI = process.env.FRONTEND_URI;

let accessToken = '';
let refreshToken = '';
let expiresAt = 0;

function ensureAccess() {
    if (!refreshToken) throw new Error('not authorized');
    if (Date.now() >= expiresAt) {
        return axios.post(
            'https://accounts.spotify.com/api/token',
            querystring.stringify({
                grant_type:    'refresh_token',
                refresh_token: refreshToken
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
                }
            }
        ).then(r => {
            accessToken = r.data.access_token;
            expiresAt = Date.now() + r.data.expires_in * 1000;
        });
    }
    return Promise.resolve();
}

router.get('/auth/spotify', (req, res) => {
    const params = new URLSearchParams({
        client_id:     CLIENT_ID,
        response_type: 'code',
        redirect_uri:  REDIRECT_URI,
        scope:         'user-read-private user-read-email'
    });
    res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

router.get('/auth/spotify/callback', async (req, res) => {
    const code = req.query.code;
    const body = querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
    });
    const authHeader = Buffer
        .from(`${CLIENT_ID}:${CLIENT_SECRET}`)
        .toString('base64');

    // 1) Code → Tokens
    const { data } = await axios.post(
        'https://accounts.spotify.com/api/token',
        body,
        {
            headers: {
                Authorization:   `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    expiresAt = Date.now() + data.expires_in * 1000;

    // 2) Cache neu aufbauen
    const cache = require('./cache');
    await cache.rebuild();

    // 3) Socket‑Event senden
    try {
        const io = require('./socket').get();
        io.emit('cacheUpdated');
    } catch (e) {
        console.warn('Socket.IO nicht initialisiert', e);
    }

    // 4) Weiterleitung ans Frontend mit beiden Tokens
    res.redirect(
        `${FRONTEND_URI}/callback?access_token=${accessToken}&refresh_token=${refreshToken}`
    );
});

// NEU: Endpoint für Client, um Access‑Token via Refresh‑Token zu erneuern
router.get('/refresh', async (req, res) => {
    const token = req.query.refresh_token;
    if (!token) {
        return res.status(400).json({error: 'Missing refresh_token'});
    }

    const body = querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: token
    });
    const authHeader = Buffer
        .from(`${CLIENT_ID}:${CLIENT_SECRET}`)
        .toString('base64');

    try {
        const {data} = await axios.post(
            'https://accounts.spotify.com/api/token',
            body,
            {
                headers: {
                    Authorization: `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        // Update server-side cache
        accessToken = data.access_token;
        expiresAt = Date.now() + data.expires_in * 1000;
        // Return new access_token to client
        res.json({access_token: data.access_token});
    } catch (err) {
        console.error('Refresh Error', err.response?.data || err.message);
        res
            .status(err.response?.status || 500)
            .json(err.response?.data || {error: err.message});
    }
});

module.exports = {
    router,
    ensureAccess,
    getAccessToken: () => accessToken
};
