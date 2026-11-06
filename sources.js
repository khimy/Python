// ============================================================
// Data source registry
// Every source returns daily values for a list of stations and a period,
// in one common shape:  [{ time: [dates], daily: { variableKey: [values] }, available }]
// so the time-series window and the areal analysis can use any of them.
//
//   ncm    NCM station observations (WMO exchange, NOAA NCEI GSOD)   ncm.js
//   era5   ECMWF ERA5 reanalysis (Open-Meteo Historical API)          timeseries.js
//   chirps CHIRPS rainfall (UCSB Climate Hazards Center)  ┐ via NASA SERVIR
//   imerg  IMERG rainfall (NASA GPM)                       ┘ ClimateSERV API
//   power  NASA POWER daily meteorology & solar
//   gfs    NOAA GFS forecast      ┐ via Open-Meteo
//   ecmwf  ECMWF IFS forecast     ┘ Forecast API
//
// Plus station "outlook" products: ECMWF SEAS5 seasonal forecast,
// CMIP6 climate projections and Global Solar Atlas long-term solar resource.
// ============================================================

(function () {
    'use strict';

    const VARS = window.PERIOD_VARS;
    const DU = window.dateUtils;
    const today = () => DU.isoDate(new Date());

    function dateList(start, end) {
        const out = [];
        for (let d = start; d <= end; d = DU.shiftDate(d, 1)) out.push(d);
        return out;
    }

    function blankDaily(n) {
        const daily = {};
        for (const k of Object.keys(VARS)) daily[k] = new Array(n).fill(null);
        return daily;
    }

    // Run fn over items with at most `limit` running at the same time
    async function mapLimit(items, limit, fn) {
        const out = new Array(items.length);
        let next = 0;
        async function worker() {
            while (next < items.length) {
                const i = next++;
                out[i] = await fn(items[i], i);
            }
        }
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
        return out;
    }

    async function getJson(url, tries = 2) {
        for (let t = 0; t < tries; t++) {
            try {
                const res = await fetch(url);
                const json = await res.json().catch(() => null);
                if (!res.ok || json?.error) throw new Error(json?.reason || json?.messages?.join?.(' ') || `HTTP ${res.status}`);
                return json;
            } catch (e) {
                if (t === tries - 1) throw e;
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }

    const cache = new Map();
    function cached(key, fn) {
        if (!cache.has(key)) cache.set(key, fn().catch(e => { cache.delete(key); throw e; }));
        return cache.get(key);
    }

    // ---------- CHIRPS & IMERG via NASA SERVIR ClimateSERV ----------
    // Asynchronous jobs: submit → poll progress → fetch result. Average over a small box at the station.
    const CLIMATESERV = 'https://climateserv.servirglobal.net/api';
    const toUS = iso => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
    const fromUS = us => `${us.slice(6, 10)}-${us.slice(0, 2)}-${us.slice(3, 5)}`;

    async function climateServStation(datatype, station, start, end) {
        return cached(`cs|${datatype}|${station.lat},${station.lon}|${start}|${end}`, async () => {
            const h = 0.05;
            const geometry = JSON.stringify({
                type: 'Polygon',
                coordinates: [[[station.lon - h, station.lat - h], [station.lon + h, station.lat - h],
                               [station.lon + h, station.lat + h], [station.lon - h, station.lat + h],
                               [station.lon - h, station.lat - h]]]
            });
            const q = new URLSearchParams({
                datatype, begintime: toUS(start), endtime: toUS(end),
                intervaltype: 0, operationtype: 5, geometry
            });
            const job = await getJson(`${CLIMATESERV}/submitDataRequest/?${q}`);
            const id = Array.isArray(job) ? job[0] : job;
            for (let i = 0; i < 120; i++) {
                const p = await getJson(`${CLIMATESERV}/getDataRequestProgress/?id=${id}`);
                const pct = Array.isArray(p) ? p[0] : p;
                if (pct >= 100) break;
                if (pct < 0) throw new Error('ClimateSERV job failed');
                await new Promise(r => setTimeout(r, 1000));
            }
            const res = await getJson(`${CLIMATESERV}/getDataFromRequest/?id=${id}`);
            if (res.errMsg) throw new Error(res.errMsg);
            const map = new Map();
            for (const r of res.data || []) {
                const v = r.raw_value ?? r.value?.avg;
                map.set(fromUS(r.date), (v === null || v === undefined || v <= -9000 || Number.isNaN(v)) ? null : v);
            }
            return map;
        });
    }

    function climateServSource(datatype) {
        return async (stations, start, end, onProgress) => {
            const days = dateList(start, end);
            let done = 0;
            return mapLimit(stations, 6, async s => {
                const daily = blankDaily(days.length);
                let available = false;
                try {
                    const m = await climateServStation(datatype, s, start, end);
                    days.forEach((d, i) => { if (m.has(d)) { daily.precipitation_sum[i] = m.get(d); if (m.get(d) !== null) available = true; } });
                } catch (e) { console.warn(`ClimateSERV ${datatype} failed for ${s.name}:`, e); }
                onProgress && onProgress(++done, stations.length);
                return { time: days, daily, available };
            });
        };
    }

    // ---------- NASA POWER ----------
    const POWER_PARAMS = {
        PRECTOTCORR: ['precipitation_sum', 1],
        T2M: ['temperature_2m_mean', 1],
        T2M_MAX: ['temperature_2m_max', 1],
        T2M_MIN: ['temperature_2m_min', 1],
        RH2M: ['relative_humidity_2m_mean', 1],
        T2MDEW: ['dew_point_2m_mean', 1],
        ALLSKY_SFC_SW_DWN: ['shortwave_radiation_sum', 1],   // MJ/m²/day
        WS10M: ['wind_speed_10m_mean', 3.6],                // m/s → km/h
        WS10M_MAX: ['wind_speed_10m_max', 3.6],
    };

    async function fetchPower(stations, start, end, onProgress) {
        const days = dateList(start, end);
        let done = 0;
        return mapLimit(stations, 4, async s => {
            const daily = blankDaily(days.length);
            let available = false;
            try {
                const q = new URLSearchParams({
                    parameters: Object.keys(POWER_PARAMS).join(','), community: 'AG',
                    latitude: s.lat, longitude: s.lon,
                    start: start.replace(/-/g, ''), end: end.replace(/-/g, ''), format: 'JSON'
                });
                const json = await cached(`power|${s.lat},${s.lon}|${start}|${end}`,
                    () => getJson(`https://power.larc.nasa.gov/api/temporal/daily/point?${q}`));
                const p = json.properties.parameter;
                for (const [param, [key, scale]] of Object.entries(POWER_PARAMS)) {
                    days.forEach((d, i) => {
                        const v = p[param]?.[d.replace(/-/g, '')];
                        if (v !== undefined && v !== null && v > -990) { daily[key][i] = v * scale; available = true; }
                    });
                }
            } catch (e) { console.warn(`NASA POWER failed for ${s.name}:`, e); }
            onProgress && onProgress(++done, stations.length);
            return { time: days, daily, available };
        });
    }

    // ---------- GFS & ECMWF forecasts (Open-Meteo) ----------
    const FORECAST_VARS = ['precipitation_sum', 'temperature_2m_mean', 'temperature_2m_max', 'temperature_2m_min',
        'relative_humidity_2m_mean', 'dew_point_2m_mean', 'et0_fao_evapotranspiration', 'shortwave_radiation_sum',
        'sunshine_duration', 'wind_speed_10m_mean', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'pressure_msl_mean',
        'soil_moisture_0_to_7cm_mean'];

    function forecastSource(model) {
        return async (stations, start, end) => {
            const q = new URLSearchParams({
                latitude: stations.map(s => s.lat).join(','),
                longitude: stations.map(s => s.lon).join(','),
                models: model, daily: FORECAST_VARS.join(','),
                start_date: start, end_date: end, timezone: 'Asia/Riyadh'
            });
            const json = await cached(`fc|${model}|${stations.map(s => s.id).join(',')}|${start}|${end}`,
                () => getJson(`https://api.open-meteo.com/v1/forecast?${q}`));
            const arr = Array.isArray(json) ? json : [json];
            return arr.map(r => {
                const time = r.daily.time;
                const daily = blankDaily(time.length);
                let available = false;
                for (const k of FORECAST_VARS) {
                    const sc = VARS[k].scale || 1;
                    (r.daily[k] || []).forEach((v, i) => { if (v !== null) { daily[k][i] = v * sc; available = true; } });
                }
                return { time, daily, available };
            });
        };
    }

    // ---------- Registry ----------
    const allKeys = Object.keys(VARS);
    const S = (o) => o;
    const DATA_SOURCES = {
        ncm: S({
            name: 'NCM observed', provider: 'National Center for Meteorology stations (WMO exchange, NOAA NCEI GSOD)',
            kind: 'observed', color: '#34e89e',
            vars: allKeys.filter(k => VARS[k].src !== 'era5'),
            range: () => ({ min: '1973-01-01', max: DU.shiftDate(today(), -1) }),
            fetch: (st, a, b) => window.fetchObserved(st, a, b)
        }),
        era5: S({
            name: 'ERA5 reanalysis', provider: 'ECMWF ERA5 via Open-Meteo Historical API (~25 km)',
            kind: 'model', color: '#f9a825',
            vars: allKeys.filter(k => VARS[k].src !== 'ncm'),
            range: () => ({ min: DU.ARCHIVE_MIN, max: DU.archiveMaxDate() }),
            fetch: (st, a, b) => window.fetchArchive(st, a, b)
        }),
        chirps: S({
            name: 'CHIRPS', provider: 'CHIRPS v2 satellite + gauge rainfall, UCSB Climate Hazards Center (5 km), via NASA SERVIR ClimateSERV',
            kind: 'satellite', color: '#42a5f5', vars: ['precipitation_sum'], slow: true,
            range: () => ({ min: '1981-01-01', max: DU.shiftDate(today(), -1) }),
            fetch: climateServSource(0)
        }),
        imerg: S({
            name: 'IMERG', provider: 'NASA GPM IMERG satellite rainfall (10 km), daily product served by NASA SERVIR ClimateSERV. Satellite-only near-real-time IMERG is not gauge-corrected and can overestimate desert thunderstorms — compare with CHIRPS and stations.',
            kind: 'satellite', color: '#ab47bc', vars: ['precipitation_sum'], slow: true,
            range: () => ({ min: '2000-06-01', max: DU.shiftDate(today(), -1) }),
            fetch: climateServSource(26)
        }),
        power: S({
            name: 'NASA POWER', provider: 'NASA POWER (MERRA-2 meteorology, CERES/GEWEX solar, IMERG-based rainfall; ~50 km)',
            kind: 'model', color: '#ef5350', vars: Object.values(POWER_PARAMS).map(v => v[0]), slow: true,
            range: () => ({ min: '1981-01-01', max: DU.shiftDate(today(), -3) }),
            fetch: fetchPower
        }),
        gfs: S({
            name: 'GFS forecast', provider: 'NOAA NCEP Global Forecast System via Open-Meteo (up to 16 days ahead)',
            kind: 'forecast', color: '#26c6da', vars: FORECAST_VARS,
            range: () => ({ min: DU.shiftDate(today(), -92), max: DU.shiftDate(today(), 15) }),
            fetch: forecastSource('gfs_seamless')
        }),
        ecmwf: S({
            name: 'ECMWF forecast', provider: 'ECMWF IFS 0.25° forecast via Open-Meteo (up to 15 days ahead)',
            kind: 'forecast', color: '#ff7043', vars: FORECAST_VARS,
            range: () => ({ min: DU.shiftDate(today(), -92), max: DU.shiftDate(today(), 14) }),
            fetch: forecastSource('ecmwf_ifs025')
        }),
    };
    window.DATA_SOURCES = DATA_SOURCES;

    // Check a period against a source's coverage. Returns an error message or null.
    window.sourceRangeError = (key, from, until) => {
        const src = DATA_SOURCES[key];
        const r = src.range();
        if (!from || !until) return 'Choose both a From and an Until date.';
        if (from > until) return '"From" must be before "Until".';
        if (from < r.min || until > r.max) return `${src.name} covers ${r.min} to ${r.max}.`;
        return null;
    };

    window.fetchSource = (key, stations, start, end, onProgress) =>
        DATA_SOURCES[key].fetch(stations, start, end, onProgress);

    // ---------- Station outlook products ----------

    // ECMWF SEAS5 seasonal forecast: monthly ensemble mean and anomaly, ~6 months ahead
    window.fetchSeasonal = station => cached(`seas5|${station.id}`, async () => {
        const q = new URLSearchParams({
            latitude: station.lat, longitude: station.lon, models: 'ecmwf_seas5',
            monthly: 'precipitation_mean,precipitation_anomaly,temperature_2m_mean,temperature_2m_anomaly'
        });
        const j = await getJson(`https://seasonal-api.open-meteo.com/v1/seasonal?${q}`);
        return j.monthly;
    });

    // CMIP6 HighResMIP projections (models distributed through ESGF), downscaled to ~10 km.
    // Two 20-year windows (reference 1995–2014, future 2031–2050) and 3 models keep each
    // request within Open-Meteo's free per-minute limit.
    const CMIP6_MODELS = ['MRI_AGCM3_2_S', 'EC_Earth3P_HR', 'MPI_ESM1_2_XR'];
    const CMIP6_WINDOWS = [[1995, 2014], [2031, 2050]];
    window.CMIP6_MODELS = CMIP6_MODELS;
    window.fetchCmip6 = station => cached(`cmip6|${station.id}`, async () => {
        const years = [];
        for (let y = CMIP6_WINDOWS[0][0]; y <= CMIP6_WINDOWS[1][1]; y++) years.push(y);
        const acc = Object.fromEntries(CMIP6_MODELS.map(m => [m, years.map(() => ({ p: 0, np: 0, t: 0, nt: 0 }))]));
        for (const [y0, y1] of CMIP6_WINDOWS) {
            const q = new URLSearchParams({
                latitude: station.lat, longitude: station.lon,
                start_date: `${y0}-01-01`, end_date: `${y1}-12-31`,
                models: CMIP6_MODELS.join(','), daily: 'precipitation_sum,temperature_2m_mean'
            });
            const j = await getJson(`https://climate-api.open-meteo.com/v1/climate?${q}`, 1);
            for (const m of CMIP6_MODELS) {
                const p = j.daily[`precipitation_sum_${m}`], t = j.daily[`temperature_2m_mean_${m}`];
                if (!p || !t) continue;
                j.daily.time.forEach((d, i) => {
                    const a = acc[m][Number(d.slice(0, 4)) - years[0]];
                    if (p[i] !== null) { a.p += p[i]; a.np++; }
                    if (t[i] !== null) { a.t += t[i]; a.nt++; }
                });
            }
        }
        // Annual totals (precipitation) and means (temperature); years outside the windows stay empty
        const out = { years, models: {} };
        for (const m of CMIP6_MODELS) {
            out.models[m] = {
                precip: acc[m].map(a => a.np > 300 ? a.p : null),
                temp: acc[m].map(a => a.nt > 300 ? a.t / a.nt : null)
            };
        }
        return out;
    });

    // Global Solar Atlas (World Bank / Solargis): long-term average solar resource
    window.fetchSolarAtlas = station => cached(`gsa|${station.id}`, () =>
        getJson(`https://api.globalsolaratlas.info/data/lta?loc=${station.lat},${station.lon}`));

    window.sourceUtils = { dateList, mapLimit };
})();
