const { Client, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const db = require("./db"); // ⚠️ AJOUT IMPORTANT

const client = new Client({ intents: [] });

client.commands = new Collection();

// 📦 LOAD COMMANDS
for (const file of fs.readdirSync("./commands")) {

    const cmd = require(`./commands/${file}`);

    if (!cmd.data || !cmd.execute) {
        console.log(`❌ SKIP: ${file}`);
        continue;
    }

    client.commands.set(cmd.data.name, cmd);
}

// ⚡ SLASH COMMAND HANDLER
client.on("interactionCreate", async (i) => {

    if (i.isChatInputCommand()) {
        const cmd = client.commands.get(i.commandName);
        if (!cmd) return;

        return await cmd.execute(i, client);
    }

    // 🔴 BUTTON HANDLER (REMOVE ACCOUNT)
    if (i.isButton()) {

        if (!i.customId.startsWith("remove_")) return;

        const id = i.customId.split("_")[1];

        try {
            db.prepare("DELETE FROM tracked WHERE id = ?").run(id);

            return await i.reply({
                content: "🗑️ Account removed successfully.",
                ephemeral: true
            });

        } catch (err) {
            return await i.reply({
                content: "❌ Failed to remove account.",
                ephemeral: true
            });
        }
    }
});

// ✅ READY EVENT
client.once("ready", () => {
    console.log("✅ BOT ONLINE");
});

client.login(process.env.DISCORD_TOKEN);