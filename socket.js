const tokenStore = require('./tokenStore');
let io;

module.exports = {
    init: (server) => {
        const allowedOrigins = [process.env.FRONTEND_URI];

        io = require('socket.io')(server, {
            cors: {
                origin: allowedOrigins,
                methods: ['GET', 'POST'],
                credentials: true
            }
        });

        io.on('connection', async (socket) => {
            const uid = socket.handshake.auth?.uid;

            const token = uid ? await tokenStore.get(uid) : null;
            if (!token) {
                console.log('❌ Socket rejected – ungültige oder fehlende UID');
                socket.disconnect();
                return;
            }

            console.log(`✅ Socket verbunden für UID: ${uid}`);
            socket.join(uid);
        });

        return io;
    },

    get: () => io
};
