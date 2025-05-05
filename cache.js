const axios = require('axios')
const { ensureAccess, getAccessToken } = require('./auth')
const S = 'https://api.spotify.com/v1'
let cacheStatus = { loading: false, totalArtists: 0, doneArtists: 0 }
let cachedByYear = {}
let cachedLatest = []
async function rebuild() {
    try {
        await ensureAccess()
    } catch {
        return
    }
    cacheStatus = { loading: true, totalArtists: 0, doneArtists: 0 }
    let ids = []
    let next = `${S}/me/following?type=artist&limit=50`
    while (next) {
        const r = await axios.get(next, {
            headers: { Authorization: 'Bearer ' + getAccessToken() }
        })
        ids.push(...r.data.artists.items.map(a => a.id))
        next = r.data.artists.next
    }
    cacheStatus.totalArtists = ids.length
    let all = []
    for (const id of ids) {
        try {
            const r = await axios.get(`${S}/artists/${id}/albums`, {
                headers: { Authorization: 'Bearer ' + getAccessToken() },
                params: { include_groups: 'album,single', limit: 50 }
            })
            all.push(...r.data.items)
        } catch {}
        cacheStatus.doneArtists++
    }
    let byYearTemp = {}
    all.forEach(r => {
        const d = new Date(r.release_date)
        const y = d.getFullYear()
        if (!byYearTemp[y]) byYearTemp[y] = {}
        const m = d.toLocaleString('default', { month: 'long' })
        if (!byYearTemp[y][m]) byYearTemp[y][m] = []
        byYearTemp[y][m].push(r)
    })
    cachedByYear = {}
    Object.keys(byYearTemp).forEach(y => {
        cachedByYear[y] = Object.entries(byYearTemp[y])
            .sort(([a], [b]) => new Date(`${b} 1,${y}`) - new Date(`${a} 1,${y}`))
            .map(([month, releases]) => ({ month, releases }))
    })
    cachedLatest = all
        .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
        .slice(0, 20)
    cacheStatus.loading = false
}
function getCacheStatus() {
    return cacheStatus
}
function getReleases(year) {
    return cachedByYear[year] || []
}
function getLatest() {
    return cachedLatest
}
module.exports = { rebuild, getCacheStatus, getReleases, getLatest }
