function upsertGuild(db, interaction) {

    if (!interaction.inGuild()) {
        return { ok: false, error: "Server only" };
    }

    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    // 🔥 ULTRA SAFE (NO API FETCH)
    const guildName =
        interaction.guild?.name ||
        interaction.guildId ||
        "unknown";

    db.prepare(`
        INSERT OR REPLACE INTO guilds (guildId, guildName, channelId)
        VALUES (?, ?, ?)
    `).run(guildId, guildName, channelId);

    return {
        ok: true,
        guildId,
        guildName,
        channelId
    };
}

module.exports = { upsertGuild };