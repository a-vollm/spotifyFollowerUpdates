const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
const router = express.Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const FRONTEND_URI = process.env.FRONTEND_URI;
const REDIRECT_URI = process.env.REDIRECT_URI;

const sessions = new Map();

router.get('/auth/spotify', (req, res) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: 'user-read-private user-read-email user-follow-read user-library-read'
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

async function refreshSpotifyToken(refreshToken) {
    const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            }
        }
    );
    return {
        access_token: response.data.access_token,
        expires_at: Date.now() + response.data.expires_in * 1000
    };
}

router.get('/auth/spotify/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) throw new Error('Authorization code missing');

        const tokenResp = await axios.post('https://accounts.spotify.com/api/token',
            querystring.stringify({
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            }),
            {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const sessionId = crypto.randomUUID();
        sessions.set(sessionId, {
            access_token: tokenResp.data.access_token,
            refresh_token: tokenResp.data.refresh_token,
            expires_at: Date.now() + tokenResp.data.expires_in * 1000
        });

        res.cookie('sessionId', sessionId, {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            maxAge: 3600 * 1000,
            domain: '.onrender.com',
            path: '/',
        }).redirect(`${FRONTEND_URI}/`);

    } catch (err) {
        console.error('Auth error:', err);
        res.redirect(`${FRONTEND_URI}/?error=auth_failed`);
    }
});

router.get('/check-auth', (req, res) => {
    console.log('check-auth called');  // 🟡 Debug-Log
    try {
        console.log('X-Forwarded-For:', req.get('x-forwarded-for'));
        console.log('X-Real-IP:', req.get('x-real-ip'));
        console.log('Raw Headers:', req.headers);
        console.log('Host:', req.get('host'));
        console.log('X-Forwarded-Proto:', req.get('x-forwarded-proto'));
        console.log('Cookies:', req.cookies);
        console.log('Headers:', req.headers.cookie)
        if (!req.cookies) return res.status(401).send();

        const sessionId = req.cookies.sessionId;
        if (!sessionId) return res.status(401).send();

        const session = sessions.get(sessionId);
        console.log('Session ID:', sessionId);  // 🟡 Debug-Log
        console.log('Sessions:', sessions);     // 🟡 Debug-Log
        if (!session || Date.now() >= session.expires_at) {
            res.clearCookie('sessionId');
            return res.status(401).send();
        }

        res.status(200).send();
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(500).send();
    }
});

router.post('/logout', (req, res) => {
    const sessionId = req.cookies.sessionId;
    sessions.delete(sessionId);
    res.clearCookie('sessionId').sendStatus(200);
});

module.exports = {
    router,
    sessions,
    refreshSpotifyToken
};
