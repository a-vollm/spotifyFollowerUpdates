const axios = require('axios');

const SPOTIFY_API = 'https://api.spotify.com/v1';
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

async function getPlaylistData(playlistId, token) {
    const res = await api.get(`${SPOTIFY_API}/playlists/${playlistId}`, {
        headers: {Authorization: `Bearer ${token}`}
    });
    return res.data;
}

module.exports = {
    getCacheStatus,
    getLatest,
    getReleases,
    getPlaylistData
};
