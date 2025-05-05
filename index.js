const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Leitet den User zu Spotify-Login weiter
app.get('/auth', (req, res) => {
    const scopes = 'user-follow-read playlist-read-private';
    const authUrl =
        'https://accounts.spotify.com/authorize' +
        `?response_type=code&client_id=${process.env.SPOTIFY_CLIENT_ID}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${process.env.REDIRECT_URI}`;
    res.redirect(authUrl);
});

// Callback-Route für den initialen Token
app.get('/callback', async (req, res, next) => {
    try {
        const code = req.query.code;
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.REDIRECT_URI,
                client_id: process.env.SPOTIFY_CLIENT_ID,
                client_secret: process.env.SPOTIFY_CLIENT_SECRET,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        res.json(response.data);
    } catch (err) {
        next(err);
    }
});

// Route zum Erneuern des Access-Tokens
app.get('/refresh', async (req, res, next) => {
    try {
        const refreshToken = req.query.refresh_token;
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: process.env.SPOTIFY_CLIENT_ID,
                client_secret: process.env.SPOTIFY_CLIENT_SECRET,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        res.json(response.data);
    } catch (err) {
        next(err);
    }
});

// Globales Error-Handling
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(4000, () => console.log('Backend läuft auf Port 4000'));
