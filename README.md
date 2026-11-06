# SWEMA — Saudi Arabia Weather & Environmental Data Map

An interactive map of Saudi Arabia's weather stations with live weather, NCM station
observations, satellite rainfall, forecasts, atmospheric gases, Google Earth Engine data and
areal-averaging methods (Arithmetic Mean, Thiessen, Isohyetal, IDW, Spline, Kriging).

It is a static website: everything runs in the browser and needs an internet connection for
the data. The only thing to run locally is a tiny web server.

## Online version (GitHub Pages)

The site is plain HTML/JS, so GitHub Pages can host it for free:

1. On GitHub open **khimy/Python → Settings → Pages**.
2. Under **Build and deployment** choose **Source: Deploy from a branch**.
3. Choose the branch **`claude/weather-data-map-Lnifi`** (or `master` once merged), folder **`/ (root)`**, and **Save**.
4. After a minute the site is live at **https://khimy.github.io/Python/**.

GitHub Pages is free for public repositories; a private repository needs a paid GitHub plan.
Because the address is https, it can also be used as the Earth Engine OAuth origin
(`https://khimy.github.io`).

## Open it at http://swema/

### 1. One-time setup: add the local domain `swema`

This adds the line `127.0.0.1  swema` to your computer's *hosts* file, so the name `swema`
points to your own computer.

| System | What to do |
|---|---|
| **Windows** | Right-click **`setup-swema-domain.bat`** → **Run as administrator** |
| **macOS / Linux** | In a terminal in this folder: `sh setup-swema-domain.sh` (asks for your password) |

Running it again is safe; it will not add the line twice.

### 2. Start the map

| System | What to do | Address |
|---|---|---|
| **Windows** | Double-click **`start-swema.bat`** | http://swema/ |
| **macOS / Linux** | `sudo sh start-swema.sh` | http://swema/ |
| **macOS / Linux (no sudo)** | `sh start-swema.sh` | http://swema:8080/ |

The browser opens automatically. Keep the window open while you use the map; close it (or
press Ctrl+C) to stop. If port 80 is in use, the server moves to port 8080 and prints the
address to use.

Requires Python 3 (Windows: install from python.org and tick "Add python.exe to PATH").

### No setup at all

`http://swema.localhost/` works in Chrome, Edge and Firefox without step 1, because every
`*.localhost` name already points to your own computer. Just start the server (step 2).

### Google Earth Engine sign-in

Google only accepts plain-http sign-in from `http://localhost`, so to sign in to Earth Engine
inside the site, open **http://localhost/** (same server) and add that address to your OAuth
client's *Authorised JavaScript origins*. The "Code Editor script" option works from any address.

### Removing the domain

Delete the line `127.0.0.1  swema` from the hosts file:

- Windows: `C:\Windows\System32\drivers\etc\hosts` (open Notepad as administrator)
- macOS / Linux: `sudo nano /etc/hosts`

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css` | Page layout and styling |
| `app.js` | Map, live weather and air-quality layers |
| `stations.js` | Station list (NCM / WMO codes, NOAA identifiers) |
| `timeseries.js` | Station window: periods, sources, charts, wind rose, outlooks |
| `ncm.js` | NCM station observations (WMO exchange via NOAA NCEI) |
| `sources.js` | Data source registry (ERA5, CHIRPS, IMERG, NASA POWER, CAMS, GFS, ECMWF…) |
| `analysis.js` | Areal analysis methods and methodology |
| `layers.js` | NASA GIBS, Global Forest Watch and OpenWeatherMap map layers |
| `wind.js` | Wind speed & direction arrows |
| `gee.js` | Google Earth Engine datasets and Code Editor script generator |
| `catalog.js` | List of all data sources and how they are used |
| `serve.py`, `start-swema.*`, `setup-swema-domain.*` | Local server and `swema` domain setup |
