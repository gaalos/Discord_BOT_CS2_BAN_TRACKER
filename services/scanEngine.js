require("dotenv").config();

const axios = require("axios");
const db = require("../db");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

// ─────────────────────────────
// THREAD CONFIG
// ─────────────────────────────
const THREADS = Math.max(1, parseInt(process.env.THREADS ?? "2", 10));

// ─────────────────────────────
// UTILS
// ─────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────
// STEAM RESOLVER
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
                { timeout: 10000 }
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
// VALIDATION
// ─────────────────────────────
function isValidProfile(data) {
    return data && typeof data === "object" && !Array.isArray(data);
}

// ─────────────────────────────
// FETCH WITH RETRY
// ─────────────────────────────
async function fetchProfileWithRetry(steamId, retries = 2) {

    for (let i = 0; i <= retries; i++) {
        try {
            const res = await axios.get(
                `https://vac-ban.com/player-stats-api/player/${steamId}`,
                {
                    timeout: 25000,
                    validateStatus: () => true
                }
            );

            if (res.status !== 200) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = res.data;

            if (!data || typeof data !== "object") {
                throw new Error("Invalid response");
            }

            return data;

        } catch (err) {
            if (i < retries) {
                await sleep(1200);
                continue;
            }

            return {
                apiDown: true,
                error: err.message
            };
        }
    }
}

// ─────────────────────────────
// BAN FIX RETRY
// ─────────────────────────────
async function ensureBanInfo(steamId, data, retries = 3) {

    let current = data;

    for (let i = 0; i < retries; i++) {

        if (current?.ban_info) return current;

        await sleep(1000);

        const retry = await fetchProfileWithRetry(steamId, 1);

        if (retry?.ban_info) return retry;

        current = retry;
    }

    return null;
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

    const total = tracked.length;

    let currentIndex = 0;
    let checked = 0;
    let banned = 0;
    let clean = 0;

    let invalidSteam = 0;
    let apiFailed = 0;
    let retryCount = 0;

    const recentBans = [];
    const errorLogs = [];

    let inProgress = 0;

    // ─────────────────────────────
    // LIVE MESSAGE
    // ─────────────────────────────
    const liveMessage = await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("📡 SCAN EN COURS")
                .setColor(0x5865f2)
                .setDescription("Initialisation...")
        ]
    });

    const updateLive = async (status) => {

        const remaining = total - checked - invalidSteam - apiFailed;

        await liveMessage.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📡 SCAN EN COURS")
                    .setColor(0x5865f2)
                    .setDescription(
                        `📦 Total: **${total}**\n` +
                        `🔄 Checked: **${checked}**\n` +
                        `⏳ Remaining: **${Math.max(0, remaining)}**\n\n` +

                        `🧵 Threads: **${THREADS}**\n` +
                        `⚙️ Active: **${inProgress}**\n` +
                        `🔁 Retries: **${retryCount}**\n\n` +

                        `❌ Invalid Steam: **${invalidSteam}**\n` +
                        `⚠️ API Failed: **${apiFailed}**\n\n` +

                        `⛔ Banned: **${banned}**\n` +
                        `🟢 Clean: **${clean}**\n\n` +

                        `📡 Status: **${status}**`
                    )
            ]
        });
    };

    // ─────────────────────────────
    // WORKER POOL (SAFE)
    // ─────────────────────────────
    const worker = async () => {

        while (true) {

            const i = currentIndex++;
            if (i >= tracked.length) return;

            const acc = tracked[i];
            inProgress++;

            try {

                const steamId = await extractSteamID(acc.steamInput);

                if (!steamId) {
                    invalidSteam++;
                    errorLogs.push(`❌ INVALID STEAM → ${acc.steamInput}`);
                    continue;
                }

                let data = await fetchProfileWithRetry(steamId, 2);

                if (data?.apiDown) {
                    apiFailed++;
                    errorLogs.push(`⚠️ API FAIL → ${steamId} (${data.error})`);
                    continue;
                }

                if (!data?.ban_info) {
                    retryCount++;
                    data = await ensureBanInfo(steamId, data, 3);

                    if (!data?.ban_info) {
                        errorLogs.push(`⚠️ NO BAN INFO → ${steamId}`);
                        continue;
                    }
                }

                checked++;

                const bans = data.ban_info;

                const vac = Number(bans.number_of_vac_bans ?? 0) > 0;
                const game = Number(bans.number_of_game_bans ?? 0) > 0;
                const comm = Boolean(bans.community_banned);

                const isBanned = vac || game || comm;

                const nickname =
                    data.nickname ||
                    data.csstatsgg?.name ||
                    "Unknown Player";

                const profileUrl =
                    data.profile_url ||
                    `https://steamcommunity.com/profiles/${steamId}/`;

                const avatar =
                    data.avatar_url ||
                    data.csstatsgg?.avatar ||
                    null;

                if (isBanned) {
                    banned++;
                    recentBans.push({
                        nickname,
                        profileUrl,
                        days: bans.days_since_last_ban
                    });
                } else {
                    clean++;
                }

                const statusParts = [];
                if (vac) statusParts.push("⛔ VAC");
                if (game) statusParts.push("🟧 GAME");
                if (comm) statusParts.push("🟪 COMM");

                const status = statusParts.length ? statusParts.join(" | ") : "🟢 CLEAN";

                const embed = new EmbedBuilder()
                    .setTitle(`👤 ${nickname}`)
                    .setURL(profileUrl)
                    .setThumbnail(avatar)
                    .setColor(isBanned ? 0xff3b3b : 0x2ecc71)
                    .setDescription(`## ${status}`)
                    .addFields(
                        { name: "SteamID", value: `\`${steamId}\``, inline: true },
                        { name: "VAC", value: vac ? "YES" : "NO", inline: true },
                        { name: "Game", value: game ? "YES" : "NO", inline: true },
                        { name: "Community", value: comm ? "YES" : "NO", inline: true },
                        {
                            name: "Last Ban",
                            value: bans.days_since_last_ban != null
                                ? `${bans.days_since_last_ban} days`
                                : "N/A",
                            inline: false
                        }
                    )
                    .setFooter({ text: "CS2 Tracker System" })
                    .setTimestamp();

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

                await channel.send({ embeds: [embed], components: [row] });

                await sleep(80);

                await updateLive(`Processing ${checked}/${total}`);

            } catch (e) {
                errorLogs.push(`❌ CRASH → ${steamId || "unknown"} → ${e.message}`);
            } finally {
                inProgress--;
            }
        }
    };

    // ─────────────────────────────
    // START THREADS
    // ─────────────────────────────
    await Promise.all(
        Array.from({ length: THREADS }, () => worker())
    );

    // ─────────────────────────────
    // FINAL
    // ─────────────────────────────
    await liveMessage.edit({
        embeds: [
            new EmbedBuilder()
                .setTitle("✅ SCAN TERMINÉ")
                .setColor(0x2ecc71)
                .setDescription(
                    `📦 Total: **${total}**\n` +
                    `🔄 Checked: **${checked}**\n` +
                    `⛔ Banned: **${banned}**\n` +
                    `🟢 Clean: **${clean}**\n\n` +
                    `⚠️ API Failed: **${apiFailed}**\n` +
                    `❌ Invalid Steam: **${invalidSteam}**`
                )
        ]
    });

    return { checked, banned, clean };
}

module.exports = { runScan };