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

        let addedByName = null;
        if (added.length > 0) {
            const addedTrack = data.tracks.find(t => added.includes(t.track.id));
            addedByName = addedTrack?.added_by?.display_name || null;
        }

        const addText =
            added.length === 1
                ? `${addedByName ? addedByName + ' hat' : '1 neuer Track wurde'} hinzugefügt`
                : `${added.length} neue Tracks${addedByName ? ' wurden von ' + addedByName : ''} hinzugefügt`;

        const removeText =
            removed.length === 1
                ? `1 Track wurde entfernt`
                : `${removed.length} Tracks wurden entfernt`;

        const fullText = [added.length ? addText : '', removed.length ? removeText : '']
            .filter(Boolean)
            .join(' • ');

        const payload = JSON.stringify({
            notification: {
                title: `🎵 ${data.name}`,
                body: fullText,
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

cron.schedule('0 * * * *', async () => {
    const allTokens = all();
    const tokens = Object.values(allTokens);

    if (tokens.length > 0) {
        const validToken = tokens[0].access;
        await cache.rebuild(validToken);
    }
});

// Server start
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
