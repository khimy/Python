// ============================================================
// Global map layers
//   • NASA EOSDIS GIBS imagery (IMERG, GRACE, SMAP, MODIS, GLDAS, MERRA-2)
//   • Global Forest Watch tree cover loss
//   • OpenWeatherMap live layers (needs your own free API key)
// Map tiles are plain images, so they work from any website.
// ============================================================

(function () {
    'use strict';

    const map = window.WX.map;
    const $ = id => document.getElementById(id);
    const DU = window.dateUtils;

    const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

    // period: 'day' uses the chosen date; 'month' uses the first day of that month
    const LAYERS = {
        imerg:   { group: 'NASA EOSDIS (GIBS)', label: 'IMERG daily precipitation (GPM)', gibs: 'IMERG_Precipitation_Rate', level: 6, period: 'day', lag: 2,
                   legend: 'Daily rainfall rate from NASA GPM IMERG (~10 km). Light blue = light rain, through yellow to red = heavy rain. Transparent = no rain.' },
        grace:   { group: 'NASA EOSDIS (GIBS)', label: 'GRACE groundwater & total water storage', gibs: 'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI', level: 6, period: 'month', max: '2022-07-01',
                   legend: 'GRACE / GRACE-FO terrestrial water storage anomaly (cm of water, against 2004–2009). Red = less water stored than normal, blue = more. Monthly; this NASA layer ends in July 2022.' },
        smap:    { group: 'NASA EOSDIS (GIBS)', label: 'SMAP root-zone soil moisture', gibs: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', level: 6, period: 'day', lag: 4,
                   legend: 'NASA SMAP Level-4 root-zone (0–100 cm) soil moisture (m³/m³), daily, ~9 km. Brown = dry, green/blue = wet.' },
        gldas:   { group: 'NASA EOSDIS (GIBS)', label: 'GLDAS soil moisture (monthly)', gibs: 'GLDAS_Underground_Soil_Moisture_Monthly', level: 6, period: 'month', lag: 150,
                   legend: 'NASA GLDAS Noah land model soil moisture, 0–10 cm (kg/m²), monthly. Brown = dry, blue = wet.' },
        merra2:  { group: 'NASA EOSDIS (GIBS)', label: 'MERRA-2 precipitation (monthly)', gibs: 'MERRA2_Precipitation_Bias_Corrected_Monthly', level: 6, period: 'month', lag: 100,
                   legend: 'NASA MERRA-2 bias-corrected total precipitation, monthly mean rate. Darker blue = wetter.' },
        lst:     { group: 'NASA EOSDIS (GIBS)', label: 'MODIS land surface temperature (day)', gibs: 'MODIS_Terra_Land_Surface_Temp_Day', level: 7, period: 'day', lag: 2,
                   legend: 'MODIS Terra daytime land surface temperature (~1 km). Blue = cool, through yellow to red = hot (above ~50 °C in summer). Gaps = clouds.' },
        ndvi:    { group: 'NASA EOSDIS (GIBS)', label: 'MODIS vegetation index (NDVI, 8-day)', gibs: 'MODIS_Terra_NDVI_8Day', level: 9, period: 'day', lag: 3,
                   legend: 'MODIS NDVI, rolling 8-day composite (250 m). Brown/white = bare desert, green = vegetation and farms.' },
        aod:     { group: 'NASA EOSDIS (GIBS)', label: 'MODIS aerosol optical depth (dust)', gibs: 'MODIS_Combined_Value_Added_AOD', level: 6, period: 'day', lag: 2,
                   legend: 'MODIS aerosol optical depth (Terra + Aqua). Yellow = low, through orange to dark red = heavy dust or haze.' },
        truecolor: { group: 'NASA EOSDIS (GIBS)', label: 'MODIS true-colour satellite image', gibs: 'MODIS_Terra_CorrectedReflectance_TrueColor', level: 9, period: 'day', lag: 1, ext: 'jpg', opacity: 1,
                   legend: 'MODIS Terra natural-colour image of the chosen day (250 m). Shows dust storms, clouds and floods.' },
        gfw:     { group: 'Global Forest Watch', label: 'Tree cover loss (2001 – latest year)',
                   url: 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/dynamic/{z}/{x}/{y}.png', maxNative: 12, opacity: 1,
                   legend: 'Hansen / UMD Global Forest Change: pink-red pixels lost tree cover from 2001 to the latest yearly update. In Saudi Arabia tree cover is limited to the south-west mountains (Asir, Al Baha).' },
        // ---- Atmospheric gases (shown in the "Atmospheric Gases" sidebar section) ----
        gas_no2: { target: 'gas-layers', group: 'Satellite maps — NASA EOSDIS (GIBS)', label: 'Nitrogen dioxide (NO₂) — OMI', gibs: 'OMI_Nitrogen_Dioxide_Tropo_Column', level: 6, period: 'day', lag: 6,
                   legend: 'Aura OMI tropospheric NO₂ column, daily (~13 × 24 km). Yellow → red = more NO₂ from traffic, power plants and refineries (Riyadh, Jeddah, Eastern Province). Gaps = clouds or no overpass.' },
        gas_so2: { target: 'gas-layers', group: 'Satellite maps — NASA EOSDIS (GIBS)', label: 'Sulphur dioxide (SO₂) — OMI', gibs: 'OMI_SO2_Planetary_Boundary_Layer', level: 6, period: 'day', lag: 2,
                   legend: 'Aura OMI SO₂ in the planetary boundary layer (Dobson units), daily. Hotspots mark refineries, power and desalination plants. Single days are noisy; compare several.' },
        gas_o3: { target: 'gas-layers', group: 'Satellite maps — NASA EOSDIS (GIBS)', label: 'Ozone (O₃) total column — OMI', gibs: 'OMI_Ozone_TOMS_Total_Column', level: 6, period: 'day', lag: 6,
                   legend: 'Aura OMI total ozone column (Dobson units), daily. This is mostly stratospheric ozone, not ground-level smog — for surface ozone use the station values (CAMS).' },
        gas_ch4: { target: 'gas-layers', group: 'Satellite maps — NASA EOSDIS (GIBS)', label: 'Methane (CH₄) — AIRS, daily', gibs: 'AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Daily_Day', level: 6, period: 'day', lag: 6,
                   legend: 'Aqua AIRS methane mixing ratio at 400 hPa (mid-troposphere, ~7 km), daily, 1°. Shows regional patterns, not individual sources.' },
        gas_ch4m: { target: 'gas-layers', group: 'Satellite maps — NASA EOSDIS (GIBS)', label: 'Methane (CH₄) — AIRS, monthly', gibs: 'AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day', level: 6, period: 'month', lag: 100,
                   legend: 'Aqua AIRS monthly methane at 400 hPa — fewer gaps than the daily map.' },
        gas_co2: { target: 'gas-layers', group: 'Satellite maps — NASA EOSDIS (GIBS)', label: 'Carbon dioxide (CO₂) — OCO-2', gibs: 'OCO-2_Carbon_Dioxide_Total_Column_Average', level: 8, period: 'day', lag: 120,
                   legend: 'OCO-2 column-average CO₂ (ppm) along narrow satellite tracks: data only where the satellite passed that day, and the newest data is usually several months old. Try several dates.' },
        gas_co: { target: 'gas-layers', group: 'Satellite maps — NASA EOSDIS (GIBS)', label: 'Carbon monoxide (CO) — AIRS', gibs: 'AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day', level: 6, period: 'day', lag: 6,
                   legend: 'Aqua AIRS carbon monoxide at 500 hPa, daily, 1°. Shows smoke and pollution transport.' },
        owm_precip: { group: 'OpenWeatherMap (API key)', label: 'Precipitation now', owm: 'precipitation_new', legend: 'OpenWeatherMap current precipitation.' },
        owm_clouds: { group: 'OpenWeatherMap (API key)', label: 'Clouds now', owm: 'clouds_new', legend: 'OpenWeatherMap current cloud cover.' },
        owm_temp:   { group: 'OpenWeatherMap (API key)', label: 'Temperature now', owm: 'temp_new', legend: 'OpenWeatherMap current air temperature.' },
        owm_wind:   { group: 'OpenWeatherMap (API key)', label: 'Wind speed now', owm: 'wind_new', legend: 'OpenWeatherMap current wind speed.' },
    };

    // Colour keys for the map-key panel. NASA layers use the official Worldview / GIBS colour scales
    // (10 colours sampled from each; labels = values at the left end, middle and right end of the bar).
    const KEYS = {
        imerg: { colors: ["#00764e", "#00971f", "#2db800", "#99d900", "#fad200", "#ff6c1f", "#ff1313", "#c80000", "#7d0000", "#330000"], labels: ["0.1", "2.4", "53"], unit: 'mm/h' },
        grace: { colors: ["#0033ff", "#3960ff", "#728dff", "#aabaff", "#e3e7ff", "#ffe7e3", "#ffbaab", "#ff8d72", "#ff6039", "#ff3300"], labels: ["-30", "0", "30"], unit: 'cm of water' },
        smap: { colors: ["#ffa200", "#ffe500", "#acd500", "#008200", "#00d6ae", "#00b2ff", "#000cff", "#00009e", "#181864", "#505050"], labels: ["0", "0.35", "0.7"], unit: 'm³/m³' },
        gldas: { colors: ["#9e0142", "#eb5f46", "#f7884f", "#fdbc6c", "#fae38c", "#e9f296", "#bbe3a0", "#83cda4", "#57b1ab", "#5e4fa2"], labels: ["0", "25", "50"], unit: 'kg/m² (0–10 cm)' },
        merra2: { colors: ["#f7fcfd", "#d5efed", "#bbe5dc", "#9ad8c9", "#76c9af", "#59bb94", "#40ad74", "#2c9654", "#167f3b", "#00441b"], labels: ["0", "9.1", "18.1"], unit: 'mm/day' },
        lst: { colors: ["#c900ff", "#5900ff", "#0024ff", "#00b3ff", "#33ff89", "#95ff00", "#ffff00", "#ffac00", "#ff5500", "#ff0100"], labels: ["-73", "2", "77"], unit: '°C' },
        ndvi: { colors: ["#f1ecec", "#e5dbce", "#c0b097", "#ac8d73", "#b0cf68", "#80b006", "#4e9401", "#217800", "#006000", "#001801"], labels: ["0", "0.38", "1"], unit: 'NDVI' },
        aod: { colors: ["#fffdcd", "#ffea81", "#ffd257", "#ffaf36", "#ff8723", "#ff5818", "#f52810", "#db0c0b", "#b2000e", "#7d000e"], labels: ["0", "0.38", "5"], unit: 'optical depth' },
        gas_no2: { colors: ["#fffcc7", "#ffec87", "#ffdc66", "#ffc94c", "#ffab34", "#ff8d25", "#ff711e", "#ff4915", "#f52810", "#7f000e"], labels: ["0", "10", "20"], unit: '×10¹⁵ molecules/cm²' },
        gas_so2: { colors: ["#082864", "#08519b", "#1f6eb3", "#3a8ac2", "#5ca4d0", "#86bcdb", "#add0e6", "#ccdff0", "#e2edf8", "#f7fbff"], labels: ["0.5", "2.5", "4.5"], unit: 'Dobson units' },
        gas_o3: { colors: ["#5e4fa2", "#56b0ac", "#85cea4", "#b6e2a1", "#e3f498", "#f6e68f", "#fdcb79", "#fba35c", "#f47245", "#9e0142"], labels: ["100", "300", "500"], unit: 'Dobson units' },
        gas_ch4: { colors: ["#f2f3f6", "#cbe7c8", "#b1e4ae", "#a5d37e", "#b3b55c", "#d88b47", "#e16849", "#d8494e", "#962936", "#3e0015"], labels: ["1600", "1800", "2000"], unit: 'ppb (400 hPa)' },
        gas_ch4m: { colors: ["#f2f3f6", "#cbe7c8", "#b1e4ae", "#a5d37e", "#b3b55c", "#d88b47", "#e16849", "#d8494e", "#962936", "#3e0015"], labels: ["1600", "1800", "2000"], unit: 'ppb (400 hPa)' },
        gas_co2: { colors: ["#440154", "#482878", "#3e4989", "#31678e", "#26838e", "#1e9b8a", "#31b57b", "#65cb5e", "#aadc32", "#f6e620"], labels: ["380", "430", "480"], unit: 'ppm' },
        gas_co: { colors: ["#fffdda", "#fffdc4", "#fff79e", "#fbb956", "#fc654c", "#d33825", "#a9202a", "#9b279f", "#7f35f6", "#2f054a"], labels: ["0", "175", "350"], unit: 'ppb (500 hPa)' },
        truecolor: { note: 'Natural-colour satellite photo — no colour scale.' },
        gfw: { swatches: [{ color: '#dc6699', label: 'Tree cover lost since 2001' }] },
        owm_precip: { colors: ['#e1c86400', '#c8969680', '#9696aa', '#7878be', '#6e6ecd', '#5050e1', '#1414ff'], labels: ['light', 'moderate', 'heavy'], unit: 'rain' },
        owm_clouds: { colors: ['#ffffff00', '#fdfdff40', '#fbfbff80', '#f7f7ffc0', '#f0f0ff'], labels: ['clear', 'partly', 'overcast'], unit: 'cloud cover' },
        owm_temp: { colors: ['#821692', '#8257db', '#208cec', '#20c4e8', '#23dddd', '#c2ff28', '#fff028', '#ffc228', '#fc8014'], labels: ['−40', '0', '30 °C'], unit: '°C (approx.)' },
        owm_wind: { colors: ['#ffffff00', '#eeceff', '#b364bc', '#3f213b', '#744cac', '#4600af', '#0d1126'], labels: ['calm', 'strong', 'storm'], unit: 'wind' },
    };

    const active = {};   // key -> Leaflet layer

    function owmKey() {
        try { return localStorage.getItem('owmKey') || ''; } catch (e) { return ''; }
    }

    // Date to request for a GIBS layer
    function layerDate(cfg) {
        let d = $('ext-date').value || DU.shiftDate(DU.isoDate(new Date()), -2);
        // Each product is published with some delay ('lag' days): use its latest day instead of an empty map
        if (cfg.lag) {
            const latest = DU.shiftDate(DU.isoDate(new Date()), -cfg.lag);
            if (d > latest) d = latest;
        }
        if (cfg.period === 'month') d = d.slice(0, 8) + '01';
        if (cfg.max && d > cfg.max) d = cfg.max;
        return d;
    }

    function makeLayer(key) {
        const cfg = LAYERS[key];
        let layer;
        if (cfg.gibs) {
            const ext = cfg.ext || 'png';
            layer = L.tileLayer(`${GIBS}/${cfg.gibs}/default/${layerDate(cfg)}/GoogleMapsCompatible_Level${cfg.level}/{z}/{y}/{x}.${ext}`, {
                maxNativeZoom: cfg.level, maxZoom: 18, opacity: cfg.opacity ?? 0.75,
                attribution: 'NASA EOSDIS GIBS'
            });
        } else if (cfg.url) {
            layer = L.tileLayer(cfg.url, { maxNativeZoom: cfg.maxNative, maxZoom: 18, opacity: cfg.opacity ?? 0.8, attribution: 'Global Forest Watch / UMD' });
        } else if (cfg.owm) {
            const k = owmKey();
            if (!k) return null;
            layer = L.tileLayer(`https://tile.openweathermap.org/map/${cfg.owm}/{z}/{x}/{y}.png?appid=${encodeURIComponent(k)}`, {
                maxZoom: 18, opacity: 0.7, attribution: 'OpenWeatherMap'
            });
        }
        // Count missing tiles so we can tell the user when a date has no data
        let errors = 0, loads = 0;
        layer.on('tileerror', () => { errors++; updateNote(); });
        layer.on('tileload', () => { loads++; });
        layer.on('load', () => updateNote());
        layer._stats = () => ({ errors, loads });
        return layer;
    }

    function updateNote() {
        for (const [boxId, target] of [['ext-legend', 'ext-layers'], ['gas-legend', 'gas-layers']]) {
        const keys = Object.keys(active).filter(k => (LAYERS[k].target || 'ext-layers') === target);
        const box = $(boxId);
        if (!keys.length) { box.innerHTML = ''; continue; }
        box.innerHTML = keys.map(k => {
            const cfg = LAYERS[k], st = active[k]._stats();
            const when = cfg.gibs ? ` <span class="small">(${layerDate(cfg)})</span>` : '';
            const warn = st.errors > 0 && st.loads === 0
                ? `<div class="err small">No tiles for this date${cfg.max ? ` (latest is ${cfg.max})` : ''} — try an earlier date.</div>` : '';
            return `<div class="ext-legend-item"><strong>${cfg.label}</strong>${when}<div class="small">${cfg.legend}</div>${warn}</div>`;
        }).join('');
        }
    }

    function toggle(key, on) {
        if (active[key]) { map.removeLayer(active[key]); delete active[key]; }
        if (on) {
            const layer = makeLayer(key);
            if (!layer) {
                $('ext-legend').innerHTML = '<div class="err small">Enter your OpenWeatherMap API key first (free at openweathermap.org).</div>';
                const cb = document.querySelector(`input[value="${key}"]`);
                if (cb) cb.checked = false;
                return;
            }
            active[key] = layer.addTo(map);
            const cfg = LAYERS[key], k = KEYS[key] || {};
            const source = cfg.gibs ? `NASA GIBS · ${layerDate(cfg)}` : cfg.owm ? 'OpenWeatherMap · now (approximate colours)' : cfg.group;
            window.MapKey.set('ext:' + key, { title: cfg.label, sub: source, ...k });
        } else {
            window.MapKey.remove('ext:' + key);
        }
        updateNote();
    }

    function refreshDated() {
        Object.keys(active).filter(k => LAYERS[k].gibs).forEach(k => toggle(k, true));
    }

    function init() {
        for (const target of ['ext-layers', 'gas-layers']) {
            const groups = {};
            Object.entries(LAYERS).filter(([, cfg]) => (cfg.target || 'ext-layers') === target)
                .forEach(([k, cfg]) => { (groups[cfg.group] = groups[cfg.group] || []).push([k, cfg]); });
            $(target).innerHTML = Object.entries(groups).map(([g, items]) => `
                <div class="ext-group-title">${g}</div>
                ${items.map(([k, cfg]) => `<label><input type="checkbox" value="${k}"> ${cfg.label}</label>`).join('')}
            `).join('');
            $(target).addEventListener('change', e => { if (e.target.value) toggle(e.target.value, e.target.checked); });
        }

        // Two date pickers (Global Map Layers and Atmospheric Gases) share one date
        const start = DU.shiftDate(DU.isoDate(new Date()), -2);
        for (const id of ['ext-date', 'gas-date']) {
            $(id).value = start;
            $(id).max = DU.isoDate(new Date());
            $(id).min = '2000-02-24';
            $(id).addEventListener('change', e => {
                $('ext-date').value = $('gas-date').value = e.target.value;
                refreshDated();
            });
        }

        $('owm-key').value = owmKey();
        $('owm-save').addEventListener('click', () => {
            try { localStorage.setItem('owmKey', $('owm-key').value.trim()); } catch (e) { /* ignore */ }
            Object.keys(active).filter(k => LAYERS[k].owm).forEach(k => toggle(k, true));
            $('ext-legend').innerHTML = '<div class="small">API key saved in this browser.</div>';
        });
    }

    init();
})();
