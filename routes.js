const express = require('express')
const { getCacheStatus, getReleases, getLatest } = require('./cache')
const router = express.Router()
router.get('/cache-status', (req, res) => res.json(getCacheStatus()))
router.get('/releases/:year', (req, res) => res.json(getReleases(req.params.year)))
router.get('/latest', (req, res) => res.json(getLatest()))
module.exports = router
