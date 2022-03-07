require("dotenv").config({ path: __dirname + "/../.env" });

const axios = require("axios");
const fs = require("fs");
const { join } = require("path");
const { to } = require("./util");

//const db = new sqlite3.Database(join(__dirname, "database"));
const db = JSON.parse(fs.readFileSync(join(__dirname, "database.json")));

//Cleans up the response from Strava
const cleanLeaderBoard = resp => {
    const board = resp.data.data;
    const newBoard = [];
    for (i in board) {
        const e = board[i];
        newBoard.push({
            name: e.athlete_firstname + " " + e.athlete_lastname,
            distance: e.distance,
            id: String(e.athlete_id),
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
// positionChange No change =>, Up one position => 1, Down one position => -1
const formatEntry = (space_to_d, { name, distance }, p, positionChange) => {
    const d = Math.floor(distance / 100);
    const posChar = positionChange === 0 ? " " : positionChange < 0 ? "▲" : "▼";
    return `\n${posChar} ${p + 1 + (p < 9 ? " " : "")} ${name}${Array(
        space_to_d - name.length - 3,
    )
        .fill("\xa0")
        .join("")}${d / 10}${d % 10 === 0 ? ".0" : ""} km`;
};

const getPositionChange = (leaderBoard, oldLeaderBoard) => {
    const positionChange = [];
    for (const i in leaderBoard) {
        for (const k in oldLeaderBoard) {
            if (oldLeaderBoard[k].id == leaderBoard[i].id) {
                positionChange.push(i - k);
                break;
            }
        }
        if (positionChange.length <= i) {
            positionChange.push(-1);
        }
    }
    return positionChange;
};

// Translates a cleaned up leader board to a slack post
const toPost = (leaderBoard, oldLeaderBoard) => {
    const space_to_time = 20;
    let post =
        process.env.title +
        "\n```  #  Name" +
        Array(space_to_time - 7)
            .fill("\xa0")
            .join("") +
        "Distance";
    const positionChange = getPositionChange(leaderBoard, oldLeaderBoard);
    for (i in leaderBoard) {
        post += formatEntry(
            space_to_time,
            leaderBoard[i],
            Number(i),
            positionChange[i],
        );
    }
    return (
        post + "\n```\nGå med via https://www.strava.com/clubs/itchalmerslop"
    );
};

const postToSlack = async (distances, oldLeaderBoard) =>
    axios.post(`https://hooks.slack.com/services/${process.env.hook_token}`, {
        username: "Strava",
        icon_emoji: ":strava:",
        text: toPost(distances, oldLeaderBoard),
    });

const insertUsers = (db, board) => {
    for (const i in board) {
        var distance = db[board[i].id] ? db[board[i].id].distance : 0;
        distance += board[i].distance;
        db[board[i].id] = { name: board[i].name, distance: distance };
    }
};

const toArray = board => {
    const arr = [];
    for (const i in board) {
        arr.push({ ...board[i], id: i });
    }
    return arr;
};

const main = async () => {
    const [err, board] = await to(getLeaderBoard(process.env.club_id));
    if (err) {
        console.log(err);
        return;
    }
    const oldLeaderBoard = toArray(db);
    insertUsers(db, board);
    const newLeaderBoard = toArray(db);

    oldLeaderBoard.sort((a, b) => b.distance - a.distance);
    newLeaderBoard.sort((a, b) => b.distance - a.distance);

    postToSlack(newLeaderBoard, oldLeaderBoard);
    fs.writeFileSync(join(__dirname, "database.json"), JSON.stringify(db));
};

main();
