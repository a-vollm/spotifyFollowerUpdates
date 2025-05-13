const axios = require('axios');
const {ensureAccess, getAccessToken} = require('./auth');

const SPOTIFY_API = 'https://api.spotify.com/v1';
const MAX_FIRST_ARTISTS = 20;
const AXIOS_TIMEOUT = 25000;

const cache = {
    status: {loading: false, totalArtists: 0, doneArtists: 0},
    latest: [],
    releases: {}
};

const api = axios.create({timeout: AXIOS_TIMEOUT});

function getCacheStatus() {
    return cache.status;
}

function getLatest() {
    return cache.latest;
}

function getReleases(year) {
    return cache.releases[year] || [];
}

async function rebuild() {
    cache.status = {loading: true, totalArtists: 0, doneArtists: 0};

    try {
        await ensureAccess();
    } catch {
        cache.status.loading = false;
        return;
    }

    try {
        const first = await api.get(
            `${SPOTIFY_API}/me/following?type=artist&limit=${MAX_FIRST_ARTISTS}`,
            {headers: {Authorization: `Bearer ${getAccessToken()}`}}
        );
        const ids = first.data.artists.items.map(a => a.id);
        cache.status.totalArtists = ids.length;

        const allAlbums = [];
        for (const id of ids) {
            try {
                const r = await api.get(
                    `${SPOTIFY_API}/artists/${id}/albums`,
                    {
                        headers: {Authorization: `Bearer ${getAccessToken()}`},
                        params: {include_groups: 'album,single', limit: 50}
                    }
                );
                allAlbums.push(...r.data.items);
            } catch {
            }
            cache.status.doneArtists++;
        }

        const byYear = {};
        allAlbums.forEach(a => {
            const d = new Date(a.release_date);
            const y = d.getFullYear();
            const m = d.toLocaleString('default', {month: 'long'});
            (byYear[y] ||= {})[m] ||= [];
            byYear[y][m].push(a);
        });

        cache.releases = Object.fromEntries(
            Object.entries(byYear).map(([y, months]) => [
                y,
                Object.entries(months)
                    .sort(([a], [b]) => new Date(`${b} 1,${y}`) - new Date(`${a} 1,${y}`))
                    .map(([m, rel]) => ({month: m, releases: rel}))
            ])
        );

        cache.latest = allAlbums
            .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
            .slice(0, 20);
    } catch (err) {
        console.error('Cache rebuild failed:', err.message);
    } finally {
        cache.status.loading = false;
    }
}

async function rebuildFull() {
    cache.status = {loading: true, totalArtists: 0, doneArtists: 0};

    try {
        await ensureAccess();

        const artists = [];
        let url = `${SPOTIFY_API}/me/following?type=artist&limit=50`;

        while (url) {
            const res = await api.get(url, {
                headers: {Authorization: `Bearer ${getAccessToken()}`}
            });
            artists.push(...res.data.artists.items);
            url = res.data.artists.next;
        }

        const ids = artists.map(a => a.id);
        cache.status.totalArtists = ids.length;

        const allAlbums = [];
        for (const id of ids) {
            try {
                const r = await api.get(
                    `${SPOTIFY_API}/artists/${id}/albums`,
                    {
                        headers: {Authorization: `Bearer ${getAccessToken()}`},
                        params: {include_groups: 'album,single', limit: 50}
                    }
                );
                allAlbums.push(...r.data.items);
            } catch {
            }
            cache.status.doneArtists++;
        }

        const byYear = {};
        allAlbums.forEach(a => {
            const d = new Date(a.release_date);
            const y = d.getFullYear();
            const m = d.toLocaleString('default', {month: 'long'});
            (byYear[y] ||= {})[m] ||= [];
            byYear[y][m].push(a);
        });

        cache.releases = Object.fromEntries(
            Object.entries(byYear).map(([y, months]) => [
                y,
                Object.entries(months)
                    .sort(([a], [b]) => new Date(`${b} 1,${y}`) - new Date(`${a} 1,${y}`))
                    .map(([m, rel]) => ({month: m, releases: rel}))
            ])
        );

        cache.latest = allAlbums
            .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
            .slice(0, 20);
    } catch (err) {
        console.error('Full cache rebuild failed:', err.message);
    } finally {
        cache.status.loading = false;
    }
}

async function getPlaylistData(playlistId) {
    await ensureAccess();
    const res = await api.get(`${SPOTIFY_API}/playlists/${playlistId}`, {
        headers: {Authorization: `Bearer ${getAccessToken()}`}
    });
    return res.data;
}

module.exports = {
    rebuild,
    rebuildFull,
    getCacheStatus,
    getLatest,
    getReleases,
    getPlaylistData
};
