const axios = require('axios')
const { ensureAccess, getAccessToken } = require('./auth')
const S = 'https://api.spotify.com/v1'
let cacheStatus = { loading: false, totalArtists: 0, doneArtists: 0 }
let cachedByYear = {}
let cachedLatest = []

async function rebuild() {
    await ensureAccess().catch(() => {
    })
    cacheStatus = { loading: true, totalArtists: 0, doneArtists: 0 }
    let ids = []
    let next = `${S}/me/following?type=artist&limit=50`
    while (next) {
        const r = await axios.get(next, { headers: { Authorization: 'Bearer ' + getAccessToken() } })
        ids.push(...r.data.artists.items.map(a => a.id))
        next = r.data.artists.next
    }
    cacheStatus.totalArtists = ids.length
    const all = []
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
    // group by year/month…
    const byYear = {}
    all.forEach(r => {
        const y = new Date(r.release_date).getFullYear()
        const m = new Date(r.release_date).toLocaleString('default', {month: 'long'})
        byYear[y] = byYear[y] || {}
        byYear[y][m] = (byYear[y][m] || []).concat(r)
    })
    cachedByYear = Object.fromEntries(Object.entries(byYear).map(([y, months]) => {
        return [y, Object.entries(months)
            .sort(([a], [b]) => new Date(`${b} 1,${y}`) - new Date(`${a} 1,${y}`))
            .map(([month, releases]) => ({month, releases}))]
    }))
    cachedLatest = all.sort((a, b) => new Date(b.release_date) - new Date(a.release_date)).slice(0, 20)
    cacheStatus.loading = false
}

function getCacheStatus() { return cacheStatus }

function getReleases(year) {
    return cachedByYear[year] || []
}
function getLatest() { return cachedLatest }

module.exports = { rebuild, getCacheStatus, getReleases, getLatest }
