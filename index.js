require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);

const {router, subscriptions} = require('./routes');
const {router: authRouter, sessions, refreshSpotifyToken} = require('./auth');
const io = require('./socket').init(server);
const cache = require('./cache');
const cookieParser = require('cookie-parser');

// VAPID konfigurieren
webpush.setVapidDetails(
    'mailto:dein@email.com',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
);

// CORS & Middleware
app.use(cors({
    origin: process.env.FRONTEND_URI,
    methods: ['GET', 'POST', 'OPTIONS'],
    exposedHeaders: ['set-cookie'],
    credentials: true
}));
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(authRouter);
app.use(router);

// Initialer Cache
cache.rebuild().then(() => io.emit('cacheUpdated')).catch(err => console.error('Initial cache rebuild failed:', err));

// Socket.IO Verbindung
io.on('connection', () => {
    console.log('✅ Socket.IO Client verbunden');
});

// Cron: Cache stündlich aktualisieren
cron.schedule('0 * * * *', async () => {
    try {
        await cache.rebuild();
        io.emit('cacheUpdated');
    } catch (err) {
        console.error('❌ Fehler beim stündlichen Cache-Rebuild:', err);
    }
});

// Cron: Push jede Minute senden
cron.schedule('* * * * *', async () => {
    if (!subscriptions.length) return;

    const payload = JSON.stringify({
        title: 'Automatischer Push',
        body: 'Dies ist eine Benachrichtigung jede Minute 🕐',
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/badge.png'
    });

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification(sub, payload);
            console.log('✅ Push gesendet');
        } catch (err) {
            console.error('❌ Push-Fehler:', err);
        }
    }
});

cron.schedule('*/5 * * * *', () => {
    sessions.forEach(async (session, sessionId) => {
        if (Date.now() >= session.expires_at - 120000) {
            try {
                const newTokens = await refreshSpotifyToken(session.refresh_token);
                sessions.set(sessionId, {...session, ...newTokens});
            } catch (error) {
                sessions.delete(sessionId);
            }
        }
    });
});

// Server starten
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});
