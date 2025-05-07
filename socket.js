// socket.js
let io;

module.exports = {
    init: server => {
        const allowedOrigins = process.env.NODE_ENV === 'production'
            ? process.env.FRONTEND_URI
            : ['http://localhost:4200'];

        io = require('socket.io')(server, {
            cors: {
                origin: allowedOrigins,
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        return io;
    },
    get: () => io
};
