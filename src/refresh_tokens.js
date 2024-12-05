require("dotenv").config({ path: __dirname + "/../.env" });

const { default: axios } = require("axios");
const fs = require("fs");
const { join } = require("path");

const tokens_path = join(__dirname, "tokens.json");
const env_refresh_token = process.env.refresh_token;
const client_id = process.env.client_id;
const client_secret = process.env.client_secret;

const refresh_tokens = async () => {
    if (!fs.existsSync(tokens_path)) {
        fs.writeFileSync(
            tokens_path,
            JSON.stringify({
                access_token: "",
                refresh_token: env_refresh_token,
            }),
        );
    }

    const tokens = JSON.parse(fs.readFileSync(tokens_path));
    const res = await axios.post(
        "https://www.strava.com/api/v3/oauth/token",
        null,
        {
            params: {
                client_id: client_id,
                client_secret: client_secret,
                grant_type: "refresh_token",
                refresh_token: tokens.refresh_token,
            },
        },
    );
    fs.writeFileSync(
        tokens_path,
        JSON.stringify({
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token,
        }),
    );
};

if (typeof require !== "undefined" && require.main === module) {
    refresh_tokens()
        .then(() => console.log("Done!"))
        .catch(err => console.log(err));
}

module.exports = refresh_tokens;
