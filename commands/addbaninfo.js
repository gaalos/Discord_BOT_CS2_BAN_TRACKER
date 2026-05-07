const { SlashCommandBuilder } = require("discord.js");
const db = require("../db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("addbaninfo")
        .setDescription("Add Steam account")
        .addStringOption(opt =>
            opt.setName("input")
                .setDescription("Steam URL / ID")
                .setRequired(true)
        ),

    async execute(interaction) {

        const input = interaction.options.getString("input");

        db.prepare(`
            INSERT INTO guild_config (guildId, channelId)
            VALUES (?, ?)
            ON CONFLICT(guildId) DO UPDATE SET channelId = excluded.channelId
        `).run(interaction.guildId, interaction.channelId);

        db.prepare(`
            INSERT OR IGNORE INTO tracked (steamInput)
            VALUES (?)
        `).run(input);

        return interaction.reply({
            content: "✅ Added",
            flags: 64
        });
    }
};