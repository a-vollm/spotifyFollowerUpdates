let io;

module.exports = {
    init: server => {
        io = require('socket.io')(server, {
            cors: {
                origin: 'http://localhost:4200',
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        return io;
    },
    get: () => io
};
