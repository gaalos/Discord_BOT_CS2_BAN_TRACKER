const { Client, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { startAutoScan } = require("./autoScan");

const client = new Client({ intents: [] });

client.commands = new Collection();

for (const file of fs.readdirSync("./commands")) {

    const cmd = require(`./commands/${file}`);

    if (!cmd.data || !cmd.execute) {
        console.log(`❌ SKIP: ${file}`);
        continue;
    }

    client.commands.set(cmd.data.name, cmd);
}

client.on("interactionCreate", async (i) => {

    if (!i.isChatInputCommand()) return;

    const cmd = client.commands.get(i.commandName);
    if (!cmd) return;

    await cmd.execute(i, client);
});

client.once("ready", () => {
    console.log("✅ BOT ONLINE");

    startAutoScan(client);
});

client.login(process.env.DISCORD_TOKEN);