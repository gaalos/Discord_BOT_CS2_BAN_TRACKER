const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("register")
        .setDescription("Enregistre ce salon comme canal de scan"),

    async execute(interaction) {

        const guildId = interaction.guildId;
        const channelId = interaction.channelId;

        // ─────────────────────────────
        // UPSERT CONFIG
        // ─────────────────────────────
        const exists = db.prepare(`
            SELECT guildId FROM guild_config WHERE guildId = ?
        `).get(guildId);

        if (exists) {
            db.prepare(`
                UPDATE guild_config
                SET channelId = ?
                WHERE guildId = ?
            `).run(channelId, guildId);
        } else {
            db.prepare(`
                INSERT INTO guild_config (guildId, channelId)
                VALUES (?, ?)
            `).run(guildId, channelId);
        }

        // ─────────────────────────────
        // CONFIRMATION
        // ─────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle("✅ Canal enregistré")
            .setColor(0x2ecc71)
            .setDescription(
                `Ce salon est maintenant utilisé pour le scan.\n\n` +
                `📍 Channel: <#${channelId}>`
            );

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};