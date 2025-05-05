equire('dotenv').config()
const express = require('express')
const cors = require('cors')
const http = require('http')
const cron = require('node-cron')
const authRouter = require('./auth').router
const dataRouter = require('./routes')
const socket = require('./socket')
const cache = require('./cache')

const app = express()
app.use(cors())
app.use(express.json())
app.use(authRouter)    // OAuth start and callback
app.use(dataRouter)    // cache-status, releases, latest

const server = http.createServer(app)
const io = socket.init(server)
io.on('connection', () => {})

// rebuild cache on start and every hour
cache.rebuild().then(() => io.emit('cacheUpdated'))
cron.schedule('0 * * * *', () =>
    cache.rebuild().then(() => io.emit('cacheUpdated'))
)

const PORT = process.env.PORT || 4000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
