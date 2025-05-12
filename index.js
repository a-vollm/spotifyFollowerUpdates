require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);

const cache = require('./cache');
const {initAuth} = require('./auth');
const {router: apiRouter, subscriptions} = require('./routes');
const io = require('./socket').init(server);

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
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// Auth-Endpoints
initAuth(app);

// API-Routen
app.use(apiRouter);

// Initialer Cache-Rebuild
cache.rebuild().then(() => io.emit('cacheUpdated')).catch(console.error);

// Socket.IO
io.on('connection', () => console.log('✅ Socket.IO Client connected'));

// Cron-Jobs (Beispiel: stündliches Rebuild)
cron.schedule('0 * * * *', async () => {
    try {
        await cache.rebuild();
        io.emit('cacheUpdated');
    } catch (err) {
        console.error('Cache rebuild error:', err);
    }
});

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


// Server start
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
