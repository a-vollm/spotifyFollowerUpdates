// socket.js
let io

module.exports = {
    init: server => {
        const { Server } = require('socket.io')
        io = new Server(server, { cors: { origin: '*' } })
        return io
    },
    get: () => {
        if (!io) throw new Error('Socket.IO not initialized')
        return io
    }
}
