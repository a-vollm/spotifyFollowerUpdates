require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');

const app = express();
const webpush = require('web-push');
try {
    const allowedOrigins = [process.env.FRONTEND_URI]

    app.use(cors({
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    }));
} catch (err) {
    console.error('CORS Setup Error:', err);
}

app.use(express.json());

// Routen mit Error-Handling
try {
    const authRouter = require('./auth').router;
    const dataRouter = require('./routes');
    app.use(authRouter);
    app.use(dataRouter);
} catch (err) {
    console.error('Router Loading Error:', err);
    process.exit(1);
}


// Server starten
const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

try {
    const io = require('./socket').init(server);
    io.on('connection', () => console.log('Client connected'));

    // Cache mit Error-Handling
    const cache = require('./cache');
    cache.rebuild().then(() => io.emit('cacheUpdated')).catch(err => console.error('Initial cache rebuild failed:', err));

    // Cron job for rebuilding cached app data every hour
    cron.schedule('0 * * * *', () => {
        cache.rebuild().then(() => io.emit('socketTest')).catch(err => console.error('Scheduled cache rebuild failed:', err));
    });
// Cron job  every minute
    cron.schedule('* * * * *', () => {
        io.emit('cacheUpdated')
    });

    webpush.setVapidDetails(
        'mailto:dein@email.com',
        process.env.VAPID_PUBLIC,
        process.env.VAPID_PRIVATE
    );

    cron.schedule('* * * * *', async () => {
        console.log('⏰ CRON: Sende Push...');
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

    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
} catch (err) {
    console.error('Server startup error:', err);
}
