require("dotenv").config({ path: __dirname + "/../.env" });

const axios = require("axios");
const fs = require("fs");
const { table, getBorderCharacters } = require("table");
const { join } = require("path");
const { to } = require("./util");
const { time } = require("console");

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

// Translates a cleaned up leader board to a slack post
const toPost = (newLeaderBoard, oldLeaderBoard) => {
    return [
        process.env.title,
        "```",
        formatTable(newLeaderBoard, oldLeaderBoard),
        "```",
        "Gå med via https://www.strava.com/clubs/itchalmerslop",
    ].join("\n");
};

const postToSlack = async (newLeaderBoard, oldLeaderBoard) =>
    axios.post(`https://hooks.slack.com/services/${process.env.hook_token}`, {
        username: "Strava",
        icon_emoji: ":strava:",
        text: toPost(newLeaderBoard, oldLeaderBoard),
    });

const insertUsers = (db, board) => {
    for (const i in board) {
        var distance = db[board[i].id] ? db[board[i].id].distance : 0;
        distance += board[i].distance;
        db[board[i].id] = { name: board[i].name, distance: distance };
    }
};

// Takes a leaderboard object and returns a mapping from athlete ID to the rank,
// based on distance, on the leaderboard. The athlete with the largest distance
// will have rank 1; the athlete with the second largest distance will have rank
// 2; and so on.
const athleteRanks = leaderBoard => {
    let athletes = [];
    for (const id in leaderBoard) {
        athletes.push({ id: id, distance: leaderBoard[id].distance });
    }
    athletes.sort((a, b) => b.distance - a.distance);
    let ranks = {};
    for (const [i, athlete] of athletes.entries()) {
        // i is a 0-based index, and we want 1-based ranks.
        ranks[athlete.id] = i + 1;
    }
    return ranks;
};

// Constructs an array of objects containing one entry for each athlete in the
// new leaderboard. Each entry contains these properties:
// - rank: the leaderboard rank. 1 is the best possible rank (i.e. top of leaderboard).
// - rankChange: a number representing whether their rank has changed compared
//   to the old leaderboard. -1 means moving down the leaderboard, 0 means staying
//   in the same place, and +1 means moving up the leaderboard.
// - name: the name of the athlete, to be printed in the table.
// - distance: the total distance the athlete has run.
// - diff: the difference in distance between the new and old leaderboard.
const tableEntries = (newLeaderBoard, oldLeaderBoard) => {
    const newRanks = athleteRanks(newLeaderBoard);
    const oldRanks = athleteRanks(oldLeaderBoard);
    // A sentinel value for indicating that an athlete didn't have a rank
    // previously. By defining it this way we can guarantee that whatever rank
    // the athlete has now, noPreviousRank will be higher (i.e. worse).
    const noPreviousRank = Object.keys(newRanks).length + 1;

    let entries = [];
    for (const [id, athlete] of Object.entries(newLeaderBoard)) {
        const newRank = newRanks[id];
        const oldRank = id in oldRanks ? oldRanks[id] : noPreviousRank;
        let rankChange = 0; // Assume no change.
        if (newRank < oldRank) {
            // Lower rank is better.
            rankChange = +1;
        } else if (newRank > oldRank) {
            // Higher rank is worse.
            rankChange = -1;
        }

        const newDistance = athlete.distance;
        const oldDistance =
            id in oldLeaderBoard ? oldLeaderBoard[id].distance : 0;
        const diff = newDistance - oldDistance;

        entries.push({
            rankChange: rankChange,
            rank: newRank,
            name: athlete.name,
            distance: newDistance,
            diff: diff,
        });
    }
    // Sort the entries in ascending order by rank.
    entries.sort((a, b) => a.rank - b.rank);
    return entries;
};

// Takes an entry created by the tableEntries function and maps each property to
// a suitable string representation.
const formatEntry = entry => {
    let rankChange = "";
    switch (entry.rankChange) {
        case -1:
            rankChange = "▼";
            break;
        case 0:
            rankChange = " ";
            break;
        case +1:
            rankChange = "▲";
            break;
    }
    let formatted = {
        rankChange: rankChange,
        rank: entry.rank.toString(),
        name: entry.name,
        distance: `${(entry.distance / 1000).toFixed(1)} `,
        diff: `(+${(entry.diff / 1000).toFixed(1)})`,
    };
    // If the diff is small enough, we avoid including "(+0.0 km)" in the output
    // as that is just noisy.
    if (Math.abs(entry.diff) < 10) {
        formatted.diff = "";
    }
    return formatted;
};

// Takes old and new leaderboards and returns a neatly formatted ASCII table
// suitable for posting to the Slack channel.
const formatTable = (newLeaderBoard, oldLeaderBoard) => {
    let rows = [
        [
            "", // Rank change.
            "#", // Rank.
            "Name",
            "Dist",
            "[km]", // Diff.
        ],
    ];
    for (const e of tableEntries(newLeaderBoard, oldLeaderBoard).map(
        formatEntry,
    )) {
        rows.push([e.rankChange, e.rank, e.name, e.distance, e.diff]);
    }
    const config = {
        columns: [
            { alignment: "left" }, // Rank change.
            { alignment: "right" }, // Rank.
            { alignment: "left" }, // Name.
            { alignment: "right" }, // Distance.
            { alignment: "left" }, // Diff.
        ],
        // Taken from the documentation for a borderless table:
        // https://github.com/gajus/table/tree/28e8e6e1354ba4b7fecad2f1aa50015c8a781704#borderless-table
        border: getBorderCharacters("void"),
        columnDefault: {
            paddingLeft: 0,
            paddingRight: 1,
        },
        drawHorizontalLine: () => false,
        singleLine: true,
    };
    return table(rows, config);
};

const main = async () => {
    const [err, board] = await to(getLeaderBoard(process.env.club_id));
    if (err) {
        console.log(err);
        return;
    }
    const oldLeaderBoard = { ...db };
    const newLeaderBoard = { ...db };
    insertUsers(newLeaderBoard, board);
    postToSlack(newLeaderBoard, oldLeaderBoard);
    fs.writeFileSync(
        join(__dirname, "database.json"),
        JSON.stringify(newLeaderBoard),
    );

    const res = await axios.get("https://lasvecka.nu/data");
    if (res.data == "LV 1") {
        const database = JSON.parse(
            fs.readFileSync(join(__dirname, "database.json")),
        );
        fs.writeFileSync(
            join(__dirname, "old.database.json"),
            JSON.stringify(database),
        );
        fs.writeFileSync(join(__dirname, "database.json"), "{}");
        await new Promise(r => setTimeout(r, 1000));
        axios.post(
            `https://hooks.slack.com/services/${process.env.hook_token}`,
            {
                username: "Strava",
                icon_emoji: ":strava:",
                text: "Det var sista listan för den här läsperioden! :partying_face: \nNu börjar listan om från noll!",
            },
        );
    }
};

main();
