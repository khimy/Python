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
    // agg:    how daily values combine over a period ('sum' = total, 'mean' = average)
    // nonneg: value can never be negative (used to clamp interpolation)
    // src:    'both' | 'era5' (model only) | 'ncm' (observed only)
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
        pressure_msl_mean:           { label: 'Sea-Level Pressure',                 unit: 'hPa',   agg: 'mean', ramp: 'temp',  src: 'both' },
        et0_fao_evapotranspiration:  { label: 'Potential Evapotranspiration (ET₀)', unit: 'mm',    agg: 'sum',  nonneg: true, ramp: 'reds',  src: 'era5' },
        shortwave_radiation_sum:     { label: 'Solar Radiation',                    unit: 'MJ/m²', agg: 'sum',  nonneg: true, ramp: 'solar', src: 'era5' },
        sunshine_duration:           { label: 'Sunshine Duration',                  unit: 'h',     agg: 'sum',  nonneg: true, scale: 1 / 3600, ramp: 'solar', src: 'era5' },
        soil_moisture_0_to_7cm_mean: { label: 'Soil Moisture (0–7 cm)',             unit: 'm³/m³', agg: 'mean', nonneg: true, ramp: 'soil',  src: 'era5' },
        visibility_mean:             { label: 'Visibility',                         unit: 'km',    agg: 'mean', nonneg: true, ramp: 'blues', src: 'ncm' },
        fog_days:                    { label: 'Days with Fog',                      unit: 'days',  agg: 'sum',  nonneg: true, ramp: 'blues', src: 'ncm' },
        thunder_days:                { label: 'Days with Thunder',                  unit: 'days',  agg: 'sum',  nonneg: true, ramp: 'blues', src: 'ncm' },
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

        const modelKeys = Object.keys(PERIOD_VARS).filter(k => PERIOD_VARS[k].src !== 'ncm');
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

    // Fetch from the chosen source ('era5' or 'ncm')
    window.fetchSource = (source, stations, start, end) =>
        source === 'ncm' ? window.fetchObserved(stations, start, end) : fetchArchive(stations, start, end);

    function summarize(values, agg) {
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
    let current = null;   // { station, obs, era5 }
    let chart = null;

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

    function populateSelects() {
        const sel = $('ts-station');
        sel.innerHTML = SAUDI_WEATHER_STATIONS
            .map(s => `<option value="${s.id}">${s.city} — ${s.name}${s.gsod ? '' : ' (no NCM observations)'}</option>`).join('');
        sel.addEventListener('change', () => openTimeSeries(sel.value));

        $('ts-variable').innerHTML = Object.entries(PERIOD_VARS)
            .map(([k, v]) => `<option value="${k}">${v.label} (${v.unit})</option>`).join('');
        $('ts-variable').addEventListener('change', renderChart);
        $('ts-group').addEventListener('change', renderChart);
        $('ts-show').addEventListener('change', renderChart);
    }

    function openTimeSeries(stationId) {
        const station = SAUDI_WEATHER_STATIONS.find(s => s.id === stationId);
        if (!station) return;
        const p = stationPeriods[stationId] || defaultPeriod();
        $('ts-station').value = stationId;
        $('ts-from').value = p.from;
        $('ts-until').value = p.until;
        $('ts-from').min = $('ts-until').min = ARCHIVE_MIN;
        $('ts-from').max = $('ts-until').max = archiveMaxDate();
        $('ts-title').textContent = station.name;
        $('ts-meta').textContent = `${station.city} · ${station.lat.toFixed(4)}, ${station.lon.toFixed(4)} · ${station.elevation} m · WMO ${station.wmo}`
            + (station.gsod ? ` · NCM observations: NOAA GSOD ${station.gsod}` : ' · no NCM/WMO observations available');
        $('ts-modal').classList.remove('hidden');
        current = { station, obs: null, era5: null };
        loadSeries();
    }
    window.openTimeSeries = openTimeSeries;

    async function loadSeries() {
        if (!current) return;
        const from = $('ts-from').value, until = $('ts-until').value;
        const err = validateRange(from, until);
        const status = $('ts-status');
        if (err) { status.innerHTML = err; status.className = 'status error'; return; }

        stationPeriods[current.station.id] = { from, until };
        try { localStorage.setItem('stationPeriods', JSON.stringify(stationPeriods)); } catch (e) { /* ignore */ }

        status.textContent = 'Loading NCM observations and ERA5 model data…';
        status.className = 'status';
        const station = current.station;
        const [obsR, eraR] = await Promise.allSettled([
            station.gsod ? window.fetchObserved([station], from, until) : Promise.resolve([null]),
            fetchArchive([station], from, until)
        ]);
        if (current?.station !== station) return;   // user switched station meanwhile

        current.obs = obsR.status === 'fulfilled' ? obsR.value[0] : null;
        current.era5 = eraR.status === 'fulfilled' ? eraR.value[0] : null;

        const lines = [];
        if (!station.gsod) lines.push('NCM observed: this station does not report to the WMO, so only ERA5 model data is shown.');
        else if (obsR.status === 'rejected') lines.push(`<span class="err">NCM observed: could not load (${obsR.reason.message}).</span>`);
        else if (!current.obs.available) lines.push('NCM observed: no reports in this period (the NOAA archive currently ends in late August 2025).');
        else {
            lines.push(`NCM observed: ${current.obs.daysReported} of ${current.obs.time.length} days reported.`
                + (current.obs.noPrecipReport ? ` ${current.obs.noPrecipReport} day(s) had no precipitation report and count as 0 mm.` : ''));
            if (current.obs.rainNoAmount) {
                lines.push(`<span class="err">⚠ Rain was observed on ${current.obs.rainNoAmount} day(s) with no amount reported, so the NCM precipitation total is too low.</span>`);
            }
        }
        if (eraR.status === 'rejected') lines.push(`<span class="err">ERA5 model: could not load (${eraR.reason.message}).</span>`);
        else lines.push(`ERA5 model: ${current.era5.time.length} days (${from} → ${until}).`);
        status.innerHTML = lines.join('<br>');

        renderSummary();
        renderChart();
    }

    function renderSummary() {
        const { obs, era5 } = current;
        const rows = Object.entries(PERIOD_VARS).map(([k, v]) => {
            const so = obs?.available ? summarize(obs.daily[k], v.agg) : null;
            const se = era5 ? summarize(era5.daily[k], v.agg) : null;
            const missing = so && v.src !== 'era5' ? so.missing : '—';
            return `<tr>
                <td>${v.label} <span class="small">(${v.unit})</span></td>
                <td class="num">${v.agg === 'sum' ? 'Total' : 'Mean'}</td>
                <td class="num"><strong>${fmtNum(so?.value)}</strong></td>
                <td class="num">${fmtNum(se?.value)}</td>
                <td class="num">${missing}</td>
            </tr>`;
        }).join('');
        $('ts-summary').innerHTML = `<table class="data-table">
            <thead><tr><th>Variable</th><th>Type</th><th>NCM observed</th><th>ERA5 model</th><th>NCM missing days</th></tr></thead>
            <tbody>${rows}</tbody></table>
            <p class="small">"—" means the source does not provide this variable for this station or period.
            ET₀, solar radiation, sunshine and soil moisture are not measured in the NCM daily exchange; visibility, fog and thunder are observations only.</p>`;
    }

    function renderChart() {
        if (!current || typeof Chart === 'undefined') return;
        const key = $('ts-variable').value;
        const v = PERIOD_VARS[key];
        const by = $('ts-group').value;
        const show = $('ts-show').value;
        const time = (current.era5 || current.obs)?.time;
        if (!time) return;

        const datasets = [];
        if (show !== 'era5' && current.obs?.available) {
            const g = groupSeries(current.obs.time, current.obs.daily[key], by, v.agg);
            datasets.push({ label: 'NCM observed', data: g.data, borderColor: '#34e89e', backgroundColor: 'rgba(52,232,158,0.6)' });
        }
        if (show !== 'ncm' && current.era5) {
            const g = groupSeries(current.era5.time, current.era5.daily[key], by, v.agg);
            datasets.push({ label: 'ERA5 model', data: g.data, borderColor: '#f9a825', backgroundColor: 'rgba(249,168,37,0.55)' });
        }
        const labels = groupSeries(time, time.map(() => 0), by, 'sum').labels;
        datasets.forEach(d => Object.assign(d, { pointRadius: 0, borderWidth: 1.5, spanGaps: false }));

        if (chart) chart.destroy();
        chart = new Chart($('ts-chart').getContext('2d'), {
            type: v.agg === 'sum' ? 'bar' : 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: { ticks: { color: '#aaa', maxTicksLimit: 10 }, grid: { color: '#2a2a4a' } },
                    y: { ticks: { color: '#aaa' }, grid: { color: '#2a2a4a' }, title: { display: true, text: `${v.label} (${v.unit})`, color: '#aaa' } }
                },
                plugins: { legend: { labels: { color: '#ddd' } } }
            }
        });
    }

    function downloadCsv() {
        if (!current) return;
        const keys = Object.keys(PERIOD_VARS);
        const time = (current.era5 || current.obs)?.time;
        if (!time) return;
        const header = ['date',
            ...keys.map(k => `ncm_${k} (${PERIOD_VARS[k].unit})`),
            ...keys.map(k => `era5_${k} (${PERIOD_VARS[k].unit})`)].join(',');
        const cell = (src, k, i) => (src?.available && src.daily[k][i] !== null) ? +src.daily[k][i].toFixed(3) : '';
        const lines = time.map((t, i) => [t,
            ...keys.map(k => cell(current.obs, k, i)),
            ...keys.map(k => cell(current.era5, k, i))].join(','));
        const note = `# Station ${current.station.name} (${current.station.id}); ncm_ = ${window.NCM_SOURCE_NOTE}; era5_ = ECMWF ERA5 via Open-Meteo`;
        const blob = new Blob([note + '\n' + header + '\n' + lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${current.station.id}_${$('ts-from').value}_${$('ts-until').value}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function setQuickRange(days, ncmEnd) {
        const until = ncmEnd ? latestCommonDate() : archiveMaxDate();
        $('ts-until').value = until;
        $('ts-from').value = shiftDate(until, -(days - 1));
        loadSeries();
    }

    populateSelects();
    $('ts-close').addEventListener('click', () => $('ts-modal').classList.add('hidden'));
    $('ts-modal').addEventListener('click', e => { if (e.target.id === 'ts-modal') $('ts-modal').classList.add('hidden'); });
    $('ts-load').addEventListener('click', loadSeries);
    $('ts-csv').addEventListener('click', downloadCsv);
    document.querySelectorAll('[data-quick]').forEach(b =>
        b.addEventListener('click', () => setQuickRange(Number(b.dataset.quick), b.dataset.ncm === '1')));
})();
