const { runScan } = require("./services/scanEngine");

let running = false;

function startAutoScan(client) {

    setInterval(async () => {

        if (running) return;
        running = true;

        console.log("🔁 AUTO SCAN START");

        for (const guild of client.guilds.cache.values()) {
            await runScan(client, guild.id);
        }

        running = false;

        console.log("✅ AUTO SCAN DONE");

    }, 1 * 60 * 1000);
}

module.exports = { startAutoScan };