const axios = require('axios');
const {ensureAccess, getAccessToken} = require('./auth');

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

let cacheStatus = {loading: false, totalArtists: 0, doneArtists: 0};
let cachedByYear = {};
let cachedLatest = [];

function startRebuild() {
    if (cacheStatus.loading) return;
    cacheStatus = {loading: true, totalArtists: 0, doneArtists: 0};
    rebuild();                // async, kein await
}

async function rebuild() {
    try {
        await ensureAccess();
    } catch {
        return;
    }
    try {
        cacheStatus = {loading: true, totalArtists: 0, doneArtists: 0};

        const ids = [];
        let nextUrl = `${SPOTIFY_API_BASE}/me/following?type=artist&limit=50`;
        while (nextUrl) {
            const r = await axios.get(nextUrl, {headers: {Authorization: `Bearer ${getAccessToken()}`}});
            ids.push(...r.data.artists.items.map(a => a.id));
            nextUrl = r.data.artists.next;
        }
        cacheStatus.totalArtists = ids.length;

        const all = [];
        for (const id of ids) {
            try {
                const r = await axios.get(`${SPOTIFY_API_BASE}/artists/${id}/albums`, {
                    headers: {Authorization: `Bearer ${getAccessToken()}`},
                    params: {include_groups: 'album,single', limit: 50}
                });
                all.push(...r.data.items);
            } catch {
            }
            cacheStatus.doneArtists++;
        }

        const byYear = {};
        for (const a of all) {
            const d = new Date(a.release_date);
            const y = d.getFullYear();
            const m = d.toLocaleString('default', {month: 'long'});
            (byYear[y] ||= {})[m] ||= [];
            byYear[y][m].push(a);
        }

        cachedByYear = Object.fromEntries(
            Object.entries(byYear).map(([y, months]) => [
                y,
                Object.entries(months)
                    .sort(([a], [b]) => new Date(`${b} 1,${y}`) - new Date(`${a} 1,${y}`))
                    .map(([m, r]) => ({month: m, releases: r}))
            ])
        );

        cachedLatest = all.sort((a, b) => new Date(b.release_date) - new Date(a.release_date)).slice(0, 20);
        cacheStatus.loading = false;
    } catch {
    }
}

function getCacheStatus() {
    return cacheStatus;
}

function getReleases(y) {
    return cachedByYear[y] || [];
}

function getLatest() {
    return cachedLatest;
}

module.exports = {startRebuild, rebuild, getCacheStatus, getReleases, getLatest, getPlaylistData};
