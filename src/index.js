require("dotenv").config({ path: __dirname + "/../.env" });

const axios = require("axios");
const sqlite3 = require("sqlite3");
const { join } = require("path");
const { to } = require("./util");

const db = new sqlite3.Database(join(__dirname, "database"));

//Cleans up the response from Strava
const cleanLeaderBoard = resp => {
    const board = resp.data.data;
    const newBoard = [];
    for (i in board) {
        const e = board[i];
        newBoard.push({
            name: e.athlete_firstname + " " + e.athlete_lastname,
            distance: e.distance,
            id: e.athlete_id,
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
        "Total från och med 2021 vecka 18\n```Name" +
        Array(space_to_time - 4)
            .fill("\xa0")
            .join("") +
        "Distance";
    for (i in leaderBoard) {
        post += formatEntry(space_to_time, leaderBoard[i]);
    }
    return (
        post + "\n```\nGå med via https://www.strava.com/clubs/itchalmerslop"
    );
};

const createTables = db => {
    db.run(
        "CREATE TABLE IF NOT EXISTS users( \
        id INT PRIMARY KEY NOT NULL, \
        name TEXT NOT NULL\
        )",
    );

    db.run(
        "CREATE TABLE IF NOT EXISTS distances( \
        user_id INT NOT NULL, \
        distance INT, \
        year_week TEXT NOT NULL, \
        FOREIGN KEY(user_id) REFERENCES users(id) \
        )",
    );
};

const insertUsers = (db, users) => {
    for (var i in users) {
        db.run(
            "INSERT INTO users(id, name) \
        SELECT $id, $name \
        WHERE NOT EXISTS(SELECT 1 FROM users WHERE id = $id) \
        ",
            {
                $id: users[i].id,
                $name: users[i].name,
            },
        );
    }
};

const insertDistances = (db, distances) => {
    for (var i in distances) {
        db.run(
            "INSERT INTO distances(user_id, distance, year_week) \
            SELECT $id, $distance, strftime('%Y-%W') \
            WHERE NOT EXISTS(SELECT 1 FROM distances WHERE user_id = $id AND year_week = strftime('%Y-%W'))",
            {
                $id: distances[i].id,
                $distance: distances[i].distance,
            },
        );
    }
};

const postToSlack = (distances, done) => {
    axios
        .post(`https://hooks.slack.com/services/${process.env.hook_token}`, {
            username: "Strava",
            icon_emoji: ":strava:",
            text: toPost(distances),
        })
        .finally(done);
};

const getTotalDistances = (db, done) =>
    db.all(
        "SELECT name, SUM(distance) AS distance \
    FROM distances CROSS JOIN users ON users.id=distances.user_id \
    GROUP BY user_id \
    ORDER BY distance DESC",
        done,
    );

// Posts the leader board in slack
const main = async () => {
    db.serialize(() => {
        createTables(db);
        getLeaderBoard(process.env.club_id).then(users => {
            insertUsers(db, users);
            insertDistances(db, users);
            getTotalDistances(db, (_, distances) =>
                postToSlack(distances, () => {
                    db.close();
                    console.log("Leader board successfully posted!");
                }),
            );
        });
    });
};

main();
