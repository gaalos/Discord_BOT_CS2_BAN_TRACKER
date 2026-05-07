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

        const { results, checked, newlyBanned } =
            await runScan(client, interaction.guildId);

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
                    name: r.input,
                    value: `${r.steamId || ""}\n${r.status}`
                });
            }

            embed.addFields({
                name: "📊 Summary",
                value:
`Checked: ${checked}
New bans: ${newlyBanned}`
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
            components: row.components.length ? [row] : []
        });

        const collector = msg.createMessageComponentCollector({
            time: 60000
        });

        collector.on("collect", async (btn) => {

            if (btn.user.id !== interaction.user.id) return;

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