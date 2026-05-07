const { SlashCommandBuilder } = require("discord.js");
const db = require("../db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("delbaninfo")
        .setDescription("Remove Steam account")
        .addStringOption(opt =>
            opt.setName("input")
                .setDescription("Steam URL / ID")
                .setRequired(true)
        ),

    async execute(interaction) {

        const input = interaction.options.getString("input");

        const res = db.prepare(`
            DELETE FROM tracked WHERE steamInput = ?
        `).run(input);

        return interaction.reply({
            content: res.changes ? "🗑️ Removed" : "❌ Not found",
            flags: 64
        });
    }
};