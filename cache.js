const axios = require('axios');
const tokenStore = require('./tokenStore')
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

        /* ---------- EARLY-EXIT: Nutzer folgt niemandem ---------- */
        if (allArtists.length === 0) {
            cache.latest = [];
            cache.releases = {};
            cache.status.loading = false;
            return;                                // sofort abbrechen
        }

        /* ---------- Releases holen ---------- */
        const allAlbums = [];
        for (const artist of allArtists) {
            const r = await api.get(
                `${SPOTIFY_API}/artists/${artist.id}/albums`,
                {
                    headers: {Authorization: `Bearer ${token}`},
                    params: {include_groups: 'album,single', limit: 50}
                }
            );
            allAlbums.push(...r.data.items);
            cache.status.doneArtists++;
            await new Promise(res => setTimeout(res, 100));      // nur für UI-Progress
        }

        /* ---------- EARLY-EXIT: keine Releases gefunden ---------- */
        if (allAlbums.length === 0) {
            cache.latest = [];
            cache.releases = {};
            cache.status.loading = false;
            return;                                // sofort abbrechen
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
        if ([401, 429].includes(err.response?.status)) {
            console.log(`♻️ Lösche Token für ${uid}`);
            await tokenStore.delete(uid);
        }

    } finally {
        cache.status.loading = false;
    }
}

async function getPlaylistData(playlistId, token) {
    const urlBase = `${SPOTIFY_API}/playlists/${playlistId}`;

    // 1. Playlist-Grunddaten mit Retry-Logik
    const playlist = await safeApiCall(urlBase, token);

    // 2. Alle Tracks paginiert abrufen
    const tracks = await getAllPaginatedData(`${urlBase}/tracks?limit=100`, token);

    // 3. Batch-Weise Benutzerdaten abrufen
    const displayMap = await getUsersDisplayNames(tracks, token);

    // 4. Display-Namen zuweisen
    return {
        ...playlist,
        tracks: tracks.map(t => ({
            ...t,
            added_by: {
                ...t.added_by,
                display_name: displayMap[t.added_by?.id] || t.added_by?.display_name
            }
        }))
    };
}

// Hilfsfunktion für paginierte Daten
async function getAllPaginatedData(url, token) {
    let items = [];
    while (url) {
        const response = await safeApiCall(url, token);
        items.push(...response.items);
        url = response.next;
    }
    return items;
}

// Hilfsfunktion für Benutzerdaten
async function getUsersDisplayNames(tracks, token) {
    const uniqueUserIds = [...new Set(tracks.map(t => t.added_by?.id).filter(Boolean))];

    const displayMap = {};
    await Promise.all(
        uniqueUserIds.map(async (userId) => {
            try {
                const user = await safeApiCall(
                    `${SPOTIFY_API}/users/${userId}`,
                    token
                );
                displayMap[userId] = user.display_name;
            } catch (error) {
                console.warn(`Fehler bei Benutzer ${userId}:`, error.message);
                displayMap[userId] = null;
            }
        })
    );
    return displayMap;
}

// Generische API-Call-Funktion mit Retry-Logik
async function safeApiCall(url, token, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: {Authorization: `Bearer ${token}`},
                params: {market: 'from_token'}
            });
            return response.data;
        } catch (error) {
            if (error.response?.status === 429) {
                const backoff = Math.pow(2, i) * 1000;
                console.log(`⏳ Rate Limit - Retry in ${backoff}ms`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            throw error;
        }
    }
    throw new Error(`API request failed after ${retries} retries`);
}

/* -------- Getter -------- */
const getCacheStatus = uid => getCache(uid).status;
const getLatest = uid => getCache(uid).latest;
const getReleases = (uid, y) => getCache(uid).releases[y] || [];

/* -------- Exporte -------- */
module.exports = {
    rebuild,
    getCacheStatus,
    getLatest,
    getReleases,
    getPlaylistData
};
