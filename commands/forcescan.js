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
        }else
        {
            interaction.editReply("Scan DONE.");
        }

    }
};