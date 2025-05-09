const express = require('express');
const router = express.Router();
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const BACKEND_URI = process.env.REDIRECT_URI;
const FRONTEND_URI = process.env.FRONTEND_URI;

private
refreshInProgress = false;
router.get('/auth/spotify', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');

    const redirect_uri = `${BACKEND_URI}`;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: 'user-read-private user-read-email user-follow-read user-library-read',
        redirect_uri,
        state
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

router.get('/auth/spotify/callback', async (req, res) => {
    const {code} = req.query;

    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            querystring.stringify({
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${BACKEND_URI}` // exakt gleich wie oben
            }),
            {
                headers: {
                    Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const {access_token, refresh_token, expires_in} = response.data;

        // Leite ans Frontend weiter mit Token in der URL (NICHT als Cookie!)
        res.redirect(`${FRONTEND_URI}/callback?access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
    } catch (err) {
        console.error('Spotify Callback Error:', err.response?.data || err);
        res.redirect(`${FRONTEND_URI}/callback?error=auth_failed`);
    }
});

module.exports = {initAuth: (app) => app.use(router)};
