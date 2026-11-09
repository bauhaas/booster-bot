# Records Master Auto Booster

A Chrome extension that opens your [Records Master](https://recordsmaster.com) booster every 10 minutes, even overnight, and alerts you when you pull a **legendary**.

Click the extension icon to see every booster it opened, with colored cards for each rarity.

## Install

**1. Download it.** In Terminal, run:

```bash
git clone https://github.com/bauhaas/booster-bot.git ~/booster-bot
```

(No git? Click **Code → Download ZIP** on this page and unzip it somewhere you'll keep it. You'll get updates more easily with git.)

**2. Open the extensions page.** Go to `chrome://extensions` and turn on **Developer mode** (top right).

**3. Load it.** Click **Load unpacked** and select the `booster-bot` folder (the one that contains `manifest.json`).

**4. Log in and test.** Log in to recordsmaster.com in Chrome, click the extension icon (pin it from the 🧩 menu), then click **Open now**. You should see your cards appear.

Leave Chrome open and stop your computer from going to sleep if you want it to run at night.

## Updating

When a new version is out, the icon shows a green **NEW** badge. To update:

```bash
cd ~/booster-bot && git pull
```

Then click **Reload** in the extension popup. (ZIP users: download the new ZIP, replace the folder's files, then click Reload.)

## Notes

- It uses your own logged-in session; nothing is sent anywhere else.
- "Nothing to open yet (HTTP 422)" just means no booster was available at that moment.
- Automating a game can be against its rules. Use at your own risk.
