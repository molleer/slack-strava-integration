require("dotenv").config({ path: __dirname + "/../.env" });
const axios = require("axios");
const { to } = require("./util");

//Cleans up the response from Strava
const cleanLeaderBoard = resp => {
    const board = resp.data.data;
    const newBoard = [];
    for (i in board) {
        const e = board[i];
        newBoard.push({
            name: e.athlete_firstname + " " + e.athlete_lastname,
            distance: e.distance,
        });
    }
    newBoard.sort((a, b) => b.distance - a.distance);
    return newBoard;
};

// Fetches the club leader board from Strava
// Returns a cleaned up leader board
const getLeaderBoard = async clubId => {
    const [err, res] = await to(
        axios.get(
            `https://www.strava.com/clubs/${clubId}/leaderboard?week_offset=1`,
            {
                headers: {
                    Accept: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript",
                    "X-Requested-With": "XMLHttpRequest",
                },
            },
        ),
    );

    if (err) {
        console.log(err);
        return null;
    }
    return cleanLeaderBoard(res);
};

// Returns "NAME h:m:s" for each entry´
// The number of characters until time is printed is always `space_to_time`
const formatEntry = (space_to_d, { name, distance }) => {
    const d = Math.floor(distance / 100);
    return `\n${name}${Array(space_to_d - name.length)
        .fill("\xa0")
        .join("")}${d / 10}${d % 10 === 0 ? ".0" : ""} km`;
};

// Translates a cleaned up leader board to a slack post
const toPost = leaderBoard => {
    const space_to_time = 20;
    let post =
        "```Name" +
        Array(space_to_time - 4)
            .fill("\xa0")
            .join("") +
        "Distance";
    for (i in leaderBoard) {
        post += formatEntry(space_to_time, leaderBoard[i]);
    }
    return post + "\n```";
};

// Posts the leader board in slack
const main = async () => {
    const board = await getLeaderBoard(process.env.club_id);

    await axios.post(
        `https://hooks.slack.com/services/${process.env.hook_token}`,
        {
            username: "Strava",
            icon_emoji: ":strava:",
            text: toPost(board),
        },
    );

    console.log("Leader board successfully posted!");
};

main();
