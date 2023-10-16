# Slack Strava Integration

A script for posting a leaderboard, fetched from Strava, to a dedicated Slack channel. Running the script on a weekly basis sums up the distance run by each user and posts it as a message in Slack.

## Contributors

- [@molleer](https://github.com/molleer) David 'Mölle' Möller
- [@saser](https://github.com/saser) Christian 'Saser' Persson

## Requirements

- [NodeJs](https://nodejs.org/en/)
- [npm](https://www.npmjs.com/)

# Setup

1. Copy the `example.env` file to `.env`.
2. In `.env`, set the `club_id` to the desired Strava club id (ex: `itchalmerslop`) and set the `hook_token` to a Slack incoming web hook token to be used (could also print to command line while developing).
3. Install dependencies with
```bash
npm install
```

Run the script with

```bash
node index.js
```

