require("dotenv").config({ path: __dirname + "/../.env" });
const axios = require("axios");
const { to, formatTime } = require("./util");

//Cleans up the response from Strava
const cleanLeaderBoard = resp => {
    const board = resp.data.data;
    const newBoard = [];
    for (i in board) {
        const e = board[i];
        newBoard.push({
            name: e.athlete_firstname + " " + e.athlete_lastname,
            time: e.run_time,
        });
    }
    newBoard.sort((a, b) => a.time - b.time).reverse();
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
                    Accept:
                        "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript",
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
const formatEntry = (space_to_time, { name, time }) => {
    return `\n${name}${Array(space_to_time - name.length)
        .fill("\xa0")
        .join("")}${formatTime(time)}`;
};

// Translates a cleaned up leader board to a slack post
const toPost = leaderBoard => {
    const space_to_time = 20;
    let post =
        "```Name" +
        Array(space_to_time - 4)
            .fill("\xa0")
            .join("") +
        "Run time last week";
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
