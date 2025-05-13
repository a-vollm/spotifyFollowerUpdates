const axios = require('axios');
const tokenStore = require('./tokenStore');

const SPOTIFY_API = 'https://api.spotify.com/v1';
const AXIOS_TIMEOUT = 25000;
const MAX_FIRST_ARTISTS = 20;

const cache = {
    status: {loading: false, totalArtists: 0, doneArtists: 0},
    latest: [],
    releases: {}
};

const api = axios.create({timeout: AXIOS_TIMEOUT});

async function rebuild(token) {
    cache.status = {loading: true, totalArtists: 0, doneArtists: 0};

    try {
        const allArtists = [];
        let url = `${SPOTIFY_API}/me/following?type=artist&limit=50`;

        while (url) {
            const res = await api.get(url, {
                headers: {Authorization: `Bearer ${token}`}
            });
            allArtists.push(...res.data.artists.items);
            url = res.data.artists.next;
        }

        const ids = allArtists.map(a => a.id);
        cache.status.totalArtists = ids.length;

        const allAlbums = [];
        for (const id of ids) {
            const r = await api.get(`${SPOTIFY_API}/artists/${id}/albums`, {
                headers: {Authorization: `Bearer ${token}`},
                params: {include_groups: 'album,single', limit: 50}
            });
            allAlbums.push(...r.data.items);
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

async function getPlaylistData(playlistId, token) {
    const res = await api.get(`${SPOTIFY_API}/playlists/${playlistId}`, {
        headers: {Authorization: `Bearer ${token}`}
    });
    return res.data;
}

function getCacheStatus() {
    return cache.status;
}

function getLatest() {
    return cache.latest;
}

function getReleases(year) {
    return cache.releases[year] || [];
}

module.exports = {
    rebuild,
    getCacheStatus,
    getLatest,
    getReleases,
    getPlaylistData
};
