const express = require('express')
const {getCacheStatus, getReleases, getLatest} = require('./cache')
const {ensureAccess, getAccessToken} = require('./auth')
const router = express.Router()

const ensureAuth = (req, res, next) => {
    try {
        ensureAccess();
        next()
    } catch {
        res.sendStatus(401)
    }
}

router.get('/cache-status', ensureAuth, (req, res) =>
    res.json(getCacheStatus())
)
router.get('/releases/:year', ensureAuth, (req, res) =>
    res.json(getReleases(req.params.year))
)
router.get('/latest', ensureAuth, (req, res) =>
    res.json(getLatest())
)

module.exports = router
