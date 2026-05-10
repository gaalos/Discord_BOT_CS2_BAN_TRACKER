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
        console.log(`Analyse = ${input}`);

        // ─────────────────────────────
        // STEAM RESOLUTION
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

                return res.data.match(/<steamID64>(\d{17})<\/steamID64>/)?.[1] || null;
            } catch {
                return null;
            }
        };

        const fetchSteamXML = async (steamID64) => {
            try {
                const res = await axios.get(
                    `https://steamcommunity.com/profiles/${steamID64}?xml=1`,
                    { timeout: 10000 }
                );

                const xml = res.data;

                return {
                    steamID64: xml.match(/<steamID64>(\d{17})<\/steamID64>/)?.[1] || null,
                    steamID:
                        xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/)?.[1] ||
                        xml.match(/<steamID>(.*?)<\/steamID>/)?.[1] ||
                        null,
                    avatarFull:
                        xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/)?.[1] ||
                        xml.match(/<avatarFull>(.*?)<\/avatarFull>/)?.[1] ||
                        null
                };
            } catch {
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

        // ─────────────────────────────
        // STEAM DATA
        // ─────────────────────────────
        const steamData = await fetchSteamXML(steamID);

        const steamID64 = steamData?.steamID64 || steamID;
        const steamName = steamData?.steamID || "Unknown Steam User";
        const avatarFull = steamData?.avatarFull || null;

        try {
            let data;
            let retries = 0;

            const isBansEmpty = (bans) =>
                !bans || typeof bans !== "object" || Object.keys(bans).length === 0;

            while (retries < 6) {
                try {
                    const res = await axios.get(
                        `https://vac-ban.com/player-stats-api/player/${steamID64}`,
                        { timeout: 16000 }
                    );

                    data = res.data;

                    if (retries > 0) {
                        await new Promise(r => setTimeout(r, 3000));
                    }

                    if (!isBansEmpty(data.ban_info)) break;
                } catch {}
                retries++;
            }

            const nickname = data.nickname || steamName || "Unknown player";
            const avatar = avatarFull || data.avatar_url || null;
            const profile_link = data.profile_url || input;

            const cs = data.csstatsgg || {};
            const stats = cs.stats || {};
            const faceit = data.faceit || {};
            const scope = data.scopegg || {};
            const bans = data.ban_info || {};
            const cheat = data.gauges?.cheating_details || {};
            const signals = cheat.signals || {};

            const redFlags = cheat.red_flags || [];
            const warnFlags = cheat.warnings || [];

            const cheatingGauge = data.gauges?.cheating ?? 0;
            const cheatingPercent =
                typeof cheatingGauge === "object"
                    ? (cheatingGauge.value ?? 0)
                    : (cheatingGauge ?? 0);

            // ─────────────────────────────
            // CORE
            // ─────────────────────────────
            const kd = stats.kd ?? 0;
            const wr = stats.winrate ?? 0;
            const hs = stats.hs ?? 0;
            const matches = stats.matches ?? 0;

            // ─────────────────────────────
            // FACEIT / PREMIER
            // ─────────────────────────────
            const faceitLevel = faceit.cs2?.skill_level ?? 0;
            const faceitElo = faceit.cs2?.elo ?? 0;

            const ranks = cs.ranks || [];
            const premier = ranks.find(r => r.mode?.type === "Premier");

            const premierRating = premier?.rank ?? 0;
            const premierBest = premier?.best_rank ?? premierRating;
            const premierWins = premier?.wins ?? 0;
            const premierSeason = premier?.mode?.season ?? "N/A";

            // ─────────────────────────────
            // SCOPE
            // ─────────────────────────────
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

            // ─────────────────────────────
            // AIM CONTROL
            // ─────────────────────────────
const getAimThresholds = (lvl, prem) => {
    const faceit = (lvl && lvl > 0) ? lvl : null;
    const premier = (prem && prem > 0) ? prem : null;

    // 🔥 Aucun vrai rank compétitif
    if (!faceit && !premier) {
        return {
            aimMax: 78,
            hsMax: 65,
            ttkMin: 230
        };
    }

    // ─────────────────────────────
    // 🔥 FACEIT PRIORITY (prioritaire sur Premier)
    // ─────────────────────────────

    // PRO / très haut niveau
    if (faceit && faceit >= 10) {
        // Faceit 10 + gros Premier = vrai monstre
        if (premier && premier >= 28000) {
            return {
                aimMax: 95,
                hsMax: 82,
                ttkMin: 160
            };
        }

        // Faceit 10 standard
        return {
            aimMax: 95,
            hsMax: 78,
            ttkMin: 170
        };
    }

    // Très haut niveau
    if (faceit && faceit >= 8) {
        return {
            aimMax: 84,
            hsMax: 74,
            ttkMin: 185
        };
    }

    // Bon niveau
    if (faceit && faceit >= 5) {
        return {
            aimMax: 80,
            hsMax: 70,
            ttkMin: 205
        };
    }

    // ─────────────────────────────
    // 🔥 PREMIER fallback seulement si FACEIT absent
    // ─────────────────────────────

    if (premier && premier >= 31000) {
        return {
            aimMax: 95,
            hsMax: 80,
            ttkMin: 165
        };
    }

    if (premier && premier >= 22000) {
        return {
            aimMax: 85,
            hsMax: 74,
            ttkMin: 185
        };
    }

    if (premier && premier >= 18000) {
        return {
            aimMax: 81,
            hsMax: 71,
            ttkMin: 200
        };
    }

    if (premier && premier >= 12000) {
        return {
            aimMax: 78,
            hsMax: 68,
            ttkMin: 210
        };
    }

    // 🔥 Low competitive
    return {
        aimMax: 72,
        hsMax: 62,
        ttkMin: 240
    };
};

const thresholds = getAimThresholds(faceitLevel, premierRating);

let aimPenalty = 0;
let unlegitAIMWarnings = [];

const aimValue = signals.leetify_aim?.value ?? 0;
const hsValueSignal = signals.hs?.value ?? 0;
const kdValueSignal = signals.kd?.value ?? 0;
const adrValueSignal = signals.adr?.value ?? 0;

// 🔥 AIM score (légèrement normalisé pour éviter sur-punition)
if (aimValue > thresholds.aimMax) {
    const diff = aimValue - thresholds.aimMax;
    aimPenalty += diff * 1.6;
    unlegitAIMWarnings.push(`🚨 AIM élevé (${aimValue.toFixed?.(1) ?? aimValue})`);
}

// 🎯 HS check plus progressif
if (hsValueSignal > thresholds.hsMax) {
    const diff = hsValueSignal - thresholds.hsMax;
    aimPenalty += diff * 1.1;
    unlegitAIMWarnings.push(`🎯 HS% suspect (${hsValueSignal.toFixed?.(1) ?? hsValueSignal})`);
}

// 📈 KD check (évite faux positifs bas niveau)
if (kdValueSignal > 1.85 && (faceitLevel ?? 0) <= 6) {
    aimPenalty += 8;
    unlegitAIMWarnings.push(`📈 KD suspect FACEIT lvl ${faceitLevel ?? "N/A"}`);
}

// 💥 ADR check
if (adrValueSignal > 98 && (faceitLevel ?? 0) <= 5) {
    aimPenalty += 6;
    unlegitAIMWarnings.push(`💥 ADR anormalement élevé`);
}

// ⚡ TTK check (plus strict seulement haut lvl)
if (ttk > 0 && ttk < thresholds.ttkMin) {
    const severity = (faceitLevel ?? 0) >= 8 ? 12 : 8;
    aimPenalty += severity;
    unlegitAIMWarnings.push(`⚡ TTK trop rapide (${ttk}ms)`);
}

// 🔥 bonus détection “multi-signal aim suspect”
if (aimValue > thresholds.aimMax && hsValueSignal > thresholds.hsMax) {
    aimPenalty += 5;
    unlegitAIMWarnings.push("🚨 Pattern AIM + HS incohérent");
}
            // ─────────────────────────────
            // 🔫 RECOIL
            // ─────────────────────────────
            let recoilPenalty = 0;
            let recoilWarnings = [];

            const stability =
                (rifleAcc * 100) + (hs * 0.8) + (kpr * 100);

  let recoilBase = 70;

// 🔥 Faceit level 0 ignoré (évite fausses bases)
const lvl = (faceitLevel && faceitLevel > 0) ? faceitLevel : null;
const prem = (premierRating && premierRating > 0) ? premierRating : null;

// 🔥 Aucun vrai rank compétitif = baseline neutre
if (!lvl && !prem) {
    recoilBase = 72;
}

// ─────────────────────────────
// 🔥 FACEIT PRIORITY
// ─────────────────────────────

// Faceit 10 = très haut niveau
else if (lvl && lvl >= 10) {
    // Faceit 10 + énorme Premier = pro tier
    if (prem && prem >= 28000) {
        recoilBase = 92;
    } else {
        recoilBase = 88;
    }
}

// Faceit 8-9
else if (lvl && lvl >= 8) {
    recoilBase = 84;
}

// Faceit 5-7
else if (lvl && lvl >= 5) {
    recoilBase = 80;
}

// ─────────────────────────────
// 🔥 PREMIER fallback uniquement si FACEIT absent
// ─────────────────────────────

// Premier top
else if (prem && prem >= 28000) {
    recoilBase = 90;
}

// Premier high
else if (prem && prem >= 22000) {
    recoilBase = 84;
}

// Premier mid-high
else if (prem && prem >= 18000) {
    recoilBase = 80;
}

// Premier medium
else if (prem && prem >= 12000) {
    recoilBase = 75;
}

// 🔥 Low competitive
else {
    recoilBase = 70;
}
// 🔥 stabilité normalisée (évite biais rifleAcc seul)
const normalizedStability =
    (rifleAcc * 100 * 0.6) +
    (hs * 0.4) +
    (kpr * 100 * 0.5);

// ─────────────────────────────
// RECOIL DETECTION FIXED
// ─────────────────────────────
if (normalizedStability > recoilBase + 18) {
    recoilPenalty += 10;
    recoilWarnings.push("🔫 Recoil anormalement stable");
}

// 🔥 spray trop parfait (corrigé seuil)
if (rifleAcc > 0.83 && hs > 72) {
    recoilPenalty += 12;
    recoilWarnings.push("⚠️ Spray trop précis (suspect)");
}

// 🔥 cas “robot aim” léger (ajout utile)
if (rifleAcc > 0.88 && hs > 78) {
    recoilPenalty += 18;
    recoilWarnings.push("🚨 Pattern spray irréaliste");
}

            // ─────────────────────────────
            // BANS
            // ─────────────────────────────
            const vacBan = bans.vac_banned || bans.VACBanned;
            const gameBan = (bans.number_of_game_bans ?? 0) > 0;
            const communityBan = bans.community_banned;

            const anyBan = vacBan || gameBan || communityBan;
            const lastBanDays = bans.days_since_last_ban ?? null;

            // ─────────────────────────────
            // SCORE
            // ─────────────────────────────
            let score = 100;

            if (anyBan) score = 0;
            else {
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
                score -= (redFlags.length || 0) * 15;
                score -= aimPenalty;
                score -= recoilPenalty;

                score = Math.max(0, Math.min(100, score));
            }

            // ─────────────────────────────
            // STATUS
            // ─────────────────────────────
            let status;
            let color;

            if (anyBan) status = "⛔ BANNED";
            else if (score >= 80) status = "🟢 LEGIT";
            else if (score >= 60) status = "🟡 CLEAN / WATCH";
            else if (score >= 40) status = "🟠 SUSPICIOUS";
            else status = "🔴 HIGH RISK";

            color =
                anyBan ? 0xff0000 :
                score >= 80 ? 0x00ff00 :
                score >= 60 ? 0xffff00 :
                score >= 40 ? 0xffa500 :
                0xff0000;

            // ─────────────────────────────
            // EMBED (UNCHANGED)
            // ─────────────────────────────
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle("🧠 CS2 FULL LEGIT ANALYSIS")
                .setAuthor({ name: nickname, iconURL: avatar || undefined })
                .setThumbnail(avatar || null)
                .setDescription(
                    `👤 Profile: [${nickname}](${profile_link})\nSteamID64: \`${steamID64}\`\nSteamID: \`${steamName}\``
                )
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
                        name: "🧠 AI Signals",
                        value:
                            `HS: **${signals.hs?.value ?? "N/A"}**\nKD: **${signals.kd?.value ?? "N/A"}**\nADR: **${signals.adr?.value ?? "N/A"}**\nWR: **${signals.winrate?.value ?? "N/A"}**\nAim: **${signals.leetify_aim?.value ?? "N/A"}**`,
                        inline: true
                    },
                    {
                        name: "⚠️ AIM / RECOIL",
                        value:
                            (unlegitAIMWarnings.length || recoilWarnings.length)
                                ? [...unlegitAIMWarnings, ...recoilWarnings].join("\n")
                                : "🟢 Aucun comportement suspect",
                        inline: false
                    },
                    {
                        name: "🚨 Cheating Probability",
                        value: `**${cheatingPercent.toFixed(1)}%**`,
                        inline: true
                    },
                    {
                        name: "🚨 Ban Status",
                        value: isBansEmpty(bans)
                            ? "**API FAIL**"
                            : `VAC Ban: **${vacBan ? "⛔ YES" : "✅ NO"}**\nGame Ban: **${gameBan ? "⛔ YES" : "✅ NO"}**\nCommunity Ban: **${communityBan ? "⛔ YES" : "✅ NO"}**\nLast Ban: **${lastBanDays ?? "N/A"}**`,
                        inline: true
                    },
                    {
                    name: "🚩 Red Flags",
                    value: redFlags.length
                    ? redFlags.map(f => {
                            const title = f?.title || "Unknown";
                            const explanation = f?.explanation || "No explanation";
                            const severity = f?.severity || "low";

                            const emoji =
                            severity === "high" ? "🔴" :
                            severity === "medium" ? "🟠" :
                                "🟡";

                           return `${emoji} **${title}**\n_${explanation}_`;
                        }).join("\n\n")
                        : "🟢 Aucun flag détecté",
                        inline: false
                    },
                    {
                        name: "⚠️ Warnings",
                        value: warnFlags.length
                            ? warnFlags.join("\n")
                            : "🟢 Aucun warning",
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
            console.log(`FIN = ${input}`);

        } catch (err) {
            console.error(err);
            return interaction.editReply("❌ API error.");
        }
    }
};