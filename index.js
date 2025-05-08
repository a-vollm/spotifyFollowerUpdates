require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);

const {router, subscriptions} = require('./routes');
const io = require('./socket').init(server);

// CORS erlauben
app.use(cors({
    origin: [process.env.FRONTEND_URI],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(router);

// VAPID-Schlüssel setzen
webpush.setVapidDetails(
    'mailto:dein@email.com',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
);

// Initialen Cache laden
const cache = require('./cache');
cache.rebuild().then(() => io.emit('cacheUpdated')).catch(err => console.error('Initial cache rebuild failed:', err));

// SOCKET.IO Verbindung
io.on('connection', () => console.log('Client connected'));

// Cron: Cache stündlich neu laden
cron.schedule('0 * * * *', () => {
    cache.rebuild().then(() => io.emit('cacheUpdated')).catch(err => console.error('Scheduled cache rebuild failed:', err));
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

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
