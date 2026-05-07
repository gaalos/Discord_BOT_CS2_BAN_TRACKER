const { Client, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { startAutoScan } = require("./autoScan");

const client = new Client({ intents: [] });

client.commands = new Collection();

// load commands
const commandsPath = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandsPath)) {

    const command = require(`./commands/${file}`);

    if (!command.data || !command.execute) {
        console.log(`❌ SKIP (service): ${file}`);
        continue;
    }

    client.commands.set(command.data.name, command);
}

// interaction handler
client.on("interactionCreate", async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, client);
    } catch (err) {
        console.log("❌ ERROR:", err);
    }
});

client.once("ready", () => {
    console.log("✅ BOT ONLINE:", client.user.tag);

    startAutoScan(client); // 🔥 auto scan start
});

client.login(process.env.DISCORD_TOKEN);