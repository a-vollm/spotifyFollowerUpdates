const express = require('express')
const axios = require('axios')
const querystring = require('querystring')
const router = express.Router()
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const REDIRECT_URI = process.env.REDIRECT_URI
let accessToken = ''
let refreshToken = ''
let expiresAt = 0

function ensureAccess() {
    if (!refreshToken) throw new Error('not authorized')
    if (Date.now() >= expiresAt) {
        return axios.post(
            'https://accounts.spotify.com/api/token',
            querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' +
                        Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
                }
            }
        ).then(r => {
            accessToken = r.data.access_token
            expiresAt = Date.now() + r.data.expires_in * 1000
        })
    }
    return Promise.resolve()
}

router.get('/auth', (req, res) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: 'user-read-private user-read-email'
    })
    res.redirect('https://accounts.spotify.com/authorize?' + params.toString())
})

router.get('/callback', (req, res) => {
    const code = req.query.code
    axios
        .post(
            'https://accounts.spotify.com/api/token',
            querystring.stringify({
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' +
                        Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
                }
            }
        )
        .then(r => {
            accessToken = r.data.access_token
            refreshToken = r.data.refresh_token
            expiresAt = Date.now() + r.data.expires_in * 1000
            res.redirect(`${REDIRECT_URI}?access_token=${accessToken}&refresh_token=${refreshToken}`)
        })
        .catch(() => res.sendStatus(400))
})

module.exports = { router, ensureAccess, getAccessToken: () => accessToken }
