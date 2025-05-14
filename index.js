require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const {initAuth} = require('./auth');
const {router: apiRouter, subscriptions} = require('./routes');
const cache = require('./cache');
const tokenStore = require('./tokenStore');
const io = require('./socket').init(server);

webpush.setVapidDetails(
    'mailto:you@yourmail.com',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
);

app.use(cors({
    origin: process.env.FRONTEND_URI,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id']
}));
app.use(express.json());

initAuth(app);
app.use(apiRouter);

io.on('connection', () => console.log('✅ Socket.IO Client connected'));

function getTrackIds(playlist) {
    return new Set(playlist.tracks.map(t => t.track.id));
}

function compareSets(oldSet, newSet) {
    const added = [...newSet].filter(x => !oldSet.has(x));
    const removed = [...oldSet].filter(x => !newSet.has(x));
    return {added, removed};
}

cron.schedule('*/1 * * * *', async () => {
    console.log('🎧 Starte Playlist-Check...');
    const playlistId = '4QTlILYEMucSKLHptGxjAq';
    const allTokens = await tokenStore.all();
    console.log(`🔑 Gefundene Benutzer: ${Object.keys(allTokens).length}`);

    for (const [uid, token] of Object.entries(allTokens)) {
        try {
            console.log(`\n--- Prüfe UID ${uid} ---`);

            // 1. Playlist-Daten abrufen
            const data = await cache.getPlaylistData(playlistId, token.access);
            console.log(`🎵 Playlist "${data.name}" hat ${data.tracks.length} Tracks`);

            // 2. Track-IDs vergleichen
            const currentSet = getTrackIds(data);
            const oldSet = await tokenStore.getPlaylistCache(`${playlistId}_${uid}`);
            console.log(`🗃️ Alte Tracks: ${oldSet.size}, Aktuelle Tracks: ${currentSet.size}`);

            const {added, removed} = compareSets(oldSet, currentSet);
            console.log(`➕ Hinzugefügt: ${added.length}, ➖ Entfernt: ${removed.length}`);

            if (added.length === 0 && removed.length === 0) {
                console.log('⏩ Keine Änderungen – überspringe.');
                continue;
            }

            let addedByName = null;
            if (added.length > 0) {
                const addedTrack = data.tracks.find(t => added.includes(t.track.id));
                addedByName = addedTrack?.added_by?.display_name || null;
            }

            const addText = added.length === 1
                ? `${addedByName} hat 1 neuen Track hinzugefügt`
                : `${added.length} neue Tracks wurden von ${addedByName} hinzugefügt`;

            if (removed.length > 0) {
                const removedText = removed.length === 1
                    ? `1 Track wurde entfernt`
                    : `${removed.length} Tracks wurden entfernt`;
                parts.push(removedText);
            }

            const fullText = parts.join(' • ');
            const payload = JSON.stringify({
                notification: {
                    title: `${data.name}`,
                    body: fullText,
                    icon: '/assets/icons/icon-192x192.png',
                    badge: '/assets/icons/badge.png',
                    tag: `playlist-tracking-${uid}`,
                    renotify: true,
                    silent: false,
                    requireInteraction: true,
                    data: {origin: 'playlist-monitor'}
                }
            });

            // 4. Push senden
            console.log(`📤 Sende Benachrichtigung: "${fullText}"`);
            for (const sub of subscriptions) {
                await webpush.sendNotification(sub, payload);
            }

            // 5. Cache aktualisieren
            await tokenStore.setPlaylistCache(`${playlistId}_${uid}`, [...currentSet]);
            console.log('✅ Playlist-Cache aktualisiert.');

        } catch (err) {
            console.error(`❌ Fehler bei UID ${uid}:`, err.message);
        }
    }
});


cron.schedule('*/30 * * * *', async () => {
    const allTokens = await tokenStore.all();

    for (const [uid, token] of Object.entries(allTokens)) {
        try {
            const oldSet = await tokenStore.getReleaseCache(uid);
            await cache.rebuild(uid, token.access);
            const current = cache.getLatest(uid);
            const newSet = new Set(current.map(r => r.id));

            const added = [...newSet].filter(x => !oldSet.has(x));
            await tokenStore.setReleaseCache(uid, [...newSet]);

            if (!added.length) continue;

            const addedItems = current.filter(r => added.includes(r.id));
            const albums = addedItems.filter(r => r.album_type === 'album').length;
            const singles = addedItems.filter(r => r.album_type === 'single').length;

            const summary = [
                albums ? `${albums} neue Alben` : '',
                singles ? `${singles} neue Singles` : ''
            ].filter(Boolean).join(' und ');

            const payload = JSON.stringify({
                notification: {
                    title: '🎉 Neue Releases entdeckt',
                    body: summary,
                    icon: '/assets/icons/icon-192x192.png',
                    badge: '/assets/icons/badge.png',
                    tag: 'releases-update',
                    renotify: true,
                    requireInteraction: true,
                    data: {origin: 'release-monitor'}
                }
            });

            for (const sub of subscriptions) {
                await webpush.sendNotification(sub, payload);
            }
        } catch (e) {
            console.error(`❌ Fehler beim Release-Check für UID ${uid}:`, e.message);
        }
    }
});

cron.schedule('*/15 * * * *', async () => {
    const tokens = await tokenStore.all();
    for (const [uid, token] of Object.entries(tokens)) {
        await cache.rebuild(uid, token.access);
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
