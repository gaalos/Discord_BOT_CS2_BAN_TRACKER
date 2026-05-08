const axios = require("axios");
const db = require("../db");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

// ─────────────────────────────
// STEAM ID RESOLVER
// ─────────────────────────────
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

// ─────────────────────────────
// FETCH VAC-BAN API
// ─────────────────────────────
async function fetchProfile(steamId) {

    try {
        const res = await axios.get(
            `https://vac-ban.com/player-stats-api/player/${steamId}`,
            {
                timeout: 10000,
                validateStatus: () => true
            }
        );

        if (res.status !== 200) return { apiDown: true };

        return res.data;

    } catch {
        return { apiDown: true };
    }
}

// ─────────────────────────────
// MAIN SCAN
// ─────────────────────────────
async function runScan(client, guildId) {

    const config = db.prepare(`
        SELECT channelId FROM guild_config WHERE guildId = ?
    `).get(guildId);

    if (!config?.channelId) return;

    const channel = await client.channels.fetch(config.channelId);

    const tracked = db.prepare(`SELECT * FROM tracked`).all();

    let checked = 0;
    let banned = 0;
    let clean = 0;

    const recentBans = [];

    for (const acc of tracked) {

        const steamId = await extractSteamID(acc.steamInput);
        if (!steamId) continue;

        const data = await fetchProfile(steamId);
        checked++;

        // ─────────────────────────────
        // API DOWN
        // ─────────────────────────────
        if (!data || data.apiDown) {

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("⚠️ API DOWN")
                        .setColor(0x808080)
                        .setDescription(`SteamID: \`${steamId}\``)
                ]
            });

            continue;
        }

        // ─────────────────────────────
        // SAFE DATA EXTRACTION
        // ─────────────────────────────
        const nickname =
            data.nickname ||
            data.csstatsgg?.name ||
            "Unknown Player";

        const avatar =
            data.avatar_url ||
            data.csstatsgg?.avatar ||
            null;

        const profileUrl =
            data.profile_url ||
            `https://steamcommunity.com/profiles/${steamId}/`;

        // ─────────────────────────────
        // FIX BAN INFO (IMPORTANT)
        // ─────────────────────────────
        const bans = data.ban_info || {};

        const vacBanned =
            bans.vac_banned ||
            bans.VACBanned ||
            bans.number_of_vac_bans > 0 ||
            bans.NumberOfVACBans > 0;

        const gameBanned =
            bans.number_of_game_bans > 0 ||
            bans.NumberOfGameBans > 0;

        const communityBanned =
            bans.community_banned ||
            bans.CommunityBanned;

        const daysSinceBan =
            bans.days_since_last_ban ??
            bans.daysSinceLastBan ??
            null;

        const isBanned =
            vacBanned || gameBanned || communityBanned;

        // ─────────────────────────────
        // STATS
        // ─────────────────────────────
        if (isBanned) {
            banned++;

            recentBans.push({
                nickname,
                profileUrl,
                avatar,
                days: daysSinceBan
            });

        } else {
            clean++;
        }

        // ─────────────────────────────
        // STATUS
        // ─────────────────────────────
        let color = isBanned ? 0xff3b3b : 0x2ecc71;

        let status = "🟢 CLEAN";

        if (vacBanned) status = "⛔ VAC BAN";
        else if (gameBanned) status = "🟧 GAME BAN";
        else if (communityBanned) status = "🟪 COMMUNITY BAN";

        if (daysSinceBan !== null && isBanned) {
            status += ` (${daysSinceBan}j ago)`;
        }

        // ─────────────────────────────
        // BUTTONS
        // ─────────────────────────────
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`remove_${acc.id}`)
                .setLabel("Remove")
                .setStyle(ButtonStyle.Danger)
        );

        // ─────────────────────────────
        // EMBED CLEAN
        // ─────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle(`👤 ${nickname}`)
            .setURL(profileUrl)
            .setThumbnail(avatar)
            .setColor(color)

            .setDescription(
                `## ${status}\n` +
                `🔗 [Steam Profile](${profileUrl})`
            )

            .addFields(
                {
                    name: "SteamID",
                    value: `\`${steamId}\``,
                    inline: true
                },
                {
                    name: "VAC",
                    value: vacBanned ? "⛔ YES" : "🟢 NO",
                    inline: true
                },
                {
                    name: "Game Ban",
                    value: gameBanned ? "⛔ YES" : "🟢 NO",
                    inline: true
                },
                {
                    name: "Community",
                    value: communityBanned ? "⛔ YES" : "🟢 NO",
                    inline: true
                },
                {
                    name: "Last Ban",
                    value: daysSinceBan !== null
                        ? `${daysSinceBan} days ago`
                        : "N/A",
                    inline: false
                }
            )

            .setFooter({ text: "CS2 Tracker System" })
            .setTimestamp();

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        await new Promise(r => setTimeout(r, 300));
    }

    // ─────────────────────────────
    // SUMMARY CLEAN
    // ─────────────────────────────
    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("📊 SCAN SUMMARY")
                .setColor(0x5865f2)
                .setDescription(
                    `🔍 Checked: **${checked}**\n` +
                    `⛔ Banned: **${banned}**\n` +
                    `🟢 Clean: **${clean}**`
                )
        ]
    });

    // ─────────────────────────────
    // RECENT BANS
    // ─────────────────────────────
    if (recentBans.length > 0) {

        const top = recentBans.slice(0, 5);

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🔥 RECENT BANS")
                    .setColor(0xff3b3b)
                    .setDescription(
                        top.map((u, i) =>
                            `**${i + 1}.** [${u.nickname}](${u.profileUrl}) • ${u.days ?? "?"}j`
                        ).join("\n")
                    )
            ]
        });
    }

    return { checked, banned, clean };
}

module.exports = { runScan };