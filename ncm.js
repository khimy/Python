// ============================================================
// NCM station observations
// Daily observations from the National Center for Meteorology (NCM)
// synoptic stations, as exchanged through the WMO and archived by
// NOAA NCEI in the "Global Summary of the Day" (GSOD) dataset.
// Free, no API key, and NOAA allows browser requests (CORS).
// ============================================================

(function () {
    'use strict';

    const NOAA_API = 'https://www.ncei.noaa.gov/access/services/data/v1';
    const NCM_SOURCE_NOTE = 'NCM synoptic stations (WMO exchange), archived by NOAA NCEI GSOD';
    // Last day in the NOAA archive when this was written (Nov 2026). Only used for default
    // date ranges and messages; newer data is used automatically if NOAA publishes it.
    window.NCM_DATA_END = '2025-08-24';

    // GSOD reports US units and uses 9999.9 / 999.9 / 99.99 for missing values
    const val = (s, missing) => {
        if (s === undefined || s === null) return null;
        const v = parseFloat(s);
        return (Number.isNaN(v) || v >= missing - 1e-6) ? null : v;
    };
    const fToC = f => f === null ? null : (f - 32) * 5 / 9;
    const knToKmh = k => k === null ? null : k * 1.852;
    const miToKm = m => m === null ? null : m * 1.609344;
    const inToMm = i => i === null ? null : i * 25.4;

    // Relative humidity from daily mean temperature and dew point (Magnus formula)
    function relHumidity(t, td) {
        if (t === null || td === null) return null;
        const e = x => Math.exp(17.625 * x / (243.04 + x));
        return Math.min(100, 100 * e(td) / e(t));
    }

    function dateList(start, end) {
        const out = [];
        for (let d = start; d <= end; d = window.dateUtils.shiftDate(d, 1)) out.push(d);
        return out;
    }

    const cache = new Map();

    async function requestGsod(ids, start, end) {
        const key = ids.join(',') + '|' + start + '|' + end;
        if (cache.has(key)) return cache.get(key);
        const params = new URLSearchParams({
            dataset: 'global-summary-of-the-day',
            stations: ids.join(','),
            startDate: start,
            endDate: end,
            format: 'json',
            includeAttributes: 'true',
            dataTypes: 'TEMP,DEWP,MAX,MIN,PRCP,WDSP,MXSPD,GUST,VISIB,SLP,FRSHTT'
        });
        const url = `${NOAA_API}?${params}`;
        let res;
        try { res = await fetch(url); }
        catch (e) { await new Promise(r => setTimeout(r, 2000)); res = await fetch(url); }
        if (!res.ok) throw new Error(`NOAA NCEI returned HTTP ${res.status}`);
        const rows = await res.json();
        cache.set(key, rows);
        return rows;
    }

    // Returns one entry per station, in the same shape as fetchArchive():
    // { time: [...dates], daily: { variableKey: [...values] }, available, noPrecipReport }
    async function fetchObserved(stations, start, end) {
        const VARS = window.PERIOD_VARS;
        const days = dateList(start, end);
        const index = new Map(days.map((d, i) => [d, i]));
        const blank = () => {
            const daily = {};
            for (const k of Object.keys(VARS)) daily[k] = new Array(days.length).fill(null);
            return daily;
        };

        const ids = [...new Set(stations.map(s => s.gsod).filter(Boolean))];
        const byId = {};
        if (ids.length) {
            // Split long multi-station requests to keep each NOAA response reasonable
            const chunk = days.length > 2000 ? 4 : days.length > 400 ? 12 : ids.length;
            for (let i = 0; i < ids.length; i += chunk) {
                const rows = await requestGsod(ids.slice(i, i + chunk), start, end);
                for (const r of rows) {
                    const di = index.get(r.DATE);
                    if (di === undefined) continue;
                    const st = byId[r.STATION] || (byId[r.STATION] = { daily: blank(), noPrecipReport: 0, rainNoAmount: 0, days: 0 });
                    const d = st.daily;
                    st.days++;

                    const t = fToC(val(r.TEMP, 9999.9));
                    const td = fToC(val(r.DEWP, 9999.9));
                    d.temperature_2m_mean[di] = t;
                    d.temperature_2m_max[di] = fToC(val(r.MAX, 9999.9));
                    d.temperature_2m_min[di] = fToC(val(r.MIN, 9999.9));
                    d.dew_point_2m_mean[di] = td;
                    d.relative_humidity_2m_mean[di] = relHumidity(t, td);
                    d.wind_speed_10m_mean[di] = knToKmh(val(r.WDSP, 999.9));
                    d.wind_speed_10m_max[di] = knToKmh(val(r.MXSPD, 999.9));
                    d.wind_gusts_10m_max[di] = knToKmh(val(r.GUST, 999.9));
                    d.pressure_msl_mean[di] = val(r.SLP, 9999.9);
                    d.visibility_mean[di] = miToKm(val(r.VISIB, 999.9));

                    // Precipitation flag "I": the station sent no precipitation report that day.
                    // NOAA treats it as 0 mm (common at dry stations); we count these days.
                    const p = inToMm(val(r.PRCP, 99.99));
                    d.precipitation_sum[di] = p;
                    if (p !== null && (r.PRCP_ATTRIBUTES || '').trim() === 'I') st.noPrecipReport++;

                    const f = (r.FRSHTT || '').trim();
                    if (f.length === 6) {
                        d.fog_days[di] = f[0] === '1' ? 1 : 0;
                        d.thunder_days[di] = f[4] === '1' ? 1 : 0;
                        // Rain was observed but no amount was reported:
                        // the period total for this station would be too low
                        if (p === null && f[1] === '1') st.rainNoAmount++;
                    }
                }
            }
        }

        return stations.map(s => {
            const st = s.gsod && byId[s.gsod];
            return {
                time: days,
                daily: st ? st.daily : blank(),
                available: !!st,
                daysReported: st ? st.days : 0,
                noPrecipReport: st ? st.noPrecipReport : 0,
                rainNoAmount: st ? st.rainNoAmount : 0
            };
        });
    }

    window.fetchObserved = fetchObserved;
    window.NCM_SOURCE_NOTE = NCM_SOURCE_NOTE;
})();
