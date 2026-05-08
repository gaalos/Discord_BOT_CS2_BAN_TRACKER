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
// API VALIDATION
// ─────────────────────────────
function isValidProfile(data) {
    return (
        data &&
        typeof data === "object" &&
        data.ban_info &&
        typeof data.ban_info === "object"
    );
}

// ─────────────────────────────
// FETCH WITH RETRY + VALIDATION
// ─────────────────────────────
async function fetchProfileWithRetry(steamId, retries = 2) {

    for (let i = 0; i <= retries; i++) {
        try {
            const res = await axios.get(
                `https://vac-ban.com/player-stats-api/player/${steamId}`,
                {
                    timeout: 10000,
                    validateStatus: () => true
                }
            );

            if (res.status !== 200) throw new Error("Bad status");

            const data = res.data;

            if (!isValidProfile(data)) {
                throw new Error("Invalid structure");
            }

            return data;

        } catch (err) {

            if (i < retries) {
                await new Promise(r => setTimeout(r, 800));
                continue;
            }
        }
    }

    return { apiDown: true };
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

    const chunkSize = 4;

    for (let i = 0; i < tracked.length; i += chunkSize) {

        const chunk = tracked.slice(i, i + chunkSize);

        const results = await Promise.all(
            chunk.map(async (acc) => {

                const steamId = await extractSteamID(acc.steamInput);
                if (!steamId) return null;

                const data = await fetchProfileWithRetry(steamId, 2);

                return { acc, steamId, data };
            })
        );

        for (const r of results) {

            if (!r) continue;

            const { acc, steamId, data } = r;

            checked++;

            if (!data || data.apiDown) continue;

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
            // BAN LOGIC (ROBUST)
            // ─────────────────────────────
            const bans = data.ban_info ?? {};

            const vacBanCount = Number(
                bans.number_of_vac_bans ?? bans.NumberOfVACBans ?? 0
            );

            const gameBanCount = Number(
                bans.number_of_game_bans ?? bans.NumberOfGameBans ?? 0
            );

            const vacBanned = vacBanCount > 0;
            const gameBanned = gameBanCount > 0;

            const communityBanned = Boolean(
                bans.community_banned ?? bans.CommunityBanned ?? false
            );

            const daysSinceBan =
                bans.days_since_last_ban ??
                bans.daysSinceLastBan ??
                null;

            const isBanned =
                vacBanned || gameBanned || communityBanned;

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
            const statusParts = [];

            if (vacBanned) statusParts.push("⛔ VAC BAN");
            if (gameBanned) statusParts.push("🟧 GAME BAN");
            if (communityBanned) statusParts.push("🟪 COMMUNITY BAN");

            const status =
                statusParts.length ? statusParts.join(" | ") : "🟢 CLEAN";

            const color = isBanned ? 0xff3b3b : 0x2ecc71;

            // ─────────────────────────────
            // BUTTONS
            // ─────────────────────────────
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`remove_${acc.id}`)
                    .setLabel("Remove")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setLabel("Steam Profile")
                    .setStyle(ButtonStyle.Link)
                    .setURL(profileUrl)
            );

            // ─────────────────────────────
            // EMBED
            // ─────────────────────────────
            const embed = new EmbedBuilder()
                .setTitle(`👤 ${nickname}`)
                .setURL(profileUrl)
                .setThumbnail(avatar)
                .setColor(color)
                .setDescription(`## ${status}`)
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

            await new Promise(r => setTimeout(r, 100));
        }
    }

    // ─────────────────────────────
    // SUMMARY
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