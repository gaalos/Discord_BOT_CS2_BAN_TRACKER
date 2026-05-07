const axios = require("axios");
const db = require("../db");
const { 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

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

// 🔥 API SAFE
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

async function runScan(client, guildId) {

    const config = db.prepare(`
        SELECT channelId FROM guild_config WHERE guildId = ?
    `).get(guildId);

    if (!config?.channelId) return;

    const channel = await client.channels.fetch(config.channelId);
    const tracked = db.prepare("SELECT * FROM tracked").all();

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

        const avatar = profile.avatarUrl || profile.avatar;
        const nickname = profile.nickname || "Unknown Player";

        checked++;

        if (isBanned) {
            wasBanned ? stillBanned++ : newlyBanned++;
        } else {
            clean++;
        }

        if (isBanned && !wasBanned) {
            db.prepare(`UPDATE tracked SET isBanned = 1 WHERE id = ?`)
                .run(acc.id);
        }

        const days = vac.daysSinceLastBan ?? null;

        let color = 0x2ecc71;
        let status = "🟢 CLEAN ACCOUNT";

        if (isBanned) {
            if (days !== null && days < 7) {
                color = 0xff3b3b;
                status = `🔴 RECENT BAN (${days}j ago)`;
            } else {
                color = 0xffa500;
                status = days !== null
                    ? `🟠 BANNED (${days}j ago)`
                    : `🟠 BANNED`;
            }
        }

        // 🧠 recent ranking
        if (vac.banned && days !== null && days < 7) {
            recentBansRanking.push({
                name: nickname,
                days,
                avatar,
                url: profileUrl
            });
        }

        // 🔘 REMOVE BUTTON
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`remove_${acc.id}`)
                .setLabel("Remove account")
                .setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setTitle(`👤 ${nickname}`)
            .setURL(profileUrl)
            .setThumbnail(avatar)
            .setColor(color)
            .setDescription(`**${status}**`)
            .setFooter({ text: "CS2 Tracker System" })
            .setTimestamp();

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        await new Promise(r => setTimeout(r, 300));
    }

    // 📊 SUMMARY
    const summary = new EmbedBuilder()
        .setTitle("📊 CS2 SCAN REPORT")
        .setColor(0x5865f2)
        .addFields(
            { name: "🔍 Checked", value: `${checked}`, inline: true },
            { name: "🔴 New bans", value: `${newlyBanned}`, inline: true },
            { name: "🟠 Still banned", value: `${stillBanned}`, inline: true },
            { name: "🟢 Clean", value: `${clean}`, inline: true }
        )
        .setTimestamp();

    await channel.send({ embeds: [summary] });

    // 🔥 RECENT RANKING
    if (recentBansRanking.length > 0) {

        recentBansRanking.sort((a, b) => a.days - b.days);

        const top = recentBansRanking.slice(0, 5);

        const embed = new EmbedBuilder()
            .setTitle("🔥 RECENT BANS RANKING")
            .setColor(0xff3b3b)
            .setDescription(
                top.map((u, i) =>
                    `**${i + 1}.** [${u.name}](${u.url}) • ${u.days}j ago\n${u.avatar}`
                ).join("\n\n")
            )
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }

    return { checked, newlyBanned, stillBanned, clean };
}

module.exports = { runScan };