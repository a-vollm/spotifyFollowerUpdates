require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');

const app = express();

try {
    const corsOptions = {
        origin: [
            'http://localhost:4200'
        ],
        methods: 'GET,POST,OPTIONS',
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    };
    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions));
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

// Socket.io Initialisierung
try {
    const io = require('./socket').init(server);
    io.on('connection', () => console.log('Client connected'));

    // Cache mit Error-Handling
    const cache = require('./cache');
    cache.rebuild()
        .then(() => io.emit('cacheUpdated'))
        .catch(err => console.error('Initial cache rebuild failed:', err));

    cron.schedule('0 * * * *', () => {
        cache.rebuild()
            .then(() => io.emit('cacheUpdated'))
            .catch(err => console.error('Scheduled cache rebuild failed:', err));
    });

    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
} catch (err) {
    console.error('Server startup error:', err);
}
