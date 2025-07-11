const axios = require('axios');
const SPOTIFY_API = 'https://api.spotify.com/v1';
const AXIOS_TIMEOUT = 25_000;

const api = axios.create({timeout: AXIOS_TIMEOUT});

/* -------- Nutzer-spezifischer Cache -------- */
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

async function rebuild(uid, token) {
    const cache = getCache(uid);
    cache.status = {loading: true, totalArtists: 0, doneArtists: 0};

    const getIo = () => require('./socket').get();

    try {
        /* ---------- Gefolgte Artists holen ---------- */
        const allArtists = [];
        let url = `${SPOTIFY_API}/me/following?type=artist&limit=50`;

        while (url) {
            const res = await api.get(url, {headers: {Authorization: `Bearer ${token}`}});
            allArtists.push(...res.data.artists.items);
            url = res.data.artists.next;
        }

        cache.status.totalArtists = allArtists.length;

        if (allArtists.length === 0) {
            cache.latest = [];
            cache.releases = {};
            cache.status.loading = false;
            return;
        }

        /* ---------- Releases sequential holen (1 Req / 300 ms) ---------- */
        const allAlbums = [];

        for (let i = 0; i < allArtists.length; i++) {
            const artist = allArtists[i];
            let attempts = 0;
            let success = false;

            while (!success && attempts < 2) {          // max. 1 Retry
                try {
                    const r = await api.get(
                        `${SPOTIFY_API}/artists/${artist.id}/albums`,
                        {
                            headers: {Authorization: `Bearer ${token}`},
                            params: {include_groups: 'album,single', limit: 50}
                        }
                    );
                    allAlbums.push(...r.data.items);
                    success = true;
                } catch (e) {
                    if (e.response?.status === 429) {
                        const retry = Number(e.response.headers['retry-after'] || 1);
                        await new Promise(r => setTimeout(r, (retry + 1) * 1000));
                    } else {
                        console.warn(`⚠️  Artist ${artist.id}:`, e.message);
                        break;
                    }
                }
                attempts++;
            }

            cache.status.doneArtists = i + 1;

            getIo()?.to(uid).emit('cache-progress', {
                total: cache.status.totalArtists,
                done: cache.status.doneArtists
            });

            await new Promise(r => setTimeout(r, 300));   // 1 Request alle 300 ms
        }

        if (allAlbums.length === 0) {
            cache.latest = [];
            cache.releases = {};
            cache.status.loading = false;
            return;
        }

        /* ---------- Gruppieren nach Jahr/Monat ---------- */
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
        console.error(`[${uid}] Cache rebuild failed:`, err.message);
    } finally {
        cache.status.loading = false;
    }
}


async function getPlaylistData(playlistId, token) {
    const urlBase = `${SPOTIFY_API}/playlists/${playlistId}`;
    const playlist = (await axios.get(urlBase, {headers: {Authorization: `Bearer ${token}`}})).data;

    let tracks = [];
    let next = `${urlBase}/tracks?limit=100&offset=0`;
    while (next) {
        const r = await axios.get(next, {headers: {Authorization: `Bearer ${token}`}});
        tracks.push(...r.data.items);
        next = r.data.next;
    }

    const ids = [...new Set(tracks.map(t => t.added_by?.id).filter(Boolean))];
    const displayMap = {};
    for (const id of ids) {
        try {
            const u = await axios.get(`${SPOTIFY_API}/users/${id}`, {headers: {Authorization: `Bearer ${token}`}});
            displayMap[id] = u.data.display_name;
        } catch {
            displayMap[id] = null;
        }
    }
    tracks.forEach(t => {
        const id = t.added_by?.id;
        if (id && displayMap[id]) t.added_by.display_name = displayMap[id];
    });

    return {...playlist, tracks};
}

/* -------- Getter -------- */
const getCacheStatus = uid => getCache(uid).status;
const getLatest = uid => getCache(uid).latest;
const getReleases = (uid, y) => getCache(uid).releases[y] || [];

/* -------- Exporte -------- */
module.exports = {
    rebuild,
    getCacheStatus,
    getCache,
    getLatest,
    getReleases,
    getPlaylistData
};
