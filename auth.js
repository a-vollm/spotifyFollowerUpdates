const express = require('express');
const router = express.Router();
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const BACKEND_URI = process.env.REDIRECT_URI;
const FRONTEND_URI = process.env.FRONTEND_URI;

router.get('/auth/spotify', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: 'user-read-private user-read-email user-follow-read user-library-read',
        redirect_uri: BACKEND_URI,
        state
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

router.get('/auth/spotify/callback', (req, res) => {
    const {code, state} = req.query;
    res.redirect(`${FRONTEND_URI}/callback?code=${code}&state=${state}`);
});

router.post('/auth/token', async (req, res) => {
    const {code} = req.body;
    const r = await axios.post(
        'https://accounts.spotify.com/api/token',
        querystring.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: BACKEND_URI
        }),
        {
            headers: {
                Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
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
                Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );
    const {access_token, expires_in} = r.data;
    res.json({access_token, expires_in});
});

module.exports = {initAuth: app => app.use(router)};
