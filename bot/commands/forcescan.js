const { SlashCommandBuilder } = require("discord.js");
const { runScan } = require("../services/scanEngine");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("forcescan")
        .setDescription("Force scan all accounts"),

    async execute(interaction, client) {

        await interaction.reply("🔎 Scan en cours...");

        await runScan(client, interaction.guildId);

        await interaction.followUp("✅ Scan terminé");
    }
};