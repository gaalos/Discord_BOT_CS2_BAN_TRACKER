const axios = require("axios");

async function extractSteamID(input) {

    if (!input) return null;
    input = input.trim();

    if (/^\d{17}$/.test(input)) return input;

    let m = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
    if (m) return m[1];

    m = input.match(/cs2tracker\.org\/profile\/(\d{17})/);
    if (m) return m[1];

    m = input.match(/steamcommunity\.com\/id\/([^\/?#]+)/);

    if (m) {
        try {
            const res = await axios.get(
                `https://steamcommunity.com/id/${m[1]}/?xml=1`
            );

            const id = res.data.match(/<steamID64>(\d{17})<\/steamID64>/);
            return id ? id[1] : null;

        } catch {
            return null;
        }
    }

    return null;
}

module.exports = { extractSteamID };