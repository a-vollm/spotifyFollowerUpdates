const cron = require('node-cron');
const axios = require('axios');
const qs = require('querystring');
const tokenStore = require('./tokenStore');

const {
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET
} = process.env;

cron.schedule('*/10 * * * *', async () => {
    const now = Date.now() / 1000;
    const allTokens = await tokenStore.all();

    for (const [userId, token] of Object.entries(allTokens)) {
        if (token.exp - now < 600) {
            try {
                const res = await axios.post(
                    'https://accounts.spotify.com/api/token',
                    qs.stringify({
                        grant_type: 'refresh_token',
                        refresh_token: token.refresh
                    }),
                    {
                        headers: {
                            Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );

                token.access = res.data.access_token;
                token.exp = now + res.data.expires_in;
                await tokenStore.set(userId, token);
                console.log(`✅ Refreshed token for ${userId}`);
            } catch (err) {
                console.error(`❌ Failed to refresh ${userId}:`, err.message);
            }
        }
    }
});
