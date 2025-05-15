const axios = require('axios');
const pLimit = require('p-limit');

const SPOTIFY_API = 'https://api.spotify.com/v1';
const AXIOS_TIMEOUT = 60_000;
const CONCURRENCY = 8;      //  ⬅️  max. parallele API-Calls

/* ---------- Axios-Instanz mit Basis-URL ---------- */
const api = axios.create({baseURL: SPOTIFY_API, timeout: AXIOS_TIMEOUT});

/* ---------- Hilfsfunktionen ---------- */
const wait = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, opts = {}, retries = 5) {
    try {
        return await api.get(url, opts);
    } catch (err) {
        if (err.response?.status === 429 && retries) {
            const after = (err.response.headers['retry-after'] ?? 1) * 1_000;
            await wait(after);
            return fetchWithRetry(url, opts, retries - 1);
        }
        throw err;
    }
}

/* ---------- Nutzer-spezifischer Cache ---------- */
const userCaches = new Map();
function getCache(uid) {
    if (!userCaches.has(uid)) {
        userCaches.set(uid, {
            status: {loading: false, totalArtists: 0, doneArtists: 0, lastError: null},
            latest: [],
            releases: {}
        });
    }
    return userCaches.get(uid);
}

/* ---------- Hauptaufbau ---------- */
async function rebuild(uid, token) {
    const cache = getCache(uid);
    const headers = {Authorization: `Bearer ${token}`};

    cache.status = {loading: true, totalArtists: 0, doneArtists: 0, lastError: null};

    try {
        /* --- Gefolgte Artists holen (kann mehrere Seiten haben) --- */
        const allArtists = [];
        let url = `/me/following?type=artist&limit=50`;

        while (url) {
            const res = await fetchWithRetry(url, {headers});
            allArtists.push(...res.data.artists.items);
            url = res.data.artists.next;   // vollqualifizierter Link oder null
        }
        cache.status.totalArtists = allArtists.length;

        /* --- Releases parallel, aber limitiert abholen --- */
        const limit = pLimit(CONCURRENCY);
        let done = 0;
        const albums = [];

        await Promise.all(
            allArtists.map(artist =>
                limit(async () => {
                    try {
                        const r = await fetchWithRetry(
                            `/artists/${artist.id}/albums`,
                            {
                                headers,
                                params: {
                                    include_groups: 'album,single',
                                    limit: 50,
                                    market: 'from_token'
                                }
                            }
                        );
                        albums.push(...r.data.items);
                    } catch (err) {
                        console.error(`[${uid}] Fehler bei Artist ${artist.name}:`, err.message);
                    } finally {
                        cache.status.doneArtists = ++done;
                    }
                })
            )
        );

        /* --- Gruppieren nach Jahr / Monat --- */
        const byYear = {};
        albums.forEach(a => {
            const d = new Date(a.release_date);
            const y = d.getUTCFullYear();
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

        cache.latest = albums
            .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
            .slice(0, 20);

    } catch (err) {
        console.error(`[${uid}] Cache rebuild failed:`, err.message);
        cache.status.lastError = err.message;
    } finally {
        cache.status.loading = false;
    }
}

/* ---------- Playlist-Helfer (unverändert, aber mit Retry) ---------- */
async function getPlaylistData(playlistId, token) {
    const headers = {Authorization: `Bearer ${token}`};
    const urlBase = `/playlists/${playlistId}`;

    const playlist = (await fetchWithRetry(urlBase, {headers})).data;

    let tracks = [];
    let next = `${urlBase}/tracks?limit=100&offset=0`;
    while (next) {
        const r = await fetchWithRetry(next, {headers});
        tracks.push(...r.data.items);
        next = r.data.next;
    }

    const ids = [...new Set(tracks.map(t => t.added_by?.id).filter(Boolean))];
    const displayMap = {};
    for (const id of ids) {
        try {
            const u = await fetchWithRetry(`/users/${id}`, {headers});
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

/* ---------- Getter ---------- */
const getCacheStatus = uid => getCache(uid).status;
const getLatest = uid => getCache(uid).latest;
const getReleases = (uid, y) => getCache(uid).releases[y] || [];

/* ---------- Exporte ---------- */
module.exports = {
    rebuild,
    getCacheStatus,
    getLatest,
    getReleases,
    getPlaylistData
};
