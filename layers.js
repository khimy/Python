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
        merra2:  { group: 'NASA EOSDIS (GIBS)', label: 'MERRA-2 precipitation (monthly)', gibs: 'MERRA2_Precipitation_Bias_Corrected_Monthly', level: 6, period: 'month', lag: 90,
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
        owm_precip: { group: 'OpenWeatherMap (API key)', label: 'Precipitation now', owm: 'precipitation_new', legend: 'OpenWeatherMap current precipitation.' },
        owm_clouds: { group: 'OpenWeatherMap (API key)', label: 'Clouds now', owm: 'clouds_new', legend: 'OpenWeatherMap current cloud cover.' },
        owm_temp:   { group: 'OpenWeatherMap (API key)', label: 'Temperature now', owm: 'temp_new', legend: 'OpenWeatherMap current air temperature.' },
        owm_wind:   { group: 'OpenWeatherMap (API key)', label: 'Wind speed now', owm: 'wind_new', legend: 'OpenWeatherMap current wind speed.' },
    };

    const active = {};   // key -> Leaflet layer

    function owmKey() {
        try { return localStorage.getItem('owmKey') || ''; } catch (e) { return ''; }
    }

    // Date to request for a GIBS layer
    function layerDate(cfg) {
        let d = $('ext-date').value || DU.shiftDate(DU.isoDate(new Date()), -2);
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
        const keys = Object.keys(active);
        const box = $('ext-legend');
        if (!keys.length) { box.innerHTML = ''; return; }
        box.innerHTML = keys.map(k => {
            const cfg = LAYERS[k], st = active[k]._stats();
            const when = cfg.gibs ? ` <span class="small">(${layerDate(cfg)})</span>` : '';
            const warn = st.errors > 0 && st.loads === 0
                ? `<div class="err small">No tiles for this date${cfg.max ? ` (latest is ${cfg.max})` : ''} — try an earlier date.</div>` : '';
            return `<div class="ext-legend-item"><strong>${cfg.label}</strong>${when}<div class="small">${cfg.legend}</div>${warn}</div>`;
        }).join('');
    }

    function toggle(key, on) {
        if (active[key]) { map.removeLayer(active[key]); delete active[key]; }
        if (on) {
            const layer = makeLayer(key);
            if (!layer) {
                $('ext-legend').innerHTML = '<div class="err small">Enter your OpenWeatherMap API key first (free at openweathermap.org).</div>';
                const cb = document.querySelector(`#ext-layers input[value="${key}"]`);
                if (cb) cb.checked = false;
                return;
            }
            active[key] = layer.addTo(map);
        }
        updateNote();
    }

    function refreshDated() {
        Object.keys(active).filter(k => LAYERS[k].gibs).forEach(k => toggle(k, true));
    }

    function init() {
        const groups = {};
        Object.entries(LAYERS).forEach(([k, cfg]) => { (groups[cfg.group] = groups[cfg.group] || []).push([k, cfg]); });
        $('ext-layers').innerHTML = Object.entries(groups).map(([g, items]) => `
            <div class="ext-group-title">${g}</div>
            ${items.map(([k, cfg]) => `<label><input type="checkbox" value="${k}"> ${cfg.label}</label>`).join('')}
        `).join('');
        $('ext-layers').addEventListener('change', e => { if (e.target.value) toggle(e.target.value, e.target.checked); });

        $('ext-date').value = DU.shiftDate(DU.isoDate(new Date()), -2);
        $('ext-date').max = DU.isoDate(new Date());
        $('ext-date').min = '2000-02-24';
        $('ext-date').addEventListener('change', refreshDated);

        $('owm-key').value = owmKey();
        $('owm-save').addEventListener('click', () => {
            try { localStorage.setItem('owmKey', $('owm-key').value.trim()); } catch (e) { /* ignore */ }
            Object.keys(active).filter(k => LAYERS[k].owm).forEach(k => toggle(k, true));
            $('ext-legend').innerHTML = '<div class="small">API key saved in this browser.</div>';
        });
    }

    init();
})();
