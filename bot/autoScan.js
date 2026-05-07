const { runScan } = require("./services/scanEngine");

let running = false;

function startAutoScan(client) {

    setInterval(async () => {

        if (running) return;
        running = true;

        for (const guild of client.guilds.cache.values()) {
            await runScan(client, guild.id);
        }

        running = false;

    }, 60 * 60 * 1000);
}

module.exports = { startAutoScan };