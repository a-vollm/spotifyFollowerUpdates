// auth.js  (ohne Kommentare)
const express = require('express');
const router = express.Router();
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const {SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, REDIRECT_URI, FRONTEND_URI} = process.env;

router.get('/auth/spotify', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const p = new URLSearchParams({
        response_type: 'code',
        client_id: SPOTIFY_CLIENT_ID,
        scope: 'user-read-private user-read-email user-follow-read user-library-read',
        redirect_uri: REDIRECT_URI,
        state
    });
    res.redirect(`https://accounts.spotify.com/authorize?${p}`);
});

router.get('/auth/spotify/callback', async (req, res) => {
    const {code, state} = req.query;
    const r = await axios.post(
        'https://accounts.spotify.com/api/token',
        querystring.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
        }),
        {
            headers: {
                Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    const {access_token, refresh_token, expires_in} = r.data;
    res.redirect(
        `${FRONTEND_URI}/callback?access=${access_token}` +
        `&refresh=${refresh_token}&exp=${expires_in}&state=${state}`
    );
});


router.post('/auth/token', async (req, res) => {
    const {code} = req.body;
    const r = await axios.post(
        'https://accounts.spotify.com/api/token',
        querystring.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
        }),
        {
            headers: {
                Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );
    const {access_token, refresh_token, expires_in} = r.data;
    res.json({access_token, refresh_token, expires_in});
});

router.post('/auth/refresh', async (req, res) => {
    const {refresh_token} = req.body;
    const r = await axios.post(
        'https://accounts.spotify.com/api/token',
        querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token
        }),
        {
            headers: {
                Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );
    const {access_token, expires_in} = r.data;
    res.json({access_token, expires_in});
});

module.exports = {initAuth: app => app.use(router)};
