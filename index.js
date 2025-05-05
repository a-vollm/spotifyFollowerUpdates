require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const authRouter = require('./auth').router;
const dataRouter = require('./routes');
const socket = require('./socket');
const cache = require('./cache');

const app = express();

// CORS-Konfiguration
const corsOptions = {
    origin: [
        'http://localhost:4200', // Dev
        'https://your-production-domain.com' // Prod ← ANPASSEN!
    ],
    methods: 'GET,POST,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight für alle Routen
app.use(express.json());

// Routen
app.use(authRouter);
app.use(dataRouter);

// Socket.io
const server = http.createServer(app);
const io = socket.init(server);
io.on('connection', () => {
});

// Cache-Rebuild
cache.rebuild().then(() => io.emit('cacheUpdated'));
cron.schedule('0 * * * *', () =>
    cache.rebuild().then(() => io.emit('cacheUpdated'))
);

// Server starten
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
