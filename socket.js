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

        io.on('connection', (socket) => {
            const uid = socket.handshake.auth?.uid;

            if (!uid || !tokenStore.get(uid)) {
                console.log('❌ Socket rejected – ungültige oder fehlende UID');
                socket.disconnect();
                return;
            }

            console.log(`✅ Socket verbunden für UID: ${uid}`);
            socket.join(uid); // optional: für gezielte Events wie io.to(uid).emit(...)
        });

        return io;
    },

    get: () => io
};
