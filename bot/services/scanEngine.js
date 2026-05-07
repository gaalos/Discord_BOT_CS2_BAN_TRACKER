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
                `https://steamcommunity.com/id/${match[1]}/?xml=1`
            );

            const idMatch = res.data.match(/<steamID64>(\d{17})<\/steamID64>/);
            return idMatch ? idMatch[1] : null;

        } catch {
            return null;
        }
    }

    return null;
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

    let checked = 0;
    let banned = 0;

    const results = [];

    for (const acc of tracked) {

        const steamId = await extractSteamID(acc.steamInput);
        if (!steamId) continue;

        try {
            const res = await axios.get(
                `https://cscheck.in/api/profile/${steamId}`
            );

            const bans = res.data?.bans || {};

            const isBanned =
                bans.vac?.banned ||
                bans.gameBan?.banned ||
                bans.faceIT?.banned;

            checked++;
            if (isBanned) banned++;

            results.push({
                input: acc.steamInput,
                steamId,
                status: isBanned ? "🚨 BANNED" : "✅ CLEAN",
                vac: bans.vac?.banned ? "YES" : "NO",
                game: bans.gameBan?.banned ? "YES" : "NO",
                faceit: bans.faceIT?.banned ? "YES" : "NO"
            });

        } catch (err) {
            results.push({
                input: acc.steamInput,
                steamId: "ERROR",
                status: "⚠️ API ERROR"
            });
        }
    }

    // 🧠 CONCLUSION LOGIC
    const conclusion =
        banned === 0
            ? "🟢 CLEAN SYSTEM - No bans detected"
            : "🔴 THREATS DETECTED - Some accounts are banned";

    // 💬 SINGLE MESSAGE BUILD
    let message = `🔎 **CS2 FULL SCAN REPORT**\n\n`;

    for (const r of results) {

        message +=
`🔗 ${r.input}
🆔 ${r.steamId}
🚨 ${r.status}
\n`;
    }

    message +=
`━━━━━━━━━━━━━━
📊 Checked: ${checked}
🚨 Banned: ${banned}

📌 Conclusion:
${conclusion}`;

    await channel.send(message);
}

module.exports = { runScan };