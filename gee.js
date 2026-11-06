// ============================================================
// Google Earth Engine
// Two ways to use Earth Engine datasets for Saudi Arabia:
//   1. Sign in here (your own OAuth client ID + Earth Engine Cloud project):
//      map layer for a period, period values at every station, daily series
//      at one station — all computed by Earth Engine.
//   2. Generate a Code Editor script (no setup beyond an Earth Engine account):
//      the same map, station table, chart and CSV exports.
// ============================================================

(function () {
    'use strict';

    const map = window.WX.map;
    const $ = id => document.getElementById(id);
    const DU = window.dateUtils;
    const EE_LIB = 'https://cdn.jsdelivr.net/npm/@google/earthengine@1.7.48/build/ee_api_js.js';
    const REGION = [34.4, 16.3, 55.7, 32.2];   // Saudi Arabia bounding box (W, S, E, N)

    const PAL = {
        gas:   ['000004', '2c105c', '711f81', 'b63679', 'ee605e', 'fdae78', 'fcfdbf'],
        rain:  ['ffffff', 'c6dbef', '6baed6', '2171b5', '08306b'],
        temp:  ['313695', '74add1', 'ffffbf', 'f46d43', 'a50026'],
        evap:  ['fff5f0', 'fcbba1', 'fb6a4a', 'cb181d', '67000d'],
        wind:  ['f7fbff', 'c6dbef', '6baed6', '2171b5', '08306b'],
        soil:  ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665a'],
        diverge: ['b2182b', 'ef8a62', 'fddbc7', 'f7f7f7', 'd1e5f0', '67a9cf', '2166ac'],
        dem:   ['006837', '31a354', 'addd8e', 'fec44f', 'd95f0e', '993404', 'ffffff'],
    };

    // reducer: how images in the period combine ('mean' or 'sum'); mult/add convert to the shown unit.
    // perMonth: max for sums is scaled by the number of months in the period.
    const DATASETS = {
        s5p_no2:  { group: 'Sentinel-5P TROPOMI — atmospheric gases', label: 'Nitrogen dioxide (NO₂), tropospheric column', id: 'COPERNICUS/S5P/OFFL/L3_NO2', band: 'tropospheric_NO2_column_number_density', mult: 1e6, unit: 'µmol/m²', reducer: 'mean', min: 0, max: 150, palette: PAL.gas, scale: 1113.2 },
        s5p_so2:  { group: 'Sentinel-5P TROPOMI — atmospheric gases', label: 'Sulphur dioxide (SO₂), total column', id: 'COPERNICUS/S5P/OFFL/L3_SO2', band: 'SO2_column_number_density', mult: 1e6, unit: 'µmol/m²', reducer: 'mean', min: 0, max: 400, palette: PAL.gas, scale: 1113.2 },
        s5p_hcho: { group: 'Sentinel-5P TROPOMI — atmospheric gases', label: 'Formaldehyde (HCHO), tropospheric column', id: 'COPERNICUS/S5P/OFFL/L3_HCHO', band: 'tropospheric_HCHO_column_number_density', mult: 1e6, unit: 'µmol/m²', reducer: 'mean', min: 0, max: 250, palette: PAL.gas, scale: 1113.2 },
        s5p_ch4:  { group: 'Sentinel-5P TROPOMI — atmospheric gases', label: 'Methane (CH₄), column mixing ratio', id: 'COPERNICUS/S5P/OFFL/L3_CH4', band: 'CH4_column_volume_mixing_ratio_dry_air', mult: 1, unit: 'ppb', reducer: 'mean', min: 1850, max: 1980, palette: PAL.gas, scale: 1113.2 },
        s5p_o3:   { group: 'Sentinel-5P TROPOMI — atmospheric gases', label: 'Ozone (O₃), total column', id: 'COPERNICUS/S5P/OFFL/L3_O3', band: 'O3_column_number_density', mult: 1e3, unit: 'mmol/m²', reducer: 'mean', min: 110, max: 140, palette: PAL.gas, scale: 1113.2 },
        s5p_co:   { group: 'Sentinel-5P TROPOMI — atmospheric gases', label: 'Carbon monoxide (CO), total column', id: 'COPERNICUS/S5P/OFFL/L3_CO', band: 'CO_column_number_density', mult: 1e3, unit: 'mmol/m²', reducer: 'mean', min: 20, max: 45, palette: PAL.gas, scale: 1113.2 },

        era5_tp:   { group: 'ERA5-Land daily (ECMWF, ~11 km)', label: 'Precipitation total', id: 'ECMWF/ERA5_LAND/DAILY_AGGR', band: 'total_precipitation_sum', mult: 1000, unit: 'mm', reducer: 'sum', min: 0, max: 30, perMonth: true, palette: PAL.rain, scale: 11132 },
        era5_t2m:  { group: 'ERA5-Land daily (ECMWF, ~11 km)', label: 'Mean air temperature (2 m)', id: 'ECMWF/ERA5_LAND/DAILY_AGGR', band: 'temperature_2m', mult: 1, add: -273.15, unit: '°C', reducer: 'mean', min: 10, max: 40, palette: PAL.temp, scale: 11132 },
        era5_wind: { group: 'ERA5-Land daily (ECMWF, ~11 km)', label: 'Mean wind speed (10 m)', id: 'ECMWF/ERA5_LAND/DAILY_AGGR',
                     expr: 'sqrt(u * u + v * v) * 3.6', exprBands: { u: 'u_component_of_wind_10m', v: 'v_component_of_wind_10m' },
                     unit: 'km/h', reducer: 'mean', min: 0, max: 25, palette: PAL.wind, scale: 11132 },
        era5_e:    { group: 'ERA5-Land daily (ECMWF, ~11 km)', label: 'Actual evaporation total', id: 'ECMWF/ERA5_LAND/DAILY_AGGR', band: 'total_evaporation_sum', mult: -1000, unit: 'mm', reducer: 'sum', min: 0, max: 30, perMonth: true, palette: PAL.evap, scale: 11132 },
        era5_pev:  { group: 'ERA5-Land daily (ECMWF, ~11 km)', label: 'Potential evaporation total', id: 'ECMWF/ERA5_LAND/DAILY_AGGR', band: 'potential_evaporation_sum', mult: -1000, unit: 'mm', reducer: 'sum', min: 0, max: 400, perMonth: true, palette: PAL.evap, scale: 11132 },
        era5_swvl: { group: 'ERA5-Land daily (ECMWF, ~11 km)', label: 'Soil moisture, top layer (0–7 cm)', id: 'ECMWF/ERA5_LAND/DAILY_AGGR', band: 'volumetric_soil_water_layer_1', mult: 1, unit: 'm³/m³', reducer: 'mean', min: 0, max: 0.3, palette: PAL.soil, scale: 11132 },

        chirps:    { group: 'Rainfall & water', label: 'CHIRPS daily rainfall total (5 km)', id: 'UCSB-CHG/CHIRPS/DAILY', band: 'precipitation', mult: 1, unit: 'mm', reducer: 'sum', min: 0, max: 30, perMonth: true, palette: PAL.rain, scale: 5566 },
        tc_pet:    { group: 'Rainfall & water', label: 'TerraClimate potential evapotranspiration (monthly, 4 km)', id: 'IDAHO_EPSCOR/TERRACLIMATE', band: 'pet', mult: 0.1, unit: 'mm', reducer: 'sum', min: 0, max: 250, perMonth: true, palette: PAL.evap, scale: 4638 },
        tc_aet:    { group: 'Rainfall & water', label: 'TerraClimate actual evapotranspiration (monthly, 4 km)', id: 'IDAHO_EPSCOR/TERRACLIMATE', band: 'aet', mult: 0.1, unit: 'mm', reducer: 'sum', min: 0, max: 30, perMonth: true, palette: PAL.evap, scale: 4638 },
        tc_soil:   { group: 'Rainfall & water', label: 'TerraClimate soil moisture (monthly, 4 km)', id: 'IDAHO_EPSCOR/TERRACLIMATE', band: 'soil', mult: 0.1, unit: 'mm', reducer: 'mean', min: 0, max: 30, palette: PAL.soil, scale: 4638 },
        grace:     { group: 'Rainfall & water', label: 'GRACE water storage anomaly (monthly)', id: 'NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI', band: 'lwe_thickness', mult: 1, unit: 'cm', reducer: 'mean', min: -20, max: 20, palette: PAL.diverge, scale: 55660 },

        modis_lst: { group: 'MODIS (land surface)', label: 'Land surface temperature, day (8-day, 1 km)', id: 'MODIS/061/MOD11A2', band: 'LST_Day_1km', mult: 0.02, add: -273.15, unit: '°C', reducer: 'mean', min: 20, max: 60, palette: PAL.temp, scale: 1000 },
        modis_et:  { group: 'MODIS (land surface)', label: 'Evapotranspiration total (8-day, 500 m)', id: 'MODIS/061/MOD16A2', band: 'ET', mult: 0.1, unit: 'mm', reducer: 'sum', min: 0, max: 30, perMonth: true, palette: PAL.evap, scale: 500 },
        modis_ndvi:{ group: 'MODIS (land surface)', label: 'Vegetation index NDVI (16-day, 250 m)', id: 'MODIS/061/MOD13Q1', band: 'NDVI', mult: 0.0001, unit: 'NDVI', reducer: 'mean', min: 0, max: 0.6, palette: ['ffffff', 'ce7e45', 'df923d', 'f1b555', 'fcd163', '99b718', '74a901', '66a000', '529400', '3e8601', '207401', '056201'], scale: 250 },

        dem:       { group: 'Elevation', label: 'Copernicus DEM GLO-30 (30 m)', id: 'COPERNICUS/DEM/GLO30', band: 'DEM', mult: 1, unit: 'm', static: true, min: 0, max: 2500, palette: PAL.dem, scale: 30 },
    };

    let eeReady = false, eeLoading = null, layer = null, lastStationRows = null;

    // ---------- Settings ----------
    const store = {
        get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    };

    function status(msg, err) {
        $('gee-status').innerHTML = msg;
        $('gee-status').className = 'status' + (err ? ' error' : '');
    }

    function loadLibrary() {
        if (window.ee) return Promise.resolve();
        if (!eeLoading) {
            eeLoading = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = EE_LIB;
                s.onload = resolve;
                s.onerror = () => reject(new Error('Could not load the Earth Engine library'));
                document.head.appendChild(s);
            });
        }
        return eeLoading;
    }

    async function signIn() {
        const clientId = $('gee-client').value.trim(), project = $('gee-project').value.trim();
        if (!clientId || !project) return status('Enter your OAuth client ID and Earth Engine Cloud project ID first (see "How to set up").', true);
        store.set('geeClient', clientId); store.set('geeProject', project);
        status('Loading Earth Engine…');
        try { await loadLibrary(); } catch (e) { return status(e.message, true); }

        const fail = e => status('Sign-in failed: ' + (e?.message || e) + ' — check that this site\'s address is an authorised JavaScript origin of the client ID and that the project is registered for Earth Engine.', true);
        const init = () => ee.initialize(null, null, () => {
            eeReady = true;
            status(`✓ Signed in to Earth Engine (project ${project}).`);
            $('gee-tools').classList.remove('hidden');
        }, fail, null, project);
        ee.data.authenticateViaOauth(clientId, init, fail, null, () => ee.data.authenticateViaPopup(init, fail));
    }

    // ---------- Earth Engine helpers ----------
    function period() {
        const from = $('gee-from').value, until = $('gee-until').value;
        if (!from || !until || from > until) throw new Error('Choose a From date before the Until date.');
        return { from, until, untilExcl: DU.shiftDate(until, 1) };
    }

    function visMax(cfg, from, until) {
        if (!cfg.perMonth) return cfg.max;
        const months = Math.max(1, (new Date(until) - new Date(from)) / 86400000 / 30.4);
        return +(cfg.max * months).toPrecision(2);
    }

    // One image in the shown unit, named 'value'
    function prep(cfg, im) {
        let x;
        if (cfg.expr) {
            const bands = {};
            for (const [k, b] of Object.entries(cfg.exprBands)) bands[k] = im.select(b);
            x = im.expression(cfg.expr, bands);
        } else {
            x = im.select(cfg.band);
        }
        if (cfg.mult !== undefined && cfg.mult !== 1) x = x.multiply(cfg.mult);
        if (cfg.add) x = x.add(cfg.add);
        return ee.Image(x.rename('value').copyProperties(im, ['system:time_start']));
    }

    function collection(cfg, p) {
        const region = ee.Geometry.Rectangle(REGION);
        return ee.ImageCollection(cfg.id).filterDate(p.from, p.untilExcl).filterBounds(region).map(im => prep(cfg, im));
    }

    function periodImage(cfg, p) {
        if (cfg.static) return prep(cfg, ee.ImageCollection(cfg.id).mosaic());
        const col = collection(cfg, p);
        return cfg.reducer === 'sum' ? col.sum() : col.mean();
    }

    const evaluate = obj => new Promise((resolve, reject) => obj.evaluate((r, e) => e ? reject(new Error(e)) : resolve(r)));

    function legend(cfg, max) {
        $('gee-legend').innerHTML = `<div class="ext-legend-item"><strong>${cfg.label}</strong>
            <div class="legend-gradient" style="background:linear-gradient(to right, ${cfg.palette.map(c => '#' + c).join(',')})"></div>
            <div class="legend-labels"><span>${cfg.min}</span><span>${max} ${cfg.unit}</span></div>
            <div class="small">${cfg.static ? '' : (cfg.reducer === 'sum' ? 'Total' : 'Average') + ' over the chosen period. '}Source: Google Earth Engine <code>${cfg.id}</code>.</div></div>`;
    }

    // ---------- Actions ----------
    async function showOnMap() {
        const cfg = DATASETS[$('gee-dataset').value];
        let p;
        try { p = period(); } catch (e) { return status(e.message, true); }
        status('Earth Engine is computing the map…');
        const max = visMax(cfg, p.from, p.until);
        const img = periodImage(cfg, p).clip(ee.Geometry.Rectangle(REGION));
        img.getMap({ min: cfg.min, max, palette: cfg.palette }, (mapId, err) => {
            if (err || !mapId) return status('Earth Engine error: ' + (err || 'no map returned'), true);
            if (layer) map.removeLayer(layer);
            layer = L.tileLayer(mapId.urlFormat, { opacity: 0.8, attribution: 'Google Earth Engine' }).addTo(map);
            legend(cfg, max);
            window.MapKey.set('gee', {
                title: cfg.label, unit: cfg.unit,
                sub: `Google Earth Engine · ${cfg.static ? 'static' : `${p.from} → ${p.until} · ${cfg.reducer === 'sum' ? 'total' : 'mean'}`}`,
                colors: cfg.palette.map(c => '#' + c),
                labels: [cfg.min, +((cfg.min + max) / 2).toPrecision(3), max].map(String)
            });
            status(`✓ ${cfg.label} on the map (${cfg.static ? 'static dataset' : p.from + ' → ' + p.until}).`);
        });
    }

    async function stationValues() {
        const cfg = DATASETS[$('gee-dataset').value];
        let p;
        try { p = period(); } catch (e) { return status(e.message, true); }
        status('Earth Engine is sampling all stations…');
        const fc = ee.FeatureCollection(SAUDI_WEATHER_STATIONS.map(s =>
            ee.Feature(ee.Geometry.Point([s.lon, s.lat]), { id: s.id, name: s.city })));
        try {
            const res = await evaluate(periodImage(cfg, p).reduceRegions({ collection: fc, reducer: ee.Reducer.mean(), scale: cfg.scale }));
            const rows = res.features.map(f => ({ id: f.properties.id, name: f.properties.name, value: f.properties.mean ?? null }));
            lastStationRows = { cfg, p, rows };
            $('gee-results').innerHTML = `<div class="table-scroll"><table class="data-table">
                <thead><tr><th>Station</th><th>${cfg.static ? '' : (cfg.reducer === 'sum' ? 'Total' : 'Mean') + ' '}(${cfg.unit})</th></tr></thead>
                <tbody>${rows.map(r => `<tr><td>${r.name}</td><td class="num">${r.value === null ? '—' : (+r.value).toFixed(3)}</td></tr>`).join('')}</tbody></table></div>
                <button id="gee-csv" class="btn btn-small">⬇ Station values CSV</button>`;
            $('gee-csv').addEventListener('click', downloadStations);
            status(`✓ ${rows.filter(r => r.value !== null).length} stations sampled.`);
        } catch (e) { status('Earth Engine error: ' + e.message, true); }
    }

    async function stationSeries() {
        const cfg = DATASETS[$('gee-dataset').value];
        if (cfg.static) return status('This dataset has no time dimension — use "Station values".', true);
        let p;
        try { p = period(); } catch (e) { return status(e.message, true); }
        const s = SAUDI_WEATHER_STATIONS.find(x => x.id === $('gee-station').value);
        status(`Earth Engine is extracting the daily series at ${s.city}…`);
        try {
            const rows = await evaluate(collection(cfg, p).getRegion(ee.Geometry.Point([s.lon, s.lat]), cfg.scale));
            // rows: [header, [id, lon, lat, time(ms), value], ...] — several images per day are averaged
            const byDay = new Map();
            rows.slice(1).forEach(r => {
                if (r[4] === null) return;
                const d = new Date(r[3]).toISOString().slice(0, 10);
                const a = byDay.get(d) || [0, 0];
                a[0] += r[4]; a[1]++; byDay.set(d, a);
            });
            const days = [...byDay.keys()].sort();
            const vals = days.map(d => byDay.get(d)[0] / byDay.get(d)[1]);
            $('gee-results').innerHTML = `<div class="small">${s.city}: ${days.length} days with data.</div>
                <div class="chart-wrap small-chart"><canvas id="gee-chart"></canvas></div>
                <button id="gee-series-csv" class="btn btn-small">⬇ Daily series CSV</button>`;
            new Chart($('gee-chart').getContext('2d'), {
                type: 'line',
                data: { labels: days, datasets: [{ label: `${cfg.label} (${cfg.unit})`, data: vals, borderColor: '#34e89e', pointRadius: 0, borderWidth: 1.3 }] },
                options: { responsive: true, maintainAspectRatio: false, animation: false,
                    scales: { x: { ticks: { color: '#aaa', maxTicksLimit: 5 } }, y: { ticks: { color: '#aaa' } } },
                    plugins: { legend: { labels: { color: '#ddd', boxWidth: 10 } } } }
            });
            $('gee-series-csv').addEventListener('click', () => saveCsv(
                `# ${cfg.label} (${cfg.unit}) at ${s.city} (${s.lat}, ${s.lon}); Earth Engine ${cfg.id}\ndate,value\n` +
                days.map((d, i) => `${d},${vals[i]}`).join('\n'), `gee_${$('gee-dataset').value}_${s.id}_${p.from}_${p.until}.csv`));
            status(`✓ Daily series at ${s.city}.`);
        } catch (e) { status('Earth Engine error: ' + e.message, true); }
    }

    function saveCsv(text, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function downloadStations() {
        if (!lastStationRows) return;
        const { cfg, p, rows } = lastStationRows;
        saveCsv(`# ${cfg.label} (${cfg.unit}), ${p.from} to ${p.until}; Earth Engine ${cfg.id}\nstation_id,station,value\n` +
            rows.map(r => `${r.id},${r.name},${r.value ?? ''}`).join('\n'), `gee_${$('gee-dataset').value}_stations_${p.from}_${p.until}.csv`);
    }

    // ---------- Code Editor script ----------
    function buildScript() {
        const key = $('gee-dataset').value, cfg = DATASETS[key];
        const from = $('gee-from').value, until = $('gee-until').value, untilExcl = DU.shiftDate(until, 1);
        const max = visMax(cfg, from, until);
        const name = cfg.label.replace(/'/g, '');
        const stations = SAUDI_WEATHER_STATIONS.map(s =>
            `  ee.Feature(ee.Geometry.Point([${s.lon}, ${s.lat}]), {id: '${s.id}', name: '${s.city.replace(/'/g, '')}'})`).join(',\n');
        const select = cfg.expr
            ? `im.expression('${cfg.expr}', {${Object.entries(cfg.exprBands).map(([k, b]) => `${k}: im.select('${b}')`).join(', ')}})`
            : `im.select('${cfg.band}')`;
        const convert = `${cfg.mult !== undefined && cfg.mult !== 1 ? `.multiply(${cfg.mult})` : ''}${cfg.add ? `.add(${cfg.add})` : ''}`;
        const vis = `{min: ${cfg.min}, max: ${max}, palette: ${JSON.stringify(cfg.palette)}}`;
        const head = `// Saudi Arabia weather & environment map — Google Earth Engine script
// Dataset: ${cfg.label} (${cfg.unit}) — ${cfg.id}
${cfg.static ? '' : `// Period: ${from} to ${until}\n`}// Paste into https://code.earthengine.google.com and press Run.

var stations = ee.FeatureCollection([
${stations}
]);
var region = ee.Geometry.Rectangle(${JSON.stringify(REGION)});

// Convert each image to the shown unit and call the band 'value'
function prep(im) {
  return ee.Image(${select}${convert}.rename('value').copyProperties(im, ['system:time_start']));
}
`;
        if (cfg.static) {
            return head + `
var img = prep(ee.ImageCollection('${cfg.id}').mosaic());
Map.centerObject(region, 5);
Map.addLayer(img.clip(region), ${vis}, '${name}');
Map.addLayer(stations, {color: 'black'}, 'Stations');

var values = img.reduceRegions({collection: stations, reducer: ee.Reducer.mean(), scale: ${cfg.scale}});
print('${name} at stations', values);
Export.table.toDrive({collection: values, description: '${key}_stations', fileFormat: 'CSV'});
`;
        }
        return head + `
var col = ee.ImageCollection('${cfg.id}')
  .filterDate('${from}', '${untilExcl}')
  .filterBounds(region)
  .map(prep);
var img = col.${cfg.reducer === 'sum' ? 'sum' : 'mean'}();   // ${cfg.reducer === 'sum' ? 'total' : 'average'} over the period

Map.centerObject(region, 5);
Map.addLayer(img.clip(region), ${vis}, '${name}');
Map.addLayer(stations, {color: 'black'}, 'Stations');

// Period value at every station
var values = img.reduceRegions({collection: stations, reducer: ee.Reducer.mean(), scale: ${cfg.scale}});
print('${name} at stations (${from} to ${until})', values);
Export.table.toDrive({collection: values, description: '${key}_stations_${from}_${until}', fileFormat: 'CSV'});

// Time series chart at all stations
print(ui.Chart.image.seriesByRegion({
  imageCollection: col, regions: stations, reducer: ee.Reducer.mean(),
  band: 'value', scale: ${cfg.scale}, seriesProperty: 'name'
}).setOptions({title: '${name} (${cfg.unit})', interpolateNulls: true}));

// Daily series at every station as a CSV table
var series = col.map(function(im) {
  return im.reduceRegions({collection: stations, reducer: ee.Reducer.mean(), scale: ${cfg.scale}})
    .map(function(f) { return f.set('date', im.date().format('YYYY-MM-dd')); });
}).flatten();
Export.table.toDrive({collection: series, description: '${key}_daily_${from}_${until}', fileFormat: 'CSV',
  selectors: ['date', 'id', 'name', 'mean']});
`;
    }

    function showScript() {
        if (!$('gee-from').value || !$('gee-until').value || $('gee-from').value > $('gee-until').value) {
            return status('Choose a From date before the Until date.', true);
        }
        $('gee-script').value = buildScript();
        $('gee-script-box').classList.remove('hidden');
        status('Script ready. Copy it, open the Code Editor and press Run (outputs appear in the Console and Tasks tabs).');
    }

    // ---------- Init ----------
    function init() {
        const groups = {};
        Object.entries(DATASETS).forEach(([k, d]) => { (groups[d.group] = groups[d.group] || []).push([k, d]); });
        $('gee-dataset').innerHTML = Object.entries(groups).map(([g, items]) =>
            `<optgroup label="${g}">${items.map(([k, d]) => `<option value="${k}">${d.label}</option>`).join('')}</optgroup>`).join('');
        $('gee-station').innerHTML = SAUDI_WEATHER_STATIONS.map(s => `<option value="${s.id}">${s.city}</option>`).join('');

        const until = DU.shiftDate(DU.isoDate(new Date()), -10);
        $('gee-until').value = until;
        $('gee-from').value = DU.shiftDate(until, -29);
        $('gee-client').value = store.get('geeClient');
        $('gee-project').value = store.get('geeProject');
        $('gee-origin').textContent = location.origin;

        $('gee-signin').addEventListener('click', signIn);
        $('gee-map').addEventListener('click', () => eeReady ? showOnMap() : status('Sign in first, or use "Code Editor script".', true));
        $('gee-values').addEventListener('click', () => eeReady ? stationValues() : status('Sign in first, or use "Code Editor script".', true));
        $('gee-series').addEventListener('click', () => eeReady ? stationSeries() : status('Sign in first, or use "Code Editor script".', true));
        $('gee-clear').addEventListener('click', () => {
            if (layer) { map.removeLayer(layer); layer = null; }
            window.MapKey.remove('gee');
            $('gee-legend').innerHTML = ''; $('gee-results').innerHTML = '';
        });
        $('gee-script-btn').addEventListener('click', showScript);
        $('gee-copy').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText($('gee-script').value); status('Script copied.'); }
            catch (e) { $('gee-script').select(); status('Select-all done — press Ctrl+C to copy.'); }
        });
    }

    window.GEE_DATASETS = DATASETS;   // used by the data source catalog
    init();
})();
