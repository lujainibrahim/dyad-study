# Dyad Chat Study

A simple web app for pairing Prolific participants to chat with each other as part of a research study.

## Features

- **Waiting Room**: Participants wait until a partner joins
- **Real-time Chat**: Paired participants can chat in real-time
- **Finish Flow**: Both participants must click "Finish" to complete
- **Auto-redirect**: Redirects to your completion Qualtrics survey with their Prolific ID

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the completion survey URL

Open `server.js` and update this line with your Qualtrics survey URL:

```javascript
const COMPLETION_QUALTRICS_URL = 'https://yourschool.qualtrics.com/jfe/form/YOUR_SURVEY_ID';
```

### 3. Start the server

```bash
npm start
```

The server runs on `http://localhost:3000` by default.

## How to Use

### In Your First Qualtrics Survey

At the end of your first Qualtrics survey, redirect participants to:

```
http://YOUR_SERVER_URL/?PROLIFIC_PID=${e://Field/PROLIFIC_PID}
```

Replace `YOUR_SERVER_URL` with your actual server address (e.g., your deployed URL or `localhost:3000` for testing).

### Flow

1. Participant completes first Qualtrics survey
2. Gets redirected to your chat app with their Prolific ID
3. Waits in the waiting room until partner arrives
4. Both participants chat
5. Both click "Finish" when done
6. Both get redirected to completion Qualtrics survey (with their Prolific ID passed along)

## Deployment

For production use, you'll need to deploy this to a server. Some options:

- **Railway.app** (free tier available)
- **Render.com** (free tier available)
- **Heroku**
- **DigitalOcean**

Make sure to set the `PORT` environment variable if required by your host.

## Testing Locally

1. Start the server: `npm start`
2. Open two browser windows (or use incognito for one)
3. Navigate to:
   - Window 1: `http://localhost:3000?PROLIFIC_PID=test1`
   - Window 2: `http://localhost:3000?PROLIFIC_PID=test2`
4. Both should be paired and able to chat

## Notes

- Pairs are stored in memory, so restarting the server clears all data
- If a participant disconnects, their partner is notified
- Both participants must click "Finish" for the redirect to happen
