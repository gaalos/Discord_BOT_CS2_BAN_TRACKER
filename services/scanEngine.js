const axios = require("axios");
const db = require("../db");

async function extractSteamID(input) {

    if (/^\d{17}$/.test(input)) return input;

    let match = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
    if (match) return match[1];

    match = input.match(/steamcommunity\.com\/id\/([^\/?#]+)/);
    if (match) {
        try {
            const res = await axios.get(
                `https://steamcommunity.com/id/${match[1]}/?xml=1`,
                { timeout: 8000 }
            );

            const idMatch = res.data.match(/<steamID64>(\d{17})<\/steamID64>/);
            return idMatch ? idMatch[1] : null;

        } catch {
            return null;
        }
    }

    return null;
}

// 🔥 SAFE API CALL
async function fetchProfile(steamId) {
    try {
        const res = await axios.get(
            `https://cscheck.in/api/profile/${steamId}`,
            {
                timeout: 10000,
                validateStatus: () => true
            }
        );

        if (res.status !== 200) {
            console.log("⚠️ API STATUS:", res.status);
            return null;
        }

        return res.data;

    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

async function runScan(client, guildId) {

    const config = db.prepare(`
        SELECT channelId FROM guild_config WHERE guildId = ?
    `).get(guildId);

    const channelId = config?.channelId;
    if (!channelId) return;

    let channel;

    try {
        channel = await client.channels.fetch(channelId);
    } catch {
        return;
    }

    const tracked = db.prepare("SELECT * FROM tracked").all();

    const results = [];

    let checked = 0;
    let newlyBanned = 0;

    for (const acc of tracked) {

        const steamId = await extractSteamID(acc.steamInput);
        if (!steamId) continue;

        const data = await fetchProfile(steamId);

        if (!data) {
            results.push({
                input: acc.steamInput,
                steamId,
                status: "⚠️ API FAILED"
            });
            continue;
        }

        const bans = data?.bans || {};

        const isBanned =
            bans.vac?.banned ||
            bans.gameBan?.banned ||
            bans.faceIT?.banned;

        checked++;

        const wasBanned = acc.isBanned === 1;

        // 🔥 NEW BAN DETECTED
        if (isBanned && !wasBanned) {
            newlyBanned++;

            db.prepare(`
                UPDATE tracked SET isBanned = 1 WHERE id = ?
            `).run(acc.id);
        }

        results.push({
            input: acc.steamInput,
            steamId,
            status: isBanned
                ? (wasBanned ? "🚨 STILL BANNED" : "🔥 NEW BAN")
                : "✅ CLEAN"
        });
    }

    return { results, checked, newlyBanned };
}

module.exports = { runScan };