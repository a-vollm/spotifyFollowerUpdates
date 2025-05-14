const axios = require('axios');
const tokenStore = require('./tokenStore');
const SPOTIFY_API = 'https://api.spotify.com/v1';
const AXIOS_TIMEOUT = 25000;
const RATE_LIMIT_DELAY = 1000; // 1 second between batches
const BATCH_SIZE = 20; // Artists per batch

const api = axios.create({
    timeout: AXIOS_TIMEOUT,
    headers: {'Accept-Encoding': 'gzip,deflate,compress'}
});

// Helper function with retry logic
async function safeApiCall(config, retries = 3) {
    try {
        const response = await api(config);
        return response.data;
    } catch (error) {
        if (retries > 0 && error.response?.status === 429) {
            const backoff = Math.pow(2, 4 - retries) * 1000;
            console.log(`⏳ Rate limited. Retrying in ${backoff}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            return safeApiCall(config, retries - 1);
        }
        throw error;
    }
}

// Get all paginated data
async function getAllPages(url, token) {
    let items = [];
    while (url) {
        const data = await safeApiCall({
            url,
            headers: {Authorization: `Bearer ${token}`}
        });
        items = [...items, ...data.items];
        url = data.next;
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
    }
    return items;
}

// User cache system
const userCaches = new Map();
function getCache(uid) {
    if (!userCaches.has(uid)) {
        userCaches.set(uid, {
            status: {loading: false, totalArtists: 0, doneArtists: 0},
            latest: [],
            releases: {}
        });
    }
    return userCaches.get(uid);
}

// Batch artist album requests
async function getBatchAlbums(artistIds, token) {
    const params = {ids: artistIds.join(','), include_groups: 'album,single'};
    const data = await safeApiCall({
        url: `${SPOTIFY_API}/artists`,
        params,
        headers: {Authorization: `Bearer ${token}`}
    });
    return data.artists.flatMap(artist => artist.albums?.items || []);
}

async function rebuild(uid, token) {
    const cache = getCache(uid);
    cache.status = {loading: true, totalArtists: 0, doneArtists: 0};

    try {
        // Get followed artists
        const artists = await getAllPages(
            `${SPOTIFY_API}/me/following?type=artist&limit=50`,
            token
        );

        cache.status.totalArtists = artists.length;
        if (!artists.length) return;

        // Process artists in batches
        const allAlbums = [];
        for (let i = 0; i < artists.length; i += BATCH_SIZE) {
            const batch = artists.slice(i, i + BATCH_SIZE);
            const batchAlbums = await getBatchAlbums(
                batch.map(a => a.id),
                token
            );
            allAlbums.push(...batchAlbums);
            cache.status.doneArtists += batch.length;
            await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
        }

        if (!allAlbums.length) return;

        // Group releases by year/month
        const byYear = allAlbums.reduce((acc, album) => {
            const date = new Date(album.release_date);
            const year = date.getFullYear();
            const month = date.toLocaleString('default', {month: 'long'});
            acc[year] = acc[year] || {};
            acc[year][month] = [...(acc[year][month] || []), album];
            return acc;
        }, {});

        cache.releases = Object.entries(byYear).reduce((acc, [year, months]) => {
            acc[year] = Object.entries(months)
                .sort(([a], [b]) => new Date(`${b} 1,${year}`) - new Date(`${a} 1,${year}`))
                .map(([month, releases]) => ({month, releases}));
            return acc;
        }, {});

        cache.latest = allAlbums
            .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
            .slice(0, 20);

    } catch (err) {
        console.error(`[${uid}] Rebuild failed:`, err.message);
        if (err.response?.status === 401) await handleTokenRefresh(uid);
    } finally {
        cache.status.loading = false;
    }
}

async function handleTokenRefresh(uid) {
    const saved = await tokenStore.get(uid);
    if (!saved?.refresh) return;

    try {
        const {data} = await axios.post('https://accounts.spotify.com/api/token',
            new URLSearchParams({grant_type: 'refresh_token', refresh_token: saved.refresh}),
            {
                headers: {
                    Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        await tokenStore.set(uid, {
            access: data.access_token,
            refresh: data.refresh_token || saved.refresh,
            exp: Date.now() / 1000 + data.expires_in
        });
        console.log(`🔁 Token refreshed for ${uid}`);
    } catch (error) {
        console.error(`❌ Token refresh failed for ${uid}:`, error.message);
        await tokenStore.delete(uid);
    }
}

async function getPlaylistData(playlistId, token) {
    try {
        const [playlist, tracks] = await Promise.all([
            safeApiCall({url: `${SPOTIFY_API}/playlists/${playlistId}`, headers: {Authorization: `Bearer ${token}`}}),
            getAllPages(`${SPOTIFY_API}/playlists/${playlistId}/tracks?limit=100`, token)
        ]);

        // Get unique user IDs in parallel
        const userIds = [...new Set(tracks.map(t => t.added_by?.id).filter(Boolean))];
        const users = await Promise.all(
            userIds.map(id =>
                safeApiCall({url: `${SPOTIFY_API}/users/${id}`, headers: {Authorization: `Bearer ${token}`}})
                    .catch(() => null)
            )
        );

        const displayNames = users.reduce((acc, user) => {
            if (user) acc[user.id] = user.display_name;
            return acc;
        }, {});

        return {
            ...playlist,
            tracks: tracks.map(track => ({
                ...track,
                added_by: {
                    ...track.added_by,
                    display_name: displayNames[track.added_by?.id] || track.added_by?.display_name
                }
            }))
        };
    } catch (error) {
        console.error('Playlist fetch failed:', error.message);
        throw error;
    }
}

module.exports = {
    rebuild,
    getCacheStatus: uid => getCache(uid).status,
    getLatest: uid => getCache(uid).latest,
    getReleases: (uid, year) => getCache(uid).releases[year] || [],
    getPlaylistData
};
