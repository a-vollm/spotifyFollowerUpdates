// socket.js
let io;

module.exports = {
    init: server => {
        const allowedOrigins = [process.env.FRONTEND_URI]

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
