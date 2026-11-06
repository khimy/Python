// ============================================================
// Station time series: choose a From / Until period for each station
// Data: ERA5 reanalysis via the Open-Meteo Historical (archive) API,
// sampled at each station's coordinates. Free, no API key.
// ============================================================

(function () {
    'use strict';

    // Daily variables available for a chosen period.
    // agg: how daily values combine over a period ('sum' = total, 'mean' = average)
    // nonneg: value can never be negative (used to clamp interpolation)
    const PERIOD_VARS = {
        precipitation_sum:            { label: 'Precipitation',                    unit: 'mm',     agg: 'sum',  nonneg: true, ramp: 'blues' },
        et0_fao_evapotranspiration:   { label: 'Potential Evapotranspiration (ET₀)', unit: 'mm',  agg: 'sum',  nonneg: true, ramp: 'reds' },
        temperature_2m_mean:          { label: 'Mean Temperature',                 unit: '°C',     agg: 'mean', ramp: 'temp' },
        temperature_2m_max:           { label: 'Max Temperature',                  unit: '°C',     agg: 'mean', ramp: 'temp' },
        temperature_2m_min:           { label: 'Min Temperature',                  unit: '°C',     agg: 'mean', ramp: 'temp' },
        relative_humidity_2m_mean:    { label: 'Relative Humidity',                unit: '%',      agg: 'mean', nonneg: true, max: 100, ramp: 'humid' },
        shortwave_radiation_sum:      { label: 'Solar Radiation',                  unit: 'MJ/m²',  agg: 'sum',  nonneg: true, ramp: 'solar' },
        sunshine_duration:            { label: 'Sunshine Duration',                unit: 'h',      agg: 'sum',  nonneg: true, scale: 1 / 3600, ramp: 'solar' },
        soil_moisture_0_to_7cm_mean:  { label: 'Soil Moisture (0–7 cm)',           unit: 'm³/m³',  agg: 'mean', nonneg: true, ramp: 'soil' },
        wind_speed_10m_max:           { label: 'Max Wind Speed',                   unit: 'km/h',   agg: 'mean', nonneg: true, ramp: 'blues' },
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

    // ---------- Data fetching ----------
    const archiveCache = new Map();

    // Fetch daily data for one or many stations in a single request.
    async function fetchArchive(stations, start, end) {
        const key = stations.map(s => s.id).join(',') + '|' + start + '|' + end;
        if (archiveCache.has(key)) return archiveCache.get(key);

        const params = new URLSearchParams({
            latitude: stations.map(s => s.lat).join(','),
            longitude: stations.map(s => s.lon).join(','),
            start_date: start,
            end_date: end,
            daily: Object.keys(PERIOD_VARS).join(','),
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
            const daily = {};
            for (const k of Object.keys(PERIOD_VARS)) {
                const sc = PERIOD_VARS[k].scale || 1;
                daily[k] = (r.daily?.[k] || []).map(v => (v === null || v === undefined) ? null : v * sc);
            }
            return { time: r.daily?.time || [], daily };
        });
        archiveCache.set(key, out);
        return out;
    }
    window.fetchArchive = fetchArchive;

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
    let current = null;   // { station, data }
    let chart = null;

    function fmtNum(v, digits = 2) {
        if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
        return Number(v).toFixed(digits);
    }

    function defaultPeriod() {
        const until = archiveMaxDate();
        return { from: shiftDate(until, -364), until };
    }

    function populateStationSelect() {
        const sel = $('ts-station');
        sel.innerHTML = SAUDI_WEATHER_STATIONS
            .map(s => `<option value="${s.id}">${s.city} — ${s.name}</option>`).join('');
        sel.addEventListener('change', () => openTimeSeries(sel.value));

        const varSel = $('ts-variable');
        varSel.innerHTML = Object.entries(PERIOD_VARS)
            .map(([k, v]) => `<option value="${k}">${v.label} (${v.unit})</option>`).join('');
        varSel.addEventListener('change', renderChart);
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
        $('ts-from').max = $('ts-until').max = archiveMaxDate();
        $('ts-title').textContent = station.name;
        $('ts-meta').textContent = `${station.city} · ${station.lat.toFixed(4)}, ${station.lon.toFixed(4)} · ${station.elevation} m · WMO ${station.wmo}`;
        $('ts-modal').classList.remove('hidden');
        current = { station, data: null };
        loadSeries();
    }
    window.openTimeSeries = openTimeSeries;

    async function loadSeries() {
        if (!current) return;
        const from = $('ts-from').value, until = $('ts-until').value;
        const err = validateRange(from, until);
        const status = $('ts-status');
        if (err) { status.textContent = err; status.className = 'status error'; return; }

        stationPeriods[current.station.id] = { from, until };
        try { localStorage.setItem('stationPeriods', JSON.stringify(stationPeriods)); } catch (e) { /* ignore */ }

        status.textContent = 'Loading…';
        status.className = 'status';
        try {
            const [data] = await fetchArchive([current.station], from, until);
            current.data = data;
            status.textContent = `${data.time.length} days loaded (${from} → ${until}).`;
            renderSummary();
            renderChart();
        } catch (e) {
            status.textContent = 'Could not load data: ' + e.message;
            status.className = 'status error';
        }
    }

    function renderSummary() {
        const d = current.data;
        const rows = Object.entries(PERIOD_VARS).map(([k, v]) => {
            const s = summarize(d.daily[k], v.agg);
            return `<tr>
                <td>${v.label}</td>
                <td class="num"><strong>${fmtNum(s.value)}</strong> ${v.unit}</td>
                <td class="num">${v.agg === 'sum' ? 'Total' : 'Mean'}</td>
                <td class="num">${fmtNum(s.min)}</td>
                <td class="num">${fmtNum(s.max)}</td>
                <td class="num">${s.missing}</td>
            </tr>`;
        }).join('');
        $('ts-summary').innerHTML = `<table class="data-table">
            <thead><tr><th>Variable</th><th>Period value</th><th>Type</th><th>Daily min</th><th>Daily max</th><th>Missing days</th></tr></thead>
            <tbody>${rows}</tbody></table>`;
    }

    function renderChart() {
        if (!current?.data || typeof Chart === 'undefined') return;
        const key = $('ts-variable').value;
        const v = PERIOD_VARS[key];
        const by = $('ts-group').value;
        const g = groupSeries(current.data.time, current.data.daily[key], by, v.agg);

        if (chart) chart.destroy();
        chart = new Chart($('ts-chart').getContext('2d'), {
            type: v.agg === 'sum' ? 'bar' : 'line',
            data: {
                labels: g.labels,
                datasets: [{
                    label: `${v.label} (${v.unit}) — ${by}`,
                    data: g.data,
                    borderColor: '#34e89e',
                    backgroundColor: 'rgba(52,232,158,0.55)',
                    pointRadius: 0,
                    borderWidth: 1.5,
                    spanGaps: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: { ticks: { color: '#aaa', maxTicksLimit: 10 }, grid: { color: '#2a2a4a' } },
                    y: { ticks: { color: '#aaa' }, grid: { color: '#2a2a4a' } }
                },
                plugins: { legend: { labels: { color: '#ddd' } } }
            }
        });
    }

    function downloadCsv() {
        if (!current?.data) return;
        const keys = Object.keys(PERIOD_VARS);
        const header = ['date', ...keys.map(k => `${k} (${PERIOD_VARS[k].unit})`)].join(',');
        const lines = current.data.time.map((t, i) =>
            [t, ...keys.map(k => current.data.daily[k][i] ?? '')].join(','));
        const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${current.station.id}_${$('ts-from').value}_${$('ts-until').value}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function setQuickRange(days) {
        const until = archiveMaxDate();
        $('ts-until').value = until;
        $('ts-from').value = shiftDate(until, -(days - 1));
        loadSeries();
    }

    populateStationSelect();
    $('ts-close').addEventListener('click', () => $('ts-modal').classList.add('hidden'));
    $('ts-modal').addEventListener('click', e => { if (e.target.id === 'ts-modal') $('ts-modal').classList.add('hidden'); });
    $('ts-load').addEventListener('click', loadSeries);
    $('ts-csv').addEventListener('click', downloadCsv);
    document.querySelectorAll('[data-quick]').forEach(b =>
        b.addEventListener('click', () => setQuickRange(Number(b.dataset.quick))));
})();
