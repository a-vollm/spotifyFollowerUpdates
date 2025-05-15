require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const webpush = require('web-push');
const app = express();
const router = express.Router();
const server = http.createServer(app);
const {initAuth} = require('./auth');
const {router: apiRouter} = require('./routes');
const tokenStore = require('./tokenStore');
const cache = require('./cache');
const io = require('./socket').init(server);

let subscriptions = [];
let isJobRunning = false;

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

router.get('/debug-cache', async (req, res) => {
    try {
        const playlistId = req.query.playlistId || '4QTlILYEMucSKLHptGxjAq'; // Playlist-ID aus Query oder Standardwert
        const uid = req.query.uid; // UID als Query-Parameter

        if (!uid) {
            return res.status(400).json({error: "UID fehlt (Gib ?uid=DEINE_UID an)"});
        }

        const allTokens = await tokenStore.all();
        const sampleToken = allTokens[uid];
        if (!sampleToken) {
            return res.status(404).json({error: "UID nicht gefunden"});
        }

        const dbCache = await tokenStore.getPlaylistCache(playlistId, uid);
        const data = await cache.getPlaylistData(playlistId, sampleToken.access);
        const currentTracks = getTrackIds(data);

        res.json({
            dbCache: [...dbCache],
            currentTracks: [...currentTracks],
            mismatch: dbCache.size !== currentTracks.size
        });
    } catch (err) {
        res.status(500).json({error: err.message});
    }
});

cron.schedule('*/1 * * * *', async () => {
    if (isJobRunning) {
        console.log('⏭️ Cron-Job übersprungen (bereits aktiv)');
        return;
    }
    isJobRunning = true;

    try {
        const playlistId = '4QTlILYEMucSKLHptGxjAq';
        const allTokens = await tokenStore.all();
        const activeSubs = await tokenStore.getAllSubscriptions();

        if (Object.keys(allTokens).length === 0) return;

        const sampleToken = Object.values(allTokens)[0];
        const data = await cache.getPlaylistData(playlistId, sampleToken.access);
        const currentSet = getTrackIds(data);

        console.log(`📀 Playlist "${data.name}" hat ${currentSet.size} Tracks`);

    // Für jeden Nutzer individuell prüfen
    for (const [uid, token] of Object.entries(allTokens)) {
        const oldSet = await tokenStore.getPlaylistCache(playlistId, uid);
        const {added, removed} = compareSets(oldSet, currentSet);

        if (added.length === 0 && removed.length === 0) {
            console.log(`⏩ Keine Änderungen für ${uid} – überspringe.`);
            continue;
        }

        // Nachricht für diesen Nutzer generieren
        let addedByName = null;
        const sampleTrack = data.tracks.find(t => t && currentSet.has(t.track.id));
        if (sampleTrack?.added_by?.display_name) {
            addedByName = sampleTrack.added_by.display_name;
        }

        const parts = [];
        added.length > 0
            ? parts.push(added.length === 1
                ? `${addedByName} hat 1 neuen Track hinzugefügt`
                : `${added.length} neue Tracks wurden von ${addedByName} hinzugefügt`)
            : null;

        removed.length > 0
            ? parts.push(removed.length === 1
                ? `1 Track wurde entfernt`
                : `${removed.length} Tracks wurden entfernt`)
            : null;

        const fullText = parts.join(' • ');
        const notificationTag = `playlist-${playlistId}-${Date.now()}-${uid}`;
        const payload = JSON.stringify({
            notification: {
                title: `${data.name}`,
                body: fullText,
                icon: '/assets/icons/icon-192x192.png',
                badge: '/assets/icons/badge.png',
                tag: notificationTag,
                renotify: false,
                silent: false,
                requireInteraction: true,
                data: {origin: 'playlist-monitor'}
            }
        });

        console.log(`📤 Sende Benachrichtigung an ${uid}: "${fullText}"`);

        const userSubs = activeSubs.filter(sub => sub.uid === uid);
        const sent = new Set();

        for (const {subscription} of userSubs) {
            const id = subscription.endpoint;
            if (sent.has(id)) continue;

            try {
                await webpush.sendNotification(subscription, payload);
                sent.add(id);
                console.log(`📤 Erfolgreich an ${id.slice(0, 15)}... gesendet`);
            } catch (e) {
                console.warn(`⚠️ Push fehlgeschlagen – lösche ${id.slice(0, 15)}...`);
                await tokenStore.removeSubscription(uid, subscription);
            }
        }
    }
    } catch (e) {
        console.error('❌ Cron-Job Fehler:', e);
    } finally {
        isJobRunning = false; // Lock immer zurücksetzen
    }
});

cron.schedule('*/30 * * * *', async () => {
    const allTokens = await tokenStore.all();
    const activeSubs = await tokenStore.getAllSubscriptions();

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
