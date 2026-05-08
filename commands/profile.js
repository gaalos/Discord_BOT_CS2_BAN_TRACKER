const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Analyse CS2 FULL LEGIT CHECK')
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('SteamID64 / Steam link')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const input = interaction.options.getString('url');

        // ─────────────────────────────
        // STEAM ID RESOLUTION (UPDATED)
        // ─────────────────────────────
        const extractSteamID = (input) => {
            if (/^\d{17}$/.test(input)) return input;
            const m = input.match(/(\d{17})/);
            return m ? m[1] : null;
        };

        const resolveSteamVanity = async (name) => {
            try {
                const res = await axios.get(
                    `https://steamcommunity.com/id/${name}?xml=1`,
                    { timeout: 10000 }
                );

                const xml = res.data;

                const match = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
                return match ? match[1] : null;

            } catch (e) {
                return null;
            }
        };

        let steamID = extractSteamID(input);

        if (!steamID) {
            const cleanName = input
                .replace("https://steamcommunity.com/id/", "")
                .replace("https://steamcommunity.com/profiles/", "")
                .replace("/", "")
                .trim();

            steamID = await resolveSteamVanity(cleanName);
        }

        if (!steamID) {
            return interaction.editReply("❌ SteamID invalide ou vanity introuvable.");
        }

        try {
            const res = await axios.get(
                `https://vac-ban.com/player-stats-api/player/${steamID}`,
                { timeout: 12000 }
            );

            const data = res.data;

            const cs = data.csstatsgg || {};
            const stats = cs.stats || {};
            const faceit = data.faceit || {};
            const scope = data.scopegg || {};
            const bans = data.ban_info || {};
            const cheat = data.gauges?.cheating_details || {};
            const signals = cheat.signals || {};
            const redFlags = cheat.red_flags || [];
            const cheatTypes = data.gauges?.cheat_types || {};

            const cheatingGauge = data.gauges?.cheating ?? 0;
            const cheatingPercent = typeof cheatingGauge === "object"
                ? (cheatingGauge.value ?? 0)
                : (cheatingGauge ?? 0);

            const kd = stats.kd ?? 0;
            const wr = stats.winrate ?? 0;
            const hs = stats.hs ?? 0;
            const matches = stats.matches ?? 0;

            const faceitLevel = faceit.cs2?.skill_level ?? 0;
            const faceitElo = faceit.cs2?.elo ?? 0;

            const rating = scope.basic_stats?.rating_21?.current ?? 0;
            const kast = scope.basic_stats?.kast?.current ?? 0;
            const adr = scope.basic_stats?.adr?.current ?? 0;
            const kpr = scope.basic_stats?.kpr?.current ?? 0;

            const scopeKD = scope.kd?.current ?? 0;
            const scopeWR = (scope.winrate?.current ?? 0) * 100;

            const rifleAcc = scope.aim_stats?.rifle?.accuracy?.value ?? 0;
            const rifleHS = scope.aim_stats?.rifle?.headshot_percentage?.value ?? 0;
            const sniperAcc = scope.aim_stats?.sniper?.accuracy?.value ?? 0;

            const ttkSec = scope.aim_stats?.rifle?.time_to_kill?.upper_bound ?? 0;
            const ttk = Math.round(ttkSec * 1000);

            const ranks = cs.ranks || [];
            const premier = ranks.find(r => r.mode?.type === "Premier");

            const premierRating = premier?.rank ?? 0;
            const premierBest = premier?.best_rank ?? premierRating;
            const premierWins = premier?.wins ?? 0;
            const premierSeason = premier?.mode?.season ?? "N/A";

            const mmRanks = ranks
                .filter(r => r.mode?.type === "Matchmaking")
                .slice(0, 4)
                .map(r => `• ${r.mode.map || "map"}: **rank ${r.rank}**`)
                .join("\n") || "No data";

            const vacBan =
                bans.vac_banned === true ||
                bans.VACBanned === true;

            const gameBan =
                (bans.number_of_game_bans ?? bans.NumberOfGameBans ?? 0) > 0;

            const communityBan =
                bans.community_banned === true ||
                bans.CommunityBanned === true;

            const anyBan = vacBan || gameBan || communityBan;

            const lastBanDays =
                bans.days_since_last_ban ??
                bans.DaysSinceLastBan ??
                null;

            // ─────────────────────────────
            // SCORE AI
            // ─────────────────────────────
            let score = 100;
            let color;


            if (anyBan) {
                score = 0;
            } else {

                score -= cheatingPercent * 2.2;

                const signalPenalty = [
                    signals.hs?.score01 || 0,
                    signals.kd?.score01 || 0,
                    signals.adr?.score01 || 0,
                    signals.winrate?.score01 || 0,
                    signals.leetify_aim?.score01 || 0,
                    signals.scopegg_ttk?.score01 || 0,
                    signals.recent_matches?.score01 || 0,
                    signals.weapon_dominance?.score01 || 0,
                    signals.rank_mismatch?.score01 || 0,
                    signals.trend?.score01 || 0,
                    signals.association?.score01 || 0
                ].reduce((a, b) => a + (b || 0), 0);

                score -= signalPenalty * 45;
                score -= (redFlags?.length || 0) * 15;

                score = Math.max(0, Math.min(100, score));
            }

            let status;

            if (anyBan) status = "⛔ BANNED";
            else if (score >= 80) status = "🟢 LEGIT";
            else if (score >= 60) status = "🟡 CLEAN / WATCH";
            else if (score >= 40) status = "🟠 SUSPICIOUS";
            else status = "🔴 HIGH RISK";

            // ─────────────────────────────
            // RED FLAGS
            // ─────────────────────────────
            const formattedRedFlags = redFlags.length
                ? redFlags.map(flag => {
                    const title = flag?.title || flag?.id || "Unknown flag";
                    const severity = flag?.severity || "low";
                    const explanation = flag?.explanation || "";

                    const emoji =
                        severity === "high" ? "🔴" :
                        severity === "medium" ? "🟠" :
                        "🟡";

                    return `${emoji} **${title}**\n_${explanation}_`;
                }).join("\n\n")
                : "🟢 Aucun flag détecté";

            // ─────────────────────────────
            // CHEAT TYPES
            // ─────────────────────────────
            const formattedCheatTypes = Object.keys(cheatTypes).length
                ? Object.entries(cheatTypes)
                    .map(([key, value]) => {
                        const percent = (value * 100).toFixed(1);

                        const emoji =
                            value >= 0.15 ? "🔴" :
                            value >= 0.08 ? "🟠" :
                            value > 0 ? "🟡" :
                            "🟢";

                        return `${emoji} **${key}**: ${percent}%`;
                    })
                    .join("\n")
                : "🟢 Aucun signal détecté";
            if (anyBan) {
                color = 0xff0000; // rouge
            } else if (score >= 80) {
                color = 0x00ff00; // vert
            } else if (score >= 60) {
                color = 0xffff00; // jaune
            } else if (score >= 40) {
                color = 0xffa500; // orange
            } else {
                color = 0xff0000; // rouge HIGH RISK
            }

            // ─────────────────────────────
            // EMBED
            // ─────────────────────────────
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle("🧠 CS2 FULL LEGIT ANALYSIS")
                .setThumbnail(data.avatar_url || null)
                .setDescription(`SteamID: \`${steamID}\``)

                .addFields(
                    {
                        name: "📊 Core",
                        value: `KD: **${kd}**\nWR: **${wr}%**\nHS: **${hs}%**\nMatches: **${matches}**`,
                        inline: true
                    },
                    {
                        name: "🎮 Faceit",
                        value: `Level: **${faceitLevel}**\nELO: **${faceitElo}**`,
                        inline: true
                    },
                    {
                        name: "🏆 Premier",
                        value: `Season: **${premierSeason}**\nRating: **${premierRating}**\nBest: **${premierBest}**\nWins: **${premierWins}**`,
                        inline: true
                    },
                    {
                        name: "🎯 Matchmaking",
                        value: mmRanks,
                        inline: true
                    },
                    {
                        name: "📈 Scope",
                        value: `Rating: **${rating.toFixed(2)}**\nKAST: **${kast.toFixed(1)}%**\nADR: **${adr.toFixed(1)}**\nKPR: **${kpr.toFixed(2)}**\nKD: **${scopeKD.toFixed(2)}**\nWR: **${scopeWR.toFixed(1)}%**`,
                        inline: true
                    },
                    {
                        name: "🎯 Aim",
                        value: `TTK: **${ttk} ms**\nRifle ACC: **${(rifleAcc * 100).toFixed(1)}%**\nHS: **${(rifleHS * 100).toFixed(1)}%**\nSniper: **${(sniperAcc * 100).toFixed(1)}%**`,
                        inline: true
                    },
                    {
                        name: "🚨 Cheating Probability",
                        value: `**${cheatingPercent.toFixed(1)}%**`,
                        inline: true
                    },
                    {
                        name: "🚨 Ban Status",
                        value:
                            `VAC Ban: **${vacBan ? "⛔ YES" : "✅ NO"}**\n` +
                            `Game Ban: **${gameBan ? "⛔ YES" : "✅ NO"}**\n` +
                            `Community Ban: **${communityBan ? "⛔ YES" : "✅ NO"}**\n` +
                            `Last Ban: **${lastBanDays ?? "N/A"} days ago**\n` +
                            `Status: **${anyBan ? "⛔ BANNED" : "🟢 CLEAN"}**`,
                        inline: true
                    },
                    {
                        name: "🧠 AI Signals",
                        value:
                            `HS: **${signals.hs?.value ?? "N/A"}**\nKD: **${signals.kd?.value ?? "N/A"}**\nADR: **${signals.adr?.value ?? "N/A"}**\nWR: **${signals.winrate?.value ?? "N/A"}**\nAim: **${signals.leetify_aim?.value ?? "N/A"}**`,
                        inline: true
                    },
                    {
                        name: "🚩 Red Flags",
                        value: formattedRedFlags,
                        inline: false
                    },
                    {
                        name: "🧠 Score",
                        value: `**${score.toFixed(1)}/100**\nStatus: **${status}**`,
                        inline: false
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            return interaction.editReply("❌ API error.");
        }
    }
};