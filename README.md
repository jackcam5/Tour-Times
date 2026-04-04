# MyTourTimes

A local web app for Spidertracks CSVs that:

- segments flights from `Take Off` to `Landing`
- matches flights to tours using map zones
- keeps unmatched ferry or maintenance flights out of tour averages
- gives pilots a dashboard and gives admins a protected editing studio
- can show nearest-time METAR weather for a selected flown flight

## Start the app

Run the local Ruby server from this folder:

```bash
cd /Users/jackcamilleri/Documents/Playground
ruby server.rb
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

Public viewer: [http://127.0.0.1:8000](http://127.0.0.1:8000)

Protected admin: [http://127.0.0.1:8000/admin](http://127.0.0.1:8000/admin)

Use the Ruby server instead of a plain static server if you want weather support. The weather feature needs the local `/api/weather` endpoint to avoid browser CORS limits from the official Aviation Weather Center API.

## Publish Live On Railway

This project is now set up so Railway can run it from the included `Dockerfile`.

### What you need

1. A GitHub account
2. A Railway account
3. This project folder uploaded to a GitHub repository

### Easiest path if you do not code much

#### Part 1: Put the project on GitHub

1. Go to [GitHub](https://github.com/) and create a new repository.
2. Name it something like `mytourtimes`.
3. Open the new repository page.
4. Click `Add file` then `Upload files`.
5. Drag in the contents of this folder:

```text
/Users/jackcamilleri/Documents/Playground
```

6. You do not need to upload `.cache` or `.data`.
7. Scroll down and click `Commit changes`.

#### Part 2: Deploy it on Railway

1. Go to [Railway](https://railway.com/).
2. Click `New Project`.
3. Choose `Deploy from GitHub repo`.
4. Connect your GitHub account if Railway asks.
5. Pick your `mytourtimes` repository.
6. Railway will detect the `Dockerfile` and start building automatically.

#### Part 3: Make the data stay saved

1. Open your Railway service.
2. Add a `Volume`.
3. Mount that volume at:

```text
/data
```

This is important because your published weekly sheet and shared settings need persistent storage.

#### Part 4: Set your admin password

1. In Railway, open `Variables`.
2. Add this variable:

```text
MYTOURTIMES_ADMIN_PASSWORD=choose-a-strong-password-here
```

3. Click save if Railway asks.
4. Redeploy or restart the service if needed.

#### Part 5: Get your live links

1. In Railway, open the service `Settings`.
2. Turn on the public domain if it is not already on.
3. Railway will give you a live web address.

That address is your public pilot link.

### Important live links

- Public viewer: your Railway app root URL, for example `https://your-app.up.railway.app`
- Admin sign-in: your Railway app URL plus `/admin`

Example:

```text
https://your-app.up.railway.app
https://your-app.up.railway.app/admin
```

### Notes for Railway

- The shared weekly sheet and admin-published data are stored in `/data`, so do not skip the volume step.
- The admin password comes from `MYTOURTIMES_ADMIN_PASSWORD` if you set it.
- The server health check endpoint is `/health`.
- If you later add a custom domain, the public viewer still stays at `/` and the admin page stays at `/admin`.
- After it is live, use the `/admin` page to upload the weekly CSV and click `Publish Weekly View`.
- Your pilots should only use the public root URL, not the `/admin` URL.

## Main workflow

1. Open the app.
2. Upload a Spidertracks CSV export.
3. Open the protected `/admin` page and sign in with the admin password.
4. Create locations, draw up to 10 zones per location, and assign those zones to tours.
5. Set each tour's `Min Time`, `Max Time`, and `Goal Time`.
6. Click `Publish Weekly View` when you want everyone using this server to see the same CSV and config.
7. Use `Clear Sheet` when you want to remove the current uploaded/published sheet.
8. Click flights to inspect matching and weather.

## Current CSV defaults

The app is preconfigured for:

- tail number: `Aircraft`
- local timestamp: `DateTime(Local)`
- latitude: `Latitude(decimal)`
- longitude: `Longitude(decimal)`
- description/event: `Description`
- optional track id: `Track`

## Weather

- Weather uses the free official [Aviation Weather Center Data API](https://aviationweather.gov/data/api/)
- The local server finds nearby stations and requests the METAR closest to the selected flight's midpoint time
- Recent historical data is supported by the official service, but availability depends on the observation station and date range

## Notes

- Config is saved locally in the browser using IndexedDB with localStorage fallback.
- The current CSV is also remembered in the same browser tab, and published weekly views are stored on the local Ruby server in `.data/`.
- The current CSV is also saved in browser storage so it stays around until you clear it.
- Export config JSON regularly if you want an extra backup.
- Admin access now lives on the protected `/admin` route instead of the public pilot viewer.
- The map uses online tiles, so internet access is required for the satellite view.
- The bundled Ruby server still runs on your machine at `127.0.0.1`. To send a link to other pilots outside your computer, you will still need hosting or a network-accessible deployment.
