const express = require('express')
const axios = require('axios')
const querystring = require('querystring')
const router = express.Router()

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const FRONTEND_URI = process.env.FRONTEND_URI

const REDIRECT_URI = process.env.REDIRECT_URI

let accessToken = ''
let refreshToken = ''
let expiresAt = 0

router.get('/auth/spotify', (req, res) => {
    console.log('SPOTIFY REDIRECT_URI (auth):', REDIRECT_URI);
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: 'user-read-private user-read-email user-follow-read user-library-read'
    });
    res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

function ensureAccess() {
    if (!refreshToken) throw new Error('not authorized')
    if (Date.now() >= expiresAt) {
        return axios.post(
            'https://accounts.spotify.com/api/token',
            querystring.stringify({grant_type: 'refresh_token', refresh_token: refreshToken}),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
                }
            }
        ).then(r => {
            accessToken = r.data.access_token
            expiresAt = Date.now() + r.data.expires_in * 1000
        })
    }
    return Promise.resolve()
}

router.get('/auth/spotify', (req, res) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: 'user-read-private user-read-email user-follow-read user-library-read'
    })
    res.redirect('https://accounts.spotify.com/authorize?' + params.toString())
})

router.get('/auth/spotify/callback', async (req, res) => {
    try {
        if (!req.query.code) {
            return res.status(400).send('Authorization code missing');
        }

        const code = req.query.code;
        const body = querystring.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI
        });

        console.log('[DEBUG] Token Request Body:', body);

        const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

        console.log('[DEBUG] Sende Token-Request an Spotify...');
        const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', body, {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('[DEBUG] Token Response:', tokenResponse.data);

        accessToken = tokenResponse.data.access_token;
        refreshToken = tokenResponse.data.refresh_token;
        expiresAt = Date.now() + tokenResponse.data.expires_in * 1000;

        console.log('[DEBUG] Tokens erhalten. Starte Cache-Rebuild...');
        const cache = require('./cache');
        await cache.rebuild();

        try {
            require('./socket').get().emit('cacheUpdated');
        } catch (socketError) {
            console.error('[WARN] Socket.io Error:', socketError.message);
        }

        console.log('[DEBUG] Weiterleitung an Frontend:', `${FRONTEND_URI}/callback`);
        res.redirect(`${FRONTEND_URI}/callback?access_token=${accessToken}&refresh_token=${refreshToken}`);

    } catch (error) {
        console.error('[ERROR] Fehler im Callback-Handler:', error.response?.data || error.message);

        if (error.response) {
            console.error('[ERROR] Spotify API Response:', {
                status: error.response.status,
                data: error.response.data
            });
        }

        res.status(500).send(`
            <html>
                <body>
                    <h1>Authentication Failed</h1>
                    <p>${error.message}</p>
                    <a href="/auth/spotify">Try again</a>
                </body>
            </html>
        `);
    }
});
// endpoint for token refresh
router.get('/refresh', async (req, res) => {
    const token = req.query.refresh_token
    if (!token) return res.status(400).json({error: 'Missing refresh_token'})

    const body = querystring.stringify({grant_type: 'refresh_token', refresh_token: token})
    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    try {
        const {data} = await axios.post('https://accounts.spotify.com/api/token', body, {
            headers: {
                Authorization: `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
        accessToken = data.access_token
        expiresAt = Date.now() + data.expires_in * 1000
        res.json({access_token: data.access_token})
    } catch (err) {
        res.status(err.response?.status || 500).json(err.response?.data || {error: err.message})
    }
})

module.exports = {router, ensureAccess, getAccessToken: () => accessToken}
