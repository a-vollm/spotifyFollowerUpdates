// cache.js
const axios = require('axios');
const {ensureAccess, getAccessToken} = require('./auth');

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

let cacheStatus = {
    loading: false,
    totalArtists: 0,
    doneArtists: 0,
};

let cachedByYear = {};
let cachedLatest = [];

/**
 * Rebuild the cache only if authenticated.
 * Silently returns if no refresh token is present.
 */
async function rebuild() {
    try {
        await ensureAccess();
    } catch {
        // Not authenticated yet; skip rebuild
        return;
    }

    cacheStatus = {loading: true, totalArtists: 0, doneArtists: 0};

    // Collect artist IDs
    const ids = [];
    let nextUrl = `${SPOTIFY_API_BASE}/me/following?type=artist&limit=50`;

    while (nextUrl) {
        const response = await axios.get(nextUrl, {
            headers: {Authorization: `Bearer ${getAccessToken()}`},
        });
        const artists = response.data.artists.items;
        ids.push(...artists.map((a) => a.id));
        nextUrl = response.data.artists.next;
    }

    cacheStatus.totalArtists = ids.length;

    // Fetch albums for each artist
    const allAlbums = [];
    for (const id of ids) {
        try {
            const resp = await axios.get(`${SPOTIFY_API_BASE}/artists/${id}/albums`, {
                headers: {Authorization: `Bearer ${getAccessToken()}`},
                params: {include_groups: 'album,single', limit: 50},
            });
            allAlbums.push(...resp.data.items);
        } catch {
            // ignore individual artist errors
        }
        cacheStatus.doneArtists++;
    }

    // Group albums by year and month
    const byYearMap = {};
    allAlbums.forEach((item) => {
        const date = new Date(item.release_date);
        const year = date.getFullYear();
        const month = date.toLocaleString('default', {month: 'long'});

        byYearMap[year] = byYearMap[year] || {};
        byYearMap[year][month] = byYearMap[year][month] || [];
        byYearMap[year][month].push(item);
    });

    // Sort months and build final structure
    cachedByYear = Object.entries(byYearMap).reduce((acc, [year, months]) => {
        const sortedMonths = Object.entries(months)
            .sort(([a], [b]) => new Date(`${b} 1,${year}`) - new Date(`${a} 1,${year}`))
            .map(([month, releases]) => ({month, releases}));
        acc[year] = sortedMonths;
        return acc;
    }, {});

    // Latest 20 releases sorted descending
    cachedLatest = allAlbums
        .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
        .slice(0, 20);

    cacheStatus.loading = false;
}

/**
 * Get the current cache status.
 * @returns {{loading: boolean, totalArtists: number, doneArtists: number}}
 */
function getCacheStatus() {
    return cacheStatus;
}

/**
 * Get releases grouped by month for a given year.
 * @param {string|number} year
 * @returns {Array<{month: string, releases: any[]}>}
 */
function getReleases(year) {
    return cachedByYear[year] || [];
}

/**
 * Get the latest 20 releases.
 * @returns {any[]}
 */
function getLatest() {
    return cachedLatest;
}

module.exports = {
    rebuild,
    getCacheStatus,
    getReleases,
    getLatest,
};
