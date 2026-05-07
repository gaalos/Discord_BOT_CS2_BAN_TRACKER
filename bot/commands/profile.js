const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Analyse un profil CS2 (LEGIT CHECK PRO)')
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('SteamID64 / Steam / CS2Tracker')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const input = interaction.options.getString('url');

        // ─────────────────────────────
        // STEAM XML RESOLVER
        // ─────────────────────────────
        async function extractSteamID(input) {
            if (/^\d{17}$/.test(input)) return input;

            let match = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
            if (match) return match[1];

            match = input.match(/cs2tracker\.org\/profile\/(\d{17})/);
            if (match) return match[1];

            match = input.match(/steamcommunity\.com\/id\/([^\/?#]+)/);
            if (match) {
                const vanity = match[1];

                try {
                    const res = await axios.get(
                        `https://steamcommunity.com/id/${vanity}/?xml=1`
                    );

                    const idMatch = res.data.match(/<steamID64>(\d{17})<\/steamID64>/);

                    return idMatch ? idMatch[1] : null;

                } catch (err) {
                    console.error("Steam XML error:", err.message);
                    return null;
                }
            }

            return null;
        }

        const steamID = await extractSteamID(input);

        if (!steamID) {
            return interaction.editReply("❌ SteamID invalide.");
        }

        try {
            const [trackerRes, csCheckRes] = await Promise.allSettled([
                axios.get(`https://cs2tracker.org/api/player/${steamID}`),
                axios.get(`https://cscheck.in/api/profile/${steamID}`)
            ]);

            if (trackerRes.status !== "fulfilled") {
                throw new Error("CS2Tracker unavailable");
            }

            const data = trackerRes.value.data;
            const csCheck = csCheckRes.status === "fulfilled"
                ? csCheckRes.value.data
                : {};

            const cs = data.csstatsgg || {};
            const stats = cs.stats || {};
            const faceit = data.faceit || {};
            const gauges = data.gauges || {};
            const cheat = gauges.cheating_details || {};
            const scope = data.scopegg || {};
            const bans = csCheck.bans || {};

            // ─────────────────────────────
            // CORE
            // ─────────────────────────────
            const kd = stats.kd ?? 0;
            const winrate = stats.winrate ?? 0;
            const hs = stats.hs ?? 0;
            const matches = stats.matches ?? 0;

            // ─────────────────────────────
            // FACEIT
            // ─────────────────────────────
            const faceitLevel = faceit.cs2?.skill_level ?? 0;
            const faceitElo = faceit.cs2?.elo ?? 0;

            // ─────────────────────────────
            // BAN STATUS
            // ─────────────────────────────
            const vacBan = bans.vac?.banned === true;
            const gameBan = bans.gameBan?.banned === true;
            const faceitBan = bans.faceIT?.banned === true;

            const anyBan = vacBan || gameBan || faceitBan;

            const lastBanDays =
                (bans.vac?.daysSinceLastBan > 0 && bans.vac?.daysSinceLastBan) ||
                (bans.gameBan?.daysSinceLastBan > 0 && bans.gameBan?.daysSinceLastBan) ||
                "N/A";

            // ─────────────────────────────
            // CHEAT
            // ─────────────────────────────
            const cheatPercent = cheat.percent ?? 0;
            const cheatTypes = cheat.cheat_types || {};

            const aimAssist = ((cheatTypes.aim_assist ?? 0) * 100).toFixed(1);
            const infoAssist = ((cheatTypes.info_assist ?? 0) * 100).toFixed(1);
            const triggerLike = ((cheatTypes.trigger_like ?? 0) * 100).toFixed(1);
            const reactionAnomaly = ((cheatTypes.reaction_anomaly ?? 0) * 100).toFixed(1);

            // ─────────────────────────────
            // RED FLAGS (RESTORED FIX)
            // ─────────────────────────────
            const redFlags = Array.isArray(cheat.red_flags) ? cheat.red_flags : [];

            const redFlagsText = redFlags.length
                ? redFlags.slice(0, 5)
                    .map((f, i) => {
                        const emoji =
                            f.severity === "high" ? "🔴" :
                            f.severity === "medium" ? "🟠" : "🟡";

                        return `${i + 1}. ${emoji} **${f.title || f.id}**`;
                    })
                    .join("\n")
                : "🟢 Aucun flag détecté";

            // ─────────────────────────────
            // SCOPE.GG
            // ─────────────────────────────
            const rating = scope.basic_stats?.rating_21?.current ?? 0;
            const kast = scope.basic_stats?.kast?.current ?? 0;
            const adr = scope.basic_stats?.adr?.current ?? 0;
            const kpr = scope.basic_stats?.kpr?.current ?? 0;

            const scopeKD = scope.kd?.current ?? 0;

            const scopeWRraw = scope.winrate?.current ?? 0;
            const scopeWR = scopeWRraw <= 1 ? scopeWRraw * 100 : scopeWRraw;

            const mmScore = scope.matchmaking?.score ?? scope.matchmaking_score ?? null;

            // ─────────────────────────────
            // PREMIER RANK
            // ─────────────────────────────
            const premier = cs.ranks?.find(r => r?.mode?.type === "Premier") || cs.ranks?.[0];

            const csRating = premier?.rank ?? 0;
            const bestRating = premier?.best_rank ?? csRating;
            const wins = premier?.wins ?? 0;
            const season = premier?.mode?.season ?? "N/A";

            function rankColor(r) {
                if (!r) return "⚪";
                if (r < 5000) return "🔴";
                if (r < 12000) return "🟡";
                if (r < 18000) return "🟢";
                if (r < 22000) return "🔵";
                return "🟣";
            }

            // ─────────────────────────────
            // AIM
            // ─────────────────────────────
            const rifleAcc = scope.aim_stats?.rifle?.accuracy?.value ?? 0;
            const rifleHS = scope.aim_stats?.rifle?.headshot_percentage?.value ?? 0;
            const rifleFB = scope.aim_stats?.rifle?.first_bullet_accuracy?.value ?? 0;
            const sniperAcc = scope.aim_stats?.sniper?.accuracy?.value ?? 0;

            const ttk = scope.aim_stats?.rifle?.time_to_kill?.upper_bound ?? 0;
            const ttkMs = Math.round(ttk * 1000);

            // ─────────────────────────────
            // PLAYSTYLE
            // ─────────────────────────────
            const aim = scope.pie_stats?.aim?.current ?? 0;
            const utility = scope.pie_stats?.utility?.current ?? 0;
            const trade = scope.pie_stats?.trade_rating?.current ?? 0;

            // ─────────────────────────────
            // SCORE
            // ─────────────────────────────
            let score = 100;

            if (anyBan) {
                score = 0;
            } else {
                score -= cheatPercent * 0.9;
                if (kd > 1.5) score -= 8;
                if (kd < 0.6) score += 5;
                if (winrate > 65) score -= 6;
                if (hs > 60) score -= 5;
                if (matches > 500) score += 5;
                if (scopeKD > 1.3) score -= 5;

                score = Math.max(0, Math.min(100, score));
            }

            let status = "🟢 LEGIT";
            if (score < 70) status = "🟠 SUSPICIOUS";
            if (score < 45) status = "🔴 HIGH RISK";
            if (anyBan) status = "⛔ BANNED";

            const name = cs.name || steamID;

            // ─────────────────────────────
            // EMBED
            // ─────────────────────────────
            const embed = new EmbedBuilder()
                .setColor(anyBan ? 0xff0000 : score > 70 ? 0x00ff00 : score > 45 ? 0xffa500 : 0xff0000)
                .setTitle("🧠 CS2 LEGIT ANALYSIS")
                .setDescription(`Player: **${name}**\nSteamID: \`${steamID}\``)
                .setThumbnail(cs.avatar || null)

                .addFields(
                    {
                        name: "📊 Core",
                        value: `KD: **${kd}**\nWR: **${winrate}%**\nHS: **${hs}%**`,
                        inline: true
                    },
                    {
                        name: "🎮 Faceit",
                        value: `Level: **${faceitLevel}**\nELO: **${faceitElo}**`,
                        inline: true
                    },
                    {
                        name: "🏆 Premier Rating",
                        value:
                            `Season: **${season}**\n` +
                            `Rating: **${rankColor(csRating)} ${csRating}**\n` +
                            `Best: **${bestRating}**\n` +
                            `Wins: **${wins}**`,
                        inline: true
                    },

                    {
                        name: "📈 Scope.gg",
                        value:
                            `Rating 21: **${rating.toFixed(2)}**\n` +
                            `KAST: **${kast.toFixed(1)}%**\n` +
                            `ADR: **${adr.toFixed(1)}**\n` +
                            `KPR: **${kpr.toFixed(2)}**\n` +
                            `KD: **${scopeKD.toFixed(2)}**\n` +
                            `WR: **${scopeWR.toFixed(1)}%**`,
                        inline: true
                    },
                    {
                        name: "🎯 Aim",
                        value:
                            `Rifle ACC: **${(rifleAcc * 100).toFixed(1)}%**\n` +
                            `HS: **${(rifleHS * 100).toFixed(1)}%**\n` +
                            `1st Bullet: **${(rifleFB * 100).toFixed(1)}%**\n` +
                            `Sniper: **${(sniperAcc * 100).toFixed(1)}%**\n` +
                            `TTK: **${ttkMs} ms**`,
                        inline: true
                    },
                    {
                        name: "🎯 Matchmaking",
                        value: mmScore ? `Score: **${mmScore}**` : "Score: N/A",
                        inline: true
                    },

                    {
                        name: "🚨 Ban",
                        value:
                            `VAC: **${vacBan ? "⛔" : "✅"}**\n` +
                            `Game: **${gameBan ? "⛔" : "✅"}**\n` +
                            `FaceIT: **${faceitBan ? "⛔" : "✅"}**\n` +
                            `Last: **${lastBanDays}d**`,
                        inline: true
                    },
                    {
                        name: "🧠 Cheat",
                        value:
                            `Risk: **${cheatPercent}%**\n` +
                            `Aim: **${aimAssist}%**\n` +
                            `Info: **${infoAssist}%**\n` +
                            `Trigger: **${triggerLike}%**`,
                        inline: true
                    },
                    {
                        name: "🚩 Red Flags",
                        value: redFlagsText,
                        inline: false
                    },
                    {
                        name: "🧠 Score",
                        value: `**${score.toFixed(1)}/100**\nStatus: **${status}**`,
                        inline: false
                    }
                )

                .setFooter({ text: "CS2Tracker Legit Analyzer Pro (FULL FIXED VERSION)" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            return interaction.editReply("❌ Erreur API CS2Tracker.");
        }
    }
};