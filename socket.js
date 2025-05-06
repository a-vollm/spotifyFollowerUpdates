let io;

module.exports = {
    init: server => {
        io = require('socket.io')(server, {
            cors: {
                origin: 'http://192.168.1.207:4200',
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        return io;
    },
    get: () => io
};
