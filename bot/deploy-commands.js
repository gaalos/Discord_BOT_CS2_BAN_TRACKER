require("dotenv").config();

const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

    if (!command.data) {
        console.log(`❌ SKIP (no data): ${file}`);
        continue;
    }

    commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("🔄 Deploy global commands...");

        console.log("📦 Commands:", commands.map(c => c.name));

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log("✅ Deploy finished");
    } catch (err) {
        console.error("❌ Deploy error:", err);
    }
})();