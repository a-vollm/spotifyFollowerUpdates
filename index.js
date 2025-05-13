require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
require('./tokenCron');
const server = http.createServer(app);

const {initAuth} = require('./auth');
const {router: apiRouter, subscriptions} = require('./routes');
const io = require('./socket').init(server);
const lastPlaylists = new Map();

// VAPID
webpush.setVapidDetails(
    'mailto:you@yourmail.com',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
);

// CORS & JSON
app.use(cors({
    origin: process.env.FRONTEND_URI,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    credentials: true
}));
app.use(express.json());

// Auth-Endpoints
initAuth(app);

// API-Routen
app.use(apiRouter);

// Socket.IO
io.on('connection', () => console.log('✅ Socket.IO Client connected'));

function getTrackIds(playlist) {
    return new Set(playlist.tracks.map(t => t.track.id));
}

function compareSets(oldSet, newSet) {
    const added = [...newSet].filter(x => !oldSet.has(x));
    const removed = [...oldSet].filter(x => !newSet.has(x));
    return {added, removed};
}



// Cron: Push jede Minute senden
cron.schedule('* * * * *', async () => {
    if (!subscriptions.length) return;

    const payload = JSON.stringify({
        notification: {                     // <<-- neu, wichtig für iOS
            title: 'Automatischer Push',
            body: 'Dies ist eine Benachrichtigung jede Minute 🕐',
            icon: '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/badge.png'
        }
    });

    for (const sub of subscriptions) {
        await webpush.sendNotification(sub, payload);
    }
});


cron.schedule('*/2 * * * *', async () => {
    const playlistId = '4QTlILYEMucSKLHptGxjAq';
    const allTokens = require('./tokenStore').all();
    const token = Object.values(allTokens)[0]?.access;
    if (!token) return;

    try {
        const data = await require('./cache').getPlaylistData(playlistId, token);
        const currentSet = getTrackIds(data);
        const oldSet = lastPlaylists.get(playlistId) || new Set();

        const {added, removed} = compareSets(oldSet, currentSet);
        lastPlaylists.set(playlistId, currentSet);

        if (added.length === 0 && removed.length === 0) return;

        const changeText = [
            added.length ? `${added.length} neue Track(s)` : '',
            removed.length ? `${removed.length} entfernt` : ''
        ].filter(Boolean).join(', ');

        const payload = JSON.stringify({
            notification: {
                title: `Playlist aktualisiert`,
                body: `${changeText} in "${data.name}"`,
                icon: '/assets/icons/icon-192x192.png',
                badge: '/assets/icons/badge.png'
            }
        });

        for (const sub of subscriptions) {
            await webpush.sendNotification(sub, payload);
        }
    } catch (err) {
        console.error('Fehler bei Playlist-Check:', err.message);
    }
});


// Server start
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
