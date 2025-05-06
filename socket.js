let io;

module.exports = {
    init: server => {
        io = require('socket.io')(server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        return io;
    },
    get: () => io
};
