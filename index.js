require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const webpush = require('web-push');
const app = express();
const server = http.createServer(app);
const {initAuth} = require('./auth');
const {router: apiRouter} = require('./routes');
const tokenStore = require('./tokenStore');
const cache = require('./cache');
const io = require('./socket').init(server);

let subscriptions = [];

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
loadSubscriptions();

async function loadSubscriptions() {
    subscriptions = await tokenStore.getAllSubscriptions();
    console.log(`✅ Geladene Subscriptions: ${subscriptions.length}`);
}

function getTrackIds(playlist) {
    return new Set(playlist.tracks.map(t => t.track.id));
}

function compareSets(oldSet, newSet) {
    const added = [...newSet].filter(x => !oldSet.has(x));
    const removed = [...oldSet].filter(x => !newSet.has(x));
    return {added, removed};
}

cron.schedule('*/1 * * * *', async () => {
    const playlistId = '4QTlILYEMucSKLHptGxjAq';
    const allTokens = await tokenStore.all();
    const activeSubs = await tokenStore.getAllSubscriptions();

    if (Object.keys(allTokens).length === 0) return;

    const sampleToken = Object.values(allTokens)[0];
    const data = await cache.getPlaylistData(playlistId, sampleToken.access);
    const currentSet = getTrackIds(data);

    console.log(`📀 Playlist "${data.name}" hat ${currentSet.size} Tracks`);

    // Vergleiche mit einem Benutzer (z. B. erstem)
    const firstUid = Object.keys(allTokens)[0];
    const oldSet = await tokenStore.getPlaylistCache(playlistId, firstUid);
    const {added, removed} = compareSets(oldSet, currentSet);

    if (added.length === 0 && removed.length === 0) {
        console.log('⏩ Keine Änderungen – überspringe Benachrichtigung.');
        return;
    }

    let addedByName = null;
    if (added.length > 0) {
        const addedTrack = data.tracks.find(t => added.includes(t.track.id));
        addedByName = addedTrack?.added_by?.display_name || null;
    }

    const parts = [];
    if (added.length > 0) {
        const addedText = added.length === 1
            ? `${addedByName} hat 1 neuen Track hinzugefügt`
            : `${added.length} neue Tracks wurden von ${addedByName} hinzugefügt`;
        parts.push(addedText);
    }

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
            tag: `playlist-tracking`,
            renotify: true,
            silent: false,
            requireInteraction: true,
            data: {origin: 'playlist-monitor'}
        }
    });

    console.log(`📤 Sende Benachrichtigung an alle betroffenen User: "${fullText}"`);

    const sent = new Set();               // endpoint-Set
    for (const {uid, subscription} of activeSubs) {
        const id = subscription.endpoint;
        if (sent.has(id)) continue;
        try {
            await webpush.sendNotification(subscription, payload);
            sent.add(id);
        } catch (e) {
            console.warn(`⚠️ Push fehlgeschlagen – lösche Abo …`);
            await tokenStore.removeSubscription(uid, subscription);
        }
    }

    for (const uid of Object.keys(allTokens)) {
        await tokenStore.setPlaylistCache(playlistId, uid, [...currentSet]);
        console.log(`✅ Cache für ${uid} aktualisiert`);
    }
});

cron.schedule('*/30 * * * *', async () => {
    const allTokens = await tokenStore.all();
    const activeSubs = await tokenStore.getAllSubscriptions();
    console.log('ACTIVE SUBSCRIPTIONS', activeSubs);
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

            for (const sub of activeSubs.filter(s => s.uid === uid)) {
                try {
                    await webpush.sendNotification(sub.subscription, payload);
                } catch (e) {
                    console.warn(`⚠️ Push fehlgeschlagen für UID ${sub.uid}, lösche Subscription...`);
                    await tokenStore.removeSubscription(sub.uid, sub.subscription);
                }
            }

        } catch (e) {
            console.error(`❌ Fehler beim Release-Check für UID ${uid}:`, e.message);
        }
    }
});

cron.schedule('*/15 * * * *', async () => {
    const tokens = await tokenStore.all();

    for (const [uid, token] of Object.entries(tokens)) {
        try {
            console.log(`🔄 Starte Rebuild für UID ${uid}`);
            await cache.rebuild(uid, token.access);
        } catch (err) {
            console.error(`❌ Fehler beim Rebuild für ${uid}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 10000));
    }
});


const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
