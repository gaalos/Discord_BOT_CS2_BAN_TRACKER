const axios = require("axios");

async function checkBan(steamId) {
    try {
        const res = await axios.get(`https://cscheck.in/api/profile/${steamId}`);
        const bans = res.data?.bans;

        if (!bans) return { banned: false };

        const banned =
            bans.vac?.banned ||
            bans.gameBan?.banned ||
            bans.faceIT?.banned ||
            false;

        return { banned, bans };

    } catch (err) {
        return { banned: false };
    }
}

module.exports = { checkBan };