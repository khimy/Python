// ============================================================
// Station time series: choose a From / Until period for each station
// Two data sources, shown side by side:
//   • NCM observed — the station's own daily observations (see ncm.js)
//   • ERA5 model   — ECMWF reanalysis at the station coordinates via the
//                    Open-Meteo Historical API (complete, 1940 → ~6 days ago)
// ============================================================

(function () {
    'use strict';

    // Daily variables.
    // agg:    how daily values combine over a period ('sum' = total, 'mean' = average,
    //         'circ' = circular mean for directions)
    // nonneg: value can never be negative (used to clamp interpolation)
    // src:    'both' (NCM + ERA5) | 'era5' (ERA5, not NCM) | 'ncm' (NCM only) | 'cams' (atmospheric composition)
    // noAreal: not meaningful to interpolate over an area (directions)
    const PERIOD_VARS = {
        precipitation_sum:           { label: 'Precipitation',                      unit: 'mm',    agg: 'sum',  nonneg: true, ramp: 'blues', src: 'both' },
        temperature_2m_mean:         { label: 'Mean Temperature',                   unit: '°C',    agg: 'mean', ramp: 'temp',  src: 'both' },
        temperature_2m_max:          { label: 'Max Temperature',                    unit: '°C',    agg: 'mean', ramp: 'temp',  src: 'both' },
        temperature_2m_min:          { label: 'Min Temperature',                    unit: '°C',    agg: 'mean', ramp: 'temp',  src: 'both' },
        relative_humidity_2m_mean:   { label: 'Relative Humidity',                  unit: '%',     agg: 'mean', nonneg: true, max: 100, ramp: 'humid', src: 'both' },
        dew_point_2m_mean:           { label: 'Dew Point',                          unit: '°C',    agg: 'mean', ramp: 'humid', src: 'both' },
        wind_speed_10m_mean:         { label: 'Mean Wind Speed',                    unit: 'km/h',  agg: 'mean', nonneg: true, ramp: 'blues', src: 'both' },
        wind_speed_10m_max:          { label: 'Max Wind Speed',                     unit: 'km/h',  agg: 'mean', nonneg: true, ramp: 'blues', src: 'both' },
        wind_gusts_10m_max:          { label: 'Max Wind Gust',                      unit: 'km/h',  agg: 'mean', nonneg: true, ramp: 'blues', src: 'both' },
        wind_direction_10m_dominant: { label: 'Dominant Wind Direction',            unit: '° from', agg: 'circ', ramp: 'blues', src: 'era5', noAreal: true },
        pressure_msl_mean:           { label: 'Sea-Level Pressure',                 unit: 'hPa',   agg: 'mean', ramp: 'temp',  src: 'both' },
        et0_fao_evapotranspiration:  { label: 'Potential Evapotranspiration (ET₀)', unit: 'mm',    agg: 'sum',  nonneg: true, ramp: 'reds',  src: 'era5' },
        shortwave_radiation_sum:     { label: 'Solar Radiation',                    unit: 'MJ/m²', agg: 'sum',  nonneg: true, ramp: 'solar', src: 'era5' },
        sunshine_duration:           { label: 'Sunshine Duration',                  unit: 'h',     agg: 'sum',  nonneg: true, scale: 1 / 3600, ramp: 'solar', src: 'era5' },
        soil_moisture_0_to_7cm_mean: { label: 'Soil Moisture (0–7 cm)',             unit: 'm³/m³', agg: 'mean', nonneg: true, ramp: 'soil',  src: 'era5' },
        visibility_mean:             { label: 'Visibility',                         unit: 'km',    agg: 'mean', nonneg: true, ramp: 'blues', src: 'ncm' },
        fog_days:                    { label: 'Days with Fog',                      unit: 'days',  agg: 'sum',  nonneg: true, ramp: 'blues', src: 'ncm' },
        thunder_days:                { label: 'Days with Thunder',                  unit: 'days',  agg: 'sum',  nonneg: true, ramp: 'blues', src: 'ncm' },
        // Atmospheric composition (Copernicus CAMS, daily means of hourly values)
        nitrogen_dioxide:            { label: 'Nitrogen Dioxide (NO₂)',             unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        sulphur_dioxide:             { label: 'Sulphur Dioxide (SO₂)',              unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        formaldehyde:                { label: 'Formaldehyde (HCHO)',                unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        carbon_dioxide:              { label: 'Carbon Dioxide (CO₂)',               unit: 'ppm',   agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        methane:                     { label: 'Methane (CH₄)',                      unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        ozone:                       { label: 'Ozone (O₃)',                         unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        carbon_monoxide:             { label: 'Carbon Monoxide (CO)',               unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        dust:                        { label: 'Dust',                               unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'solar', src: 'cams' },
        pm2_5:                       { label: 'PM2.5',                              unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
        pm10:                        { label: 'PM10',                               unit: 'µg/m³', agg: 'mean', nonneg: true, ramp: 'reds',  src: 'cams' },
    };
    window.PERIOD_VARS = PERIOD_VARS;

    // ---------- Date helpers ----------
    const ARCHIVE_MIN = '1940-01-01';
    const isoDate = d => d.toISOString().slice(0, 10);
    function archiveMaxDate() {
        // ERA5 reanalysis is published with roughly a 5-day delay
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 6);
        return isoDate(d);
    }
    function shiftDate(iso, days) {
        const d = new Date(iso + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + days);
        return isoDate(d);
    }
    function validateRange(from, until) {
        if (!from || !until) return 'Choose both a From and an Until date.';
        if (from > until) return '"From" must be before "Until".';
        if (from < ARCHIVE_MIN) return `Data starts on ${ARCHIVE_MIN}.`;
        if (until > archiveMaxDate()) return `Data is only available until ${archiveMaxDate()} (about 6 days ago).`;
        return null;
    }
    window.dateUtils = { isoDate, archiveMaxDate, shiftDate, validateRange, ARCHIVE_MIN };

    // ---------- ERA5 model data ----------
    const archiveCache = new Map();

    // Fetch daily ERA5 data for one or many stations in a single request.
    async function fetchArchive(stations, start, end) {
        const key = stations.map(s => s.id).join(',') + '|' + start + '|' + end;
        if (archiveCache.has(key)) return archiveCache.get(key);

        const modelKeys = Object.keys(PERIOD_VARS).filter(k => ['both', 'era5'].includes(PERIOD_VARS[k].src));
        const params = new URLSearchParams({
            latitude: stations.map(s => s.lat).join(','),
            longitude: stations.map(s => s.lon).join(','),
            start_date: start,
            end_date: end,
            daily: modelKeys.join(','),
            timezone: 'Asia/Riyadh'
        });
        const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
        let res;
        try {
            res = await fetch(url);
        } catch (e) {
            // one retry after a short pause for temporary network errors
            await new Promise(r => setTimeout(r, 2000));
            res = await fetch(url);
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) throw new Error(json.reason || `HTTP ${res.status}`);

        const arr = Array.isArray(json) ? json : [json];
        const out = arr.map(r => {
            const time = r.daily?.time || [];
            const daily = {};
            for (const k of Object.keys(PERIOD_VARS)) {
                const sc = PERIOD_VARS[k].scale || 1;
                daily[k] = r.daily?.[k]
                    ? r.daily[k].map(v => (v === null || v === undefined) ? null : v * sc)
                    : new Array(time.length).fill(null);
            }
            return { time, daily, available: true };
        });
        archiveCache.set(key, out);
        return out;
    }
    window.fetchArchive = fetchArchive;


    function summarize(values, agg) {
        if (agg === 'circ') {
            // Circular mean of directions (degrees); min / max are not meaningful
            let n = 0, sx = 0, sy = 0;
            for (const v of values) {
                if (v === null || Number.isNaN(v)) continue;
                n++; sx += Math.sin(v * Math.PI / 180); sy += Math.cos(v * Math.PI / 180);
            }
            if (!n) return { value: null, min: null, max: null, n: 0, missing: values.length };
            const deg = (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
            return { value: deg, min: null, max: null, n, missing: values.length - n };
        }
        let n = 0, sum = 0, min = Infinity, max = -Infinity;
        for (const v of values) {
            if (v === null || Number.isNaN(v)) continue;
            n++; sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!n) return { value: null, min: null, max: null, n: 0, missing: values.length };
        return { value: agg === 'sum' ? sum : sum / n, min, max, n, missing: values.length - n };
    }
    window.summarizeSeries = summarize;

    // Group a daily series by month or year using the variable's rule (sum or mean)
    function groupSeries(time, values, by, agg) {
        if (by === 'daily') return { labels: time, data: values };
        const len = by === 'monthly' ? 7 : 4;
        const groups = new Map();
        time.forEach((t, i) => {
            const k = t.slice(0, len);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(values[i]);
        });
        const labels = [], data = [];
        for (const [k, vals] of groups) {
            labels.push(k);
            data.push(summarize(vals, agg).value);
        }
        return { labels, data };
    }


    // ---------- Modal UI ----------
    const stationPeriods = {};   // each station remembers its own From / Until
    try { Object.assign(stationPeriods, JSON.parse(localStorage.getItem('stationPeriods') || '{}')); } catch (e) { /* storage unavailable */ }

    const $ = id => document.getElementById(id);
    let current = null;    // { station, series: { sourceKey: data } }
    let loadToken = 0;     // newer loads cancel older ones
    let chart = null, outlookChart = null;

    function fmtNum(v, digits = 2) {
        if (v === null || v === undefined || Number.isNaN(v)) return '—';
        return Number(v).toFixed(digits);
    }

    // Latest date that has both NCM observations and ERA5 data
    const latestCommonDate = () => (window.NCM_DATA_END && window.NCM_DATA_END < archiveMaxDate()) ? window.NCM_DATA_END : archiveMaxDate();

    function defaultPeriod() {
        const until = latestCommonDate();
        return { from: shiftDate(until, -364), until };
    }

    const checkedSources = () => [...document.querySelectorAll('#ts-sources input:checked')].map(i => i.value);

    function populateSelects() {
        const sel = $('ts-station');
        sel.innerHTML = SAUDI_WEATHER_STATIONS
            .map(s => `<option value="${s.id}">${s.city} — ${s.name}${s.gsod ? '' : ' (no NCM observations)'}</option>`).join('');
        sel.addEventListener('change', () => openTimeSeries(sel.value));

        $('ts-sources').innerHTML = Object.entries(window.DATA_SOURCES).map(([k, s]) => `
            <label class="src-check" title="${s.provider}">
                <input type="checkbox" value="${k}" ${k === 'ncm' || k === 'era5' ? 'checked' : ''}>
                <span class="swatch" style="background:${s.color}"></span>${s.name}
            </label>`).join('');
        $('ts-sources').addEventListener('change', loadSeries);

        $('ts-variable').innerHTML = Object.entries(PERIOD_VARS)
            .map(([k, v]) => `<option value="${k}">${v.label} (${v.unit})</option>`).join('');
        $('ts-variable').addEventListener('change', renderChart);
        $('ts-group').addEventListener('change', renderChart);
    }

    function openTimeSeries(stationId) {
        const station = SAUDI_WEATHER_STATIONS.find(s => s.id === stationId);
        if (!station) return;
        const p = stationPeriods[stationId] || defaultPeriod();
        $('ts-station').value = stationId;
        $('ts-from').value = p.from;
        $('ts-until').value = p.until;
        $('ts-from').min = $('ts-until').min = ARCHIVE_MIN;
        $('ts-from').max = $('ts-until').max = shiftDate(isoDate(new Date()), 15);
        $('ts-title').textContent = station.name;
        $('ts-meta').textContent = `${station.city} · ${station.lat.toFixed(4)}, ${station.lon.toFixed(4)} · ${station.elevation} m · WMO ${station.wmo}`
            + (station.gsod ? ` · NCM observations: NOAA GSOD ${station.gsod}` : ' · no NCM/WMO observations available');
        $('ts-outlook').innerHTML = '';
        $('ts-modal').classList.remove('hidden');
        current = { station, series: {} };
        loadSeries();
    }
    window.openTimeSeries = openTimeSeries;

    async function loadSeries() {
        if (!current) return;
        const from = $('ts-from').value, until = $('ts-until').value;
        const status = $('ts-status');
        if (!from || !until || from > until) {
            status.textContent = 'Choose a From date before the Until date.';
            status.className = 'status error';
            return;
        }
        stationPeriods[current.station.id] = { from, until };
        try { localStorage.setItem('stationPeriods', JSON.stringify(stationPeriods)); } catch (e) { /* ignore */ }

        const station = current.station;
        const keys = checkedSources();
        const lines = {};
        const token = ++loadToken;
        const series = {};
        const show = () => {
            status.innerHTML = keys.map(k => `<span style="color:${window.DATA_SOURCES[k].color}">■</span> <b>${window.DATA_SOURCES[k].name}:</b> ${lines[k] || 'loading…'}`).join('<br>');
        };
        status.className = 'status';
        show();

        await Promise.all(keys.map(async k => {
            const src = window.DATA_SOURCES[k];
            if (k === 'ncm' && !station.gsod) { lines[k] = 'this station does not report to the WMO.'; return; }
            // Use the part of the chosen period the source covers
            const r = src.range();
            const a = from < r.min ? r.min : from, b = until > r.max ? r.max : until;
            if (a > b) { lines[k] = `not available for this period (covers ${r.min} to ${r.max}).`; return; }
            try {
                const [d] = await src.fetch([station], a, b, null);
                if (token !== loadToken) return;
                if (!d.available) { lines[k] = 'no data for this period' + (k === 'ncm' ? ` (the NOAA archive currently ends on ${window.NCM_DATA_END}).` : '.'); return; }
                series[k] = d;
                let msg = `${d.time.length} days${a !== from || b !== until ? ` (${a} → ${b}, the part this source covers)` : ''}.`;
                if (k === 'ncm') {
                    msg = `${d.daysReported} of ${d.time.length} days reported.`
                        + (d.noPrecipReport ? ` ${d.noPrecipReport} day(s) had no precipitation report and count as 0 mm.` : '')
                        + (d.rainNoAmount ? ` <span class="err">⚠ Rain was observed on ${d.rainNoAmount} day(s) with no amount reported, so the precipitation total is too low.</span>` : '');
                }
                lines[k] = msg;
            } catch (e) {
                lines[k] = `<span class="err">could not load (${e.message}).</span>`;
            }
            if (token === loadToken) show();
        }));
        if (token !== loadToken) return;   // a newer load has started
        current.series = series;
        show();
        renderSummary();
        renderChart();
    }

    function renderSummary() {
        const keys = Object.keys(current.series);
        if (!keys.length) { $('ts-summary').innerHTML = ''; return; }
        const head = keys.map(k => `<th style="color:${window.DATA_SOURCES[k].color}">${window.DATA_SOURCES[k].name}</th>`).join('');
        const rows = Object.entries(PERIOD_VARS).map(([vk, v]) => {
            const cells = keys.map(k => {
                if (!window.DATA_SOURCES[k].vars.includes(vk)) return '<td class="num">—</td>';
                const s = summarize(current.series[k].daily[vk], v.agg);
                return `<td class="num" title="${s.missing} missing day(s)">${fmtNum(s.value)}</td>`;
            }).join('');
            return `<tr><td>${v.label} <span class="small">(${v.unit})</span></td><td class="num">${v.agg === 'sum' ? 'Total' : 'Mean'}</td>${cells}</tr>`;
        }).join('');
        $('ts-summary').innerHTML = `<div class="table-scroll"><table class="data-table">
            <thead><tr><th>Variable</th><th>Type</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
            <p class="small">"—" = not provided by that source. Hover a value to see its missing days. Each source covers only part of the period when its dates are limited.</p>`;
    }

    function renderChart() {
        if (!current || typeof Chart === 'undefined') return;
        const vk = $('ts-variable').value;
        const v = PERIOD_VARS[vk];
        const by = $('ts-group').value;

        // Common date axis across all sources
        const allDates = [...new Set(Object.values(current.series).flatMap(d => d.time))].sort();
        const labels = groupSeries(allDates, allDates.map(() => 0), by, 'sum').labels;

        const datasets = Object.entries(current.series)
            .filter(([k]) => window.DATA_SOURCES[k].vars.includes(vk))
            .map(([k, d]) => {
                const g = groupSeries(d.time, d.daily[vk], by, v.agg);
                const byLabel = new Map(g.labels.map((l, i) => [l, g.data[i]]));
                const src = window.DATA_SOURCES[k];
                return {
                    label: src.name, data: labels.map(l => byLabel.has(l) ? byLabel.get(l) : null),
                    borderColor: src.color, backgroundColor: src.color + 'aa',
                    pointRadius: 0, borderWidth: 1.5, spanGaps: false
                };
            });

        if (chart) chart.destroy();
        chart = new Chart($('ts-chart').getContext('2d'), {
            type: v.agg === 'sum' ? 'bar' : 'line',
            data: { labels, datasets },
            options: chartOptions(`${v.label} (${v.unit})`)
        });
    }

    function chartOptions(yTitle) {
        return {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
                x: { ticks: { color: '#aaa', maxTicksLimit: 10 }, grid: { color: '#2a2a4a' } },
                y: { ticks: { color: '#aaa' }, grid: { color: '#2a2a4a' }, title: { display: true, text: yTitle, color: '#aaa' } }
            },
            plugins: { legend: { labels: { color: '#ddd' } } }
        };
    }

    function downloadCsv() {
        if (!current) return;
        const keys = Object.keys(current.series);
        if (!keys.length) return;
        const vks = Object.keys(PERIOD_VARS);
        const allDates = [...new Set(keys.flatMap(k => current.series[k].time))].sort();
        const idx = Object.fromEntries(keys.map(k => [k, new Map(current.series[k].time.map((t, i) => [t, i]))]));
        const cols = keys.flatMap(k => vks.filter(vk => window.DATA_SOURCES[k].vars.includes(vk)).map(vk => [k, vk]));
        const header = ['date', ...cols.map(([k, vk]) => `${k}_${vk} (${PERIOD_VARS[vk].unit})`)].join(',');
        const lines = allDates.map(t => [t, ...cols.map(([k, vk]) => {
            const i = idx[k].get(t);
            const v = i === undefined ? null : current.series[k].daily[vk][i];
            return v === null ? '' : +v.toFixed(3);
        })].join(','));
        const notes = keys.map(k => `# ${k}_ = ${window.DATA_SOURCES[k].provider}`).join('\n');
        const blob = new Blob([`# Station ${current.station.name} (${current.station.id}, ${current.station.lat}, ${current.station.lon})\n${notes}\n${header}\n${lines.join('\n')}`], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${current.station.id}_${$('ts-from').value}_${$('ts-until').value}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function setQuickRange(days, mode) {
        const t = isoDate(new Date());
        if (mode === 'forecast') {
            $('ts-from').value = t;
            $('ts-until').value = shiftDate(t, 15);
            document.querySelectorAll('#ts-sources input').forEach(i => { i.checked = ['gfs', 'ecmwf'].includes(i.value); });
        } else {
            const until = mode === 'ncm' ? latestCommonDate() : archiveMaxDate();
            $('ts-until').value = until;
            $('ts-from').value = shiftDate(until, -(days - 1));
        }
        loadSeries();
    }

    // ---------- Wind rose ----------
    // Frequency of daily dominant wind directions (16 sectors), split by daily mean wind speed
    function windRose() {
        const order = ['era5', 'power', 'gfs', 'ecmwf'];
        const k = order.find(k => current?.series[k] &&
            current.series[k].daily.wind_direction_10m_dominant.some(v => v !== null));
        if (!k) {
            $('ts-outlook').innerHTML = '<p class="status error">Tick ERA5, NASA POWER, GFS or ECMWF and load a period first (NCM daily data has no wind direction).</p>';
            return;
        }
        const d = current.series[k].daily;
        const classes = [[0, 10, '#c6dbef'], [10, 20, '#6baed6'], [20, 30, '#2171b5'], [30, Infinity, '#08306b']];
        const counts = Array.from({ length: 16 }, () => [0, 0, 0, 0]);
        let n = 0;
        d.wind_direction_10m_dominant.forEach((dir, i) => {
            const sp = d.wind_speed_10m_mean[i];
            if (dir === null || sp === null) return;
            const sec = Math.round(dir / 22.5) % 16;
            const c = classes.findIndex(([a, b]) => sp >= a && sp < b);
            counts[sec][c]++; n++;
        });
        const pct = counts.map(r => r.map(c => c / n * 100));
        const maxTotal = Math.max(...pct.map(r => r.reduce((a, b) => a + b, 0)));
        const ringStep = maxTotal > 30 ? 10 : maxTotal > 12 ? 5 : 2;
        const outer = Math.ceil(maxTotal / ringStep) * ringStep || ringStep;
        const R = 150, cx = 190, cy = 180, scale = r => r / outer * R;
        const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
        const rad = deg => deg * Math.PI / 180;

        let paths = '';
        pct.forEach((row, sec) => {
            let r0 = 0;
            const a0 = rad(sec * 22.5 - 9), a1 = rad(sec * 22.5 + 9);
            row.forEach((p, c) => {
                if (p <= 0) return;
                const ri = scale(r0), ro = scale(r0 + p);
                const [x1, y1] = pt(ri, a0), [x2, y2] = pt(ro, a0), [x3, y3] = pt(ro, a1), [x4, y4] = pt(ri, a1);
                paths += `<path d="M${x1},${y1} L${x2},${y2} A${ro},${ro} 0 0 1 ${x3},${y3} L${x4},${y4} A${ri},${ri} 0 0 0 ${x1},${y1} Z" fill="${classes[c][2]}" stroke="#1a1a2e" stroke-width="0.5"><title>${['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][sec]}: ${p.toFixed(1)}% of days at ${classes[c][0]}–${classes[c][1] === Infinity ? '' : classes[c][1]} km/h</title></path>`;
                r0 += p;
            });
        });
        let rings = '';
        for (let r = ringStep; r <= outer; r += ringStep) {
            rings += `<circle cx="${cx}" cy="${cy}" r="${scale(r)}" fill="none" stroke="#2a2a4a"/>
                      <text x="${cx + 3}" y="${cy - scale(r) + 11}" fill="#888" font-size="10">${r}%</text>`;
        }
        const labels = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([t, a]) => {
            const [x, y] = pt(R + 16, rad(a));
            return `<text x="${x}" y="${y + 4}" fill="#ddd" font-size="13" font-weight="700" text-anchor="middle">${t}</text>`;
        }).join('');
        const legend = classes.map(([a, b, col], i) => `<rect x="395" y="${60 + i * 22}" width="14" height="14" fill="${col}"/>
            <text x="415" y="${72 + i * 22}" fill="#ddd" font-size="12">${b === Infinity ? `> ${a}` : `${a}–${b}`} km/h</text>`).join('');
        const mean = summarize(d.wind_direction_10m_dominant, 'circ').value;

        $('ts-outlook').innerHTML = `<h3 class="method-title">Wind rose — ${window.DATA_SOURCES[k].name}</h3>
            <svg viewBox="0 0 520 360" class="windrose" role="img" aria-label="Wind rose">
                ${rings}<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="#2a2a4a"/>
                <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#2a2a4a"/>
                ${paths}${labels}
                <text x="395" y="45" fill="#34e89e" font-size="12" font-weight="700">Daily mean speed</text>${legend}
            </svg>
            <p class="small">${n} days (${current.series[k].time[0]} → ${current.series[k].time.at(-1)}). Each bar shows how often the day's dominant wind
               came <em>from</em> that direction; colours split it by the day's mean wind speed. Average direction: ${mean === null ? '—' : Math.round(mean) + '°'}.
               Built from daily values; an hourly wind rose would show more detail.</p>`;
    }

    // ---------- Outlook products ----------
    function showOutlook(title, note, tableHtml, chartConfig) {
        $('ts-outlook').innerHTML = `<h3 class="method-title">${title}</h3>
            ${chartConfig ? '<div class="chart-wrap"><canvas id="ts-outlook-chart"></canvas></div>' : ''}
            <div class="table-scroll">${tableHtml}</div><p class="small">${note}</p>`;
        if (outlookChart) { outlookChart.destroy(); outlookChart = null; }
        if (chartConfig) outlookChart = new Chart($('ts-outlook-chart').getContext('2d'), chartConfig);
    }

    async function outlook(kind) {
        if (!current) return;
        const s = current.station;
        $('ts-outlook').innerHTML = '<p class="status">Loading…</p>';
        try {
            if (kind === 'seasonal') {
                const m = await window.fetchSeasonal(s);
                const labels = m.time.map(t => t.slice(0, 7));
                const rows = labels.map((l, i) => `<tr><td>${l}</td>
                    <td class="num">${fmtNum(m.precipitation_mean[i], 1)}</td><td class="num">${fmtNum(m.precipitation_anomaly[i], 1)}</td>
                    <td class="num">${fmtNum(m.temperature_2m_mean[i], 1)}</td><td class="num">${fmtNum(m.temperature_2m_anomaly[i], 1)}</td></tr>`).join('');
                showOutlook('ECMWF seasonal outlook (SEAS5)',
                    'Monthly ensemble mean of the ECMWF SEAS5 seasonal forecast (51 members), with the anomaly against the model climate. Anomalies above 0 mean wetter / warmer than normal. Via the Open-Meteo Seasonal API.',
                    `<table class="data-table"><thead><tr><th>Month</th><th>Precipitation (mm)</th><th>Precip. anomaly (mm)</th><th>Mean temp (°C)</th><th>Temp. anomaly (°C)</th></tr></thead><tbody>${rows}</tbody></table>`,
                    {
                        type: 'bar',
                        data: { labels, datasets: [
                            { label: 'Precipitation anomaly (mm)', data: m.precipitation_anomaly, backgroundColor: m.precipitation_anomaly.map(v => v >= 0 ? '#42a5f5' : '#ef5350') },
                            { label: 'Temperature anomaly (°C)', data: m.temperature_2m_anomaly, type: 'line', borderColor: '#f9a825', yAxisID: 'y2', pointRadius: 3 }
                        ] },
                        options: Object.assign(chartOptions('Precipitation anomaly (mm)'), {
                            scales: Object.assign(chartOptions('Precipitation anomaly (mm)').scales, {
                                y2: { position: 'right', ticks: { color: '#f9a825' }, grid: { display: false }, title: { display: true, text: 'Temp. anomaly (°C)', color: '#f9a825' } }
                            })
                        })
                    });
            } else if (kind === 'cmip6') {
                $('ts-outlook').innerHTML = '<p class="status">Loading 3 climate models for 1995–2014 and 2031–2050…</p>';
                const c = await window.fetchCmip6(s);
                const models = Object.keys(c.models);
                const mean = (arr, y0, y1) => {
                    const v = arr.filter((x, i) => x !== null && c.years[i] >= y0 && c.years[i] <= y1);
                    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
                };
                const rows = models.map(m => {
                    const p0 = mean(c.models[m].precip, 1995, 2014), p1 = mean(c.models[m].precip, 2031, 2050);
                    const t0 = mean(c.models[m].temp, 1995, 2014), t1 = mean(c.models[m].temp, 2031, 2050);
                    return `<tr><td>${m.replace(/_/g, '-')}</td><td class="num">${fmtNum(p0, 0)}</td><td class="num">${fmtNum(p1, 0)}</td>
                        <td class="num">${p0 ? fmtNum((p1 - p0) / p0 * 100, 0) + '%' : '—'}</td>
                        <td class="num">${fmtNum(t0, 1)}</td><td class="num">${fmtNum(t1, 1)}</td><td class="num">+${fmtNum(t1 - t0, 1)}</td></tr>`;
                }).join('');
                const palette = ['#34e89e', '#f9a825', '#42a5f5', '#ab47bc', '#ef5350', '#26c6da', '#ff7043'];
                showOutlook('CMIP6 climate projection (1995–2014 → 2031–2050)',
                    'CMIP6 HighResMIP global models (model output distributed through the Earth System Grid Federation, ESGF), downscaled to ~10 km by Open-Meteo. Lines: annual mean temperature per model in the two 20-year windows. Table: change between the windows. Models disagree strongly on rainfall in arid regions; use the spread, not a single model. Kept to 3 models and two windows to stay within the free API limits.',
                    `<table class="data-table"><thead><tr><th>Model</th><th>Rain 1995–2014 (mm/yr)</th><th>Rain 2031–2050</th><th>Change</th><th>Temp 1995–2014 (°C)</th><th>Temp 2031–2050</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table>`,
                    {
                        type: 'line',
                        data: { labels: c.years, datasets: models.map((m, i) => ({ label: m.replace(/_/g, '-'), data: c.models[m].temp, borderColor: palette[i % palette.length], pointRadius: 0, borderWidth: 1.3 })) },
                        options: chartOptions('Annual mean temperature (°C)')
                    });
            } else if (kind === 'solar') {
                const g = await window.fetchSolarAtlas(s);
                const a = g.annual.data;
                const units = Object.fromEntries(Object.entries(g.annual.metadata?.layers || {}).map(([k, v]) => [k, v.unit]));
                const names = { GHI: 'Global horizontal irradiation', DNI: 'Direct normal irradiation', DIF: 'Diffuse horizontal irradiation',
                    GTI_opta: 'Irradiation at optimum tilt', OPTA: 'Optimum tilt angle', PVOUT_csi: 'PV power output (crystalline silicon)',
                    TEMP: 'Air temperature', ELE: 'Elevation' };
                const rows = Object.keys(names).filter(k => a[k] !== undefined)
                    .map(k => `<tr><td>${names[k]} (${k})</td><td class="num">${fmtNum(a[k], 0)} ${units[k] || ''}${['GHI', 'DNI', 'DIF', 'GTI_opta', 'PVOUT_csi'].includes(k) ? ' / year' : ''}</td></tr>`).join('');
                const md = g.monthly?.data || {};
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                showOutlook('Global Solar Atlas — long-term solar resource',
                    'Long-term averages (about 1994–2023) from the World Bank Global Solar Atlas (Solargis model, ~250 m). Monthly chart: total irradiation per month.',
                    `<table class="data-table"><tbody>${rows}</tbody></table>`,
                    md.GHI ? {
                        type: 'bar',
                        data: { labels: months, datasets: [
                            { label: 'GHI (kWh/m²)', data: md.GHI, backgroundColor: '#f9a825' },
                            { label: 'DNI (kWh/m²)', data: md.DNI, backgroundColor: '#ef5350' },
                            { label: 'PV output (kWh/kWp)', data: md.PVOUT_csi, backgroundColor: '#34e89e' }
                        ] },
                        options: chartOptions('kWh per month')
                    } : null);
            }
        } catch (e) {
            $('ts-outlook').innerHTML = `<p class="status error">Could not load: ${e.message}</p>`;
        }
    }

    // Set up after all scripts (including sources.js) have loaded
    document.addEventListener('DOMContentLoaded', () => {
    populateSelects();
    $('ts-windrose').addEventListener('click', windRose);
    $('ts-close').addEventListener('click', () => $('ts-modal').classList.add('hidden'));
    $('ts-modal').addEventListener('click', e => { if (e.target.id === 'ts-modal') $('ts-modal').classList.add('hidden'); });
    $('ts-load').addEventListener('click', loadSeries);
    $('ts-csv').addEventListener('click', downloadCsv);
    document.querySelectorAll('[data-quick]').forEach(b =>
        b.addEventListener('click', () => setQuickRange(Number(b.dataset.quick), b.dataset.mode)));
    document.querySelectorAll('[data-outlook]').forEach(b =>
        b.addEventListener('click', () => outlook(b.dataset.outlook)));
    });
})();
