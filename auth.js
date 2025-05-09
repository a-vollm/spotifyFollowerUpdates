const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const FRONTEND_URI = process.env.FRONTEND_URI;

/**
 * Baut die Auth-Routen ins Express-App ein:
 *  - GET  /auth/spotify  → redirectet zu Spotify-Login
 *  - POST /auth/token    → tauscht Code gegen Tokens und liefert JSON
 *  - POST /auth/refresh  → erneuert Access-Token via Server
 */
function initAuth(app) {
    app.get('/auth/spotify', (req, res) => {
        const state = crypto.randomBytes(16).toString('hex');
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code',
            redirect_uri: `${FRONTEND_URI}/callback`,
            scope: 'user-read-private user-read-email user-follow-read user-library-read',
            state
        });
        res.redirect(`https://accounts.spotify.com/authorize?${params}`);
    });

    app.post('/auth/token', async (req, res) => {
        const {code} = req.body;
        if (!code) return res.status(400).json({error: 'code missing'});
        try {
            const tokenResp = await axios.post(
                'https://accounts.spotify.com/api/token',
                querystring.stringify({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: `${FRONTEND_URI}/callback`
                }),
                {
                    headers: {
                        Authorization: 'Basic ' + Buffer
                            .from(`${CLIENT_ID}:${CLIENT_SECRET}`)
                            .toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            return res.json({
                access_token: tokenResp.data.access_token,
                refresh_token: tokenResp.data.refresh_token,
                expires_in: tokenResp.data.expires_in
            });
        } catch (err) {
            console.error('POST /auth/token error', err);
            return res.status(500).json({error: 'token_exchange_failed'});
        }
    });

    app.post('/auth/refresh', async (req, res) => {
        const {refresh_token} = req.body;
        if (!refresh_token) return res.status(400).json({error: 'refresh_token missing'});
        try {
            const resp = await axios.post(
                'https://accounts.spotify.com/api/token',
                querystring.stringify({
                    grant_type: 'refresh_token',
                    refresh_token
                }),
                {
                    headers: {
                        Authorization: 'Basic ' + Buffer
                            .from(`${CLIENT_ID}:${CLIENT_SECRET}`)
                            .toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            return res.json({
                access_token: resp.data.access_token,
                expires_in: resp.data.expires_in
            });
        } catch (err) {
            console.error('POST /auth/refresh error', err);
            return res.status(500).json({error: 'refresh_failed'});
        }
    });
}

module.exports = {initAuth};
