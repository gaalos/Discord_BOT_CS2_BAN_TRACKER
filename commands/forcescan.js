const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { runScan } = require("../services/scanEngine");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("forcescan")
        .setDescription("Run full scan"),

    async execute(interaction, client) {

        await interaction.reply("🔎 Scan en cours...");

        // 🔥 SAFE RUNSCAN (ANTI CRASH)
        const scan = await runScan(client, interaction.guildId).catch(err => {
            console.error("RUNSCAN ERROR:", err);
            return null;
        });

        if (!scan) {
            return interaction.editReply("❌ Scan failed.");
        }

        const results = scan.results || [];
        const checked = scan.checked || 0;
        const newlyBanned = scan.newlyBanned || 0;

        // 🚨 SAFE CHECK
        if (!Array.isArray(results) || results.length === 0) {
            return interaction.editReply("⚠️ No results found.");
        }

        const pages = [];
        const pageSize = 5;

        for (let i = 0; i < results.length; i += pageSize) {
            pages.push(results.slice(i, i + pageSize));
        }

        let page = 0;

        const buildEmbed = (p) => {

            const embed = new EmbedBuilder()
                .setTitle("🔎 CS2 SCAN REPORT")
                .setColor(0x2b2d31)
                .setFooter({ text: `Page ${p + 1}/${pages.length}` });

            for (const r of pages[p]) {

                embed.addFields({
                    name: r.input || "Unknown",
                    value: `${r.steamId || "N/A"}\n${r.status || "UNKNOWN"}`
                });
            }

            embed.addFields({
                name: "📊 Summary",
                value:
                    `Checked: ${checked}\n` +
                    `New bans: ${newlyBanned}`
            });

            return embed;
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("prev")
                .setLabel("⬅")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId("next")
                .setLabel("➡")
                .setStyle(ButtonStyle.Secondary)
        );

        const msg = await interaction.followUp({
            embeds: [buildEmbed(page)],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({
            time: 60000
        });

        collector.on("collect", async (btn) => {

            if (btn.user.id !== interaction.user.id) return;

            if (!pages.length) return;

            if (btn.customId === "next") {
                page = (page + 1) % pages.length;
            }

            if (btn.customId === "prev") {
                page = (page - 1 + pages.length) % pages.length;
            }

            await btn.update({
                embeds: [buildEmbed(page)],
                components: [row]
            });
        });
    }
};