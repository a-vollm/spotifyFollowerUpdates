let io
module.exports = {
    init: server => {
        io = require('socket.io')(server, {cors: {origin: '*'}});
        return io
    },
    get: () => io
}
