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

            const idMatch = res.data.match(
                /<steamID64>(\d{17})<\/steamID64>/
            );

            return idMatch ? idMatch[1] : null;

        } catch {
            return null;
        }
    }

    return null;
}

// ─────────────────────────────
// SAFE API FETCH
// ─────────────────────────────
async function fetchProfile(steamId) {

    try {

        const res = await axios.get(
            `https://cscheck.in/api/profile/${steamId}`,
            {
                timeout: 10000,
                validateStatus: () => true
            }
        );

        if (res.status !== 200) return null;

        return res.data;

    } catch {
        return null;
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

    let channel;

    try {
        channel = await client.channels.fetch(config.channelId);
    } catch {
        return;
    }

    const tracked = db.prepare(`
        SELECT * FROM tracked
    `).all();

    let checked = 0;
    let newlyBanned = 0;
    let stillBanned = 0;
    let clean = 0;

    const recentBansRanking = [];

    for (const acc of tracked) {

        const steamId = await extractSteamID(acc.steamInput);

        if (!steamId) continue;

        const data = await fetchProfile(steamId);

        if (!data) continue;

        const profile = data?.profile || {};
        const bans = data?.bans || {};

        const vac = bans.vac || {};
        const gameBan = bans.gameBan || {};
        const faceIT = bans.faceIT || {};

        const isBanned =
            vac.banned ||
            gameBan.banned ||
            faceIT.banned;

        const wasBanned = acc.isBanned === 1;

        const profileUrl =
            profile.profileUrl ||
            `https://steamcommunity.com/profiles/${steamId}/`;

        const avatar =
            profile.avatarUrl ||
            profile.avatar ||
            null;

        const nickname =
            profile.nickname ||
            "Unknown Player";

        checked++;

        // ─────────────────────────────
        // STATS
        // ─────────────────────────────
        if (isBanned) {

            if (wasBanned) {
                stillBanned++;
            } else {
                newlyBanned++;
            }

        } else {
            clean++;
        }

        // ─────────────────────────────
        // UPDATE DB
        // ─────────────────────────────
        if (isBanned && !wasBanned) {

            db.prepare(`
                UPDATE tracked
                SET isBanned = 1
                WHERE id = ?
            `).run(acc.id);
        }

        // ─────────────────────────────
        // DAYS SINCE BAN
        // ─────────────────────────────
        const days =
            vac.daysSinceLastBan ??
            gameBan.daysSinceLastBan ??
            null;

        // ─────────────────────────────
        // STATUS + COLOR
        // ─────────────────────────────
        let color = 0x2ecc71;
        let status = "🟢 CLEAN ACCOUNT";

        if (isBanned) {

            if (days !== null && days < 7) {

                color = 0xff3b3b;

                status =
                    `🔴 RECENT BAN (${days}j ago)`;

            } else {

                color = 0xffa500;

                status = days !== null
                    ? `🟠 BANNED (${days}j ago)`
                    : `🟠 BANNED`;
            }
        }

        // ─────────────────────────────
        // DETAILS
        // ─────────────────────────────
        const details = [];

        if (vac.banned) {

            details.push(
                `🟥 VAC BAN`
            );

            details.push(
                `└ Bans: ${vac.numberOfBans || 1}`
            );

            if (days !== null) {

                details.push(
                    `└ Last ban: ${days} days ago`
                );
            }
        }

        if (gameBan.banned) {

            details.push(
                `🟧 GAME BAN`
            );

            details.push(
                `└ Bans: ${gameBan.numberOfBans || 1}`
            );

            if (gameBan.daysSinceLastBan) {

                details.push(
                    `└ Last game ban: ${gameBan.daysSinceLastBan} days ago`
                );
            }
        }

        if (faceIT.banned) {

            details.push(
                `🟪 FACEIT BAN`
            );
        }

        // ─────────────────────────────
        // RECENT RANKING
        // ─────────────────────────────
        if (isBanned && days !== null && days < 7) {

            recentBansRanking.push({
                name: nickname,
                days,
                avatar,
                url: profileUrl
            });
        }

        // ─────────────────────────────
        // BUTTONS
        // ─────────────────────────────
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`remove_${acc.id}`)
                    .setLabel("Remove")
                    .setStyle(ButtonStyle.Danger)
            );

        // ─────────────────────────────
        // EMBED
        // ─────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle(`👤 ${nickname}`)
            .setURL(profileUrl)
            .setThumbnail(avatar)
            .setColor(color)

            .setDescription(
                `## [${status}](${profileUrl})\n\n` +
                `🔗 [Open Steam Profile](${profileUrl})`
            )

            .addFields(
                {
                    name: "Steam",
                    value: `[${steamId}](${profileUrl})`,
                    inline: true
                },
                {
                    name: "Ban Details",
                    value: details.join("\n") || "No bans",
                    inline: false
                }
            )

            .setFooter({
                text: "CS2 Tracker System"
            })

            .setTimestamp();

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        // ANTI RATE LIMIT
        await new Promise(r => setTimeout(r, 300));
    }

    // ─────────────────────────────
    // SUMMARY
    // ─────────────────────────────
    const summary = new EmbedBuilder()

        .setTitle("📊 SCAN SUMMARY")

        .setColor(0x5865f2)

        .setDescription(
            `🔍 Checked: **${checked}**\n` +
            `🔴 New bans: **${newlyBanned}**\n` +
            `🟠 Still banned: **${stillBanned}**\n` +
            `🟢 Clean: **${clean}**`
        )

        .setTimestamp();

    await channel.send({
        embeds: [summary]
    });

    // ─────────────────────────────
    // RECENT BAN RANKING
    // ─────────────────────────────
    if (recentBansRanking.length > 0) {

        recentBansRanking.sort(
            (a, b) => a.days - b.days
        );

        const top =
            recentBansRanking.slice(0, 5);

        const ranking = new EmbedBuilder()

            .setTitle("🔥 RECENT BANS")

            .setColor(0xff3b3b)

            .setDescription(
                top.map((u, i) =>
                    `**${i + 1}.** [${u.name}](${u.url}) • **${u.days}j ago**\n${u.avatar}`
                ).join("\n\n")
            )

            .setTimestamp();

        await channel.send({
            embeds: [ranking]
        });
    }

    return {
        checked,
        newlyBanned,
        stillBanned,
        clean
    };
}

module.exports = {
    runScan
};