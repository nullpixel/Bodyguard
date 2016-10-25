```
touch botdata.db
sqlite3 botdata.db
```

Run these commands in sqlite3 prompt:

```
CREATE TABLE approved_users(userid text);
CREATE TABLE logignore_channels (channelid text);
CREATE TABLE sent_users(userid text);
CREATE TABLE settings(key text, value text);

INSERT INTO settings (key, value) VALUES ('rules_channel', ''), ('logignore_channel', '')
```

Open `index.js` in your text editor and replace `bot_token_here` with your bot token and `guild_id_here` with guild id. Note: this bot is only for one channel.

Install with `npm install` and start with `node index.js`.
