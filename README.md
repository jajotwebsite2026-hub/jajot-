# Social Hub

One post, many social accounts. Multi-client. Currently in **demo mode**: posts are simulated.

## Run

    npm install
    JWT_SECRET=some-long-random-string npm start

Open http://localhost:3000. The first account that signs up becomes admin (owner).

## Env vars

- `JWT_SECRET` (required in production)
- `PORT` (default 3000)
- `DB_PATH` (default ./data.db) - put on a persistent volume when deployed
- `UPLOAD_DIR` (default ./uploads) - same, persistent volume
- `NODE_ENV=production` (secure cookies, needs HTTPS)

## Going live later

Each platform's real posting goes in `platforms.js` (the `TODO real mode` line).
Needs OAuth apps approved by Meta (Facebook + Instagram), Google (YouTube), X, LinkedIn.

## Test tip

Put `[fail]` in a post text to simulate a platform error and test Retry.
