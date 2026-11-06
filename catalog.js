// ============================================================
// Data source catalog: every source, what it offers, and how this site uses it
// ============================================================

(function () {
    'use strict';

    // status: 'data'  = values in time series & areal analysis
    //         'layer' = map layer
    //         'link'  = link only (login / key / bulk download, or no coverage of Saudi Arabia)
    const CATALOG = [
        { name: 'National Center for Meteorology (NCM)', status: ['data'], url: 'https://www.ncm.gov.sa/en',
          offers: 'Saudi synoptic station observations.',
          use: 'Daily station observations as exchanged through the WMO (via NOAA NCEI). Source "NCM observed".',
          note: 'Official quality-controlled archive is available on request through NCM.' },
        { name: 'NOAA National Centers for Environmental Information', status: ['data'], url: 'https://www.ncei.noaa.gov/',
          offers: 'Global Summary of the Day, GHCN, climate normals, model archives.',
          use: 'Global Summary of the Day is the archive behind "NCM observed". NOAA GFS is used as "GFS forecast".' },
        { name: 'CHIRPS rainfall (UCSB Climate Hazards Center)', status: ['data'], url: 'https://www.chc.ucsb.edu/data/chirps',
          offers: 'Daily satellite + gauge rainfall, 5 km, 1981 → present, 50°S–50°N.',
          use: 'Source "CHIRPS" (rainfall), read through NASA SERVIR ClimateSERV.' },
        { name: 'IMERG rainfall (NASA GPM)', status: ['data', 'layer'], url: 'https://gpm.nasa.gov/data/imerg',
          offers: 'Half-hourly to monthly satellite rainfall, 10 km, 2000 → present.',
          use: 'Source "IMERG" (daily rainfall via ClimateSERV) and the "IMERG daily precipitation" map layer.',
          note: 'The near-real-time satellite-only IMERG is not corrected with rain gauges; at Riyadh in April 2024 it gave 158 mm against 46 mm from CHIRPS. Compare sources before relying on it.' },
        { name: 'NASA Earth Observing System Data and Information System (EOSDIS)', status: ['data', 'layer'], url: 'https://www.earthdata.nasa.gov/',
          offers: 'NASA satellite archives; GIBS imagery service; NASA POWER.',
          use: 'Map layers from GIBS (IMERG, GRACE, SMAP, MODIS LST/NDVI/aerosol/true colour, GLDAS, MERRA-2; gases: OMI NO₂, SO₂, ozone, AIRS methane and CO, OCO-2 CO₂) and source "NASA POWER" (daily rain, temperature, humidity, dew point, solar, wind speed and direction).',
          note: 'Downloading raw granules needs a free Earthdata login.' },
        { name: 'GRACE / GRACE-FO water storage (NASA JPL)', status: ['layer'], url: 'https://grace.jpl.nasa.gov/',
          offers: 'Monthly terrestrial water storage anomaly (groundwater + soil + surface water), ~300 km effective resolution, 2002 → present.',
          use: 'Map layer "GRACE groundwater & total water storage" (NASA GIBS; that layer ends July 2022).',
          note: 'Newer months are on NASA PO.DAAC (Earthdata login).' },
        { name: 'GFS forecast (NOAA NCEP)', status: ['data'], url: 'https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast',
          offers: 'Global weather forecast up to 16 days.',
          use: 'Source "GFS forecast" (via Open-Meteo): rainfall, temperature, humidity, ET₀, radiation, wind for the next 16 days — in time series and areal analysis.' },
        { name: 'ECMWF S2S (sub-seasonal to seasonal)', status: ['data'], url: 'https://www.ecmwf.int/en/research/projects/s2s',
          offers: 'S2S research database (forecasts up to 60 days) and ECMWF operational forecasts.',
          use: 'Source "ECMWF forecast" (IFS, 15 days) and the "ECMWF seasonal outlook" (SEAS5, 6 months, with anomalies) in each station window.',
          note: 'The S2S database itself needs an ECMWF account and the MARS/API tools, so it cannot be read from a website.' },
        { name: 'Earth System Grid Federation (ESGF)', status: ['data'], url: 'https://esgf.llnl.gov/',
          offers: 'CMIP6 climate model output (projections to 2100).',
          use: '"CMIP6 climate projection" in each station window: 3 CMIP6 HighResMIP models, 1995–2014 vs 2031–2050, downscaled to ~10 km (via the Open-Meteo Climate API).',
          note: 'The full ESGF archive is NetCDF downloads.' },
        { name: 'Global Solar Atlas (World Bank / Solargis)', status: ['data'], url: 'https://globalsolaratlas.info/',
          offers: 'Long-term GHI, DNI, diffuse, optimum tilt, PV output, 250 m.',
          use: '"Global Solar Atlas" in each station window: annual and monthly solar resource and PV output.' },
        { name: 'Global Forest Watch', status: ['layer'], url: 'https://www.globalforestwatch.org/',
          offers: 'Tree cover, tree cover loss and gain (UMD / Hansen), fires.',
          use: 'Map layer "Tree cover loss".', note: 'Interpreted "global forest planet" as Global Forest Watch.' },
        { name: 'OpenWeatherMap', status: ['layer'], url: 'https://openweathermap.org/api',
          offers: 'Current weather, forecasts and weather map tiles.',
          use: 'Map layers for current precipitation, clouds, temperature and wind.',
          note: 'Needs your own free API key — enter it under "Global Map Layers".' },
        { name: 'PERSIANN (CHRS, UC Irvine)', status: ['link'], url: 'https://chrsdata.eng.uci.edu/',
          offers: 'PERSIANN, PERSIANN-CCS, PERSIANN-CDR satellite rainfall (1983 → present).',
          note: 'The CHRS Data Portal only offers file downloads (no web API), and the IRI Data Library copy now needs a login. Downloaded files could be added as a station CSV.' },
        { name: 'RFE 2.0 rainfall (NOAA CPC / FEWS NET)', status: ['link'], url: 'https://www.cpc.ncep.noaa.gov/products/fews/rfe.shtml',
          offers: 'Daily rainfall estimate, 0.1°, Africa domain 40°S–40°N, 20°W–55°E (covers most of Saudi Arabia).',
          note: 'Distributed as binary grid files (CPC FTP) or through the IRI Data Library, which now needs a login.' },
        { name: 'ICPAC (IGAD Climate Prediction & Applications Centre)', status: ['link'], url: 'https://www.icpac.net/',
          offers: 'Seasonal forecasts, drought and climate products.',
          note: 'Covers the Greater Horn of Africa only; its geoportal has no layers over Saudi Arabia.' },
        { name: 'KNMI Climate Explorer', status: ['link'], url: 'https://climexp.knmi.nl/',
          offers: 'Online analysis of station data, reanalyses and climate models (correlations, trends, extremes).',
          note: 'A web analysis tool without a browser API; the KNMI Data Platform API needs a key.' },
        { name: 'WorldClim', status: ['link'], url: 'https://www.worldclim.org/data/index.html',
          offers: '1970–2000 climate normals (temperature, rainfall, solar radiation, wind, vapour pressure) and CMIP6 downscaled futures, down to ~1 km.',
          note: 'GeoTIFF downloads only (no API). Normals for the station points can be extracted and added on request.' },
        { name: 'ESA Climate Change Initiative (CCI)', status: ['link'], url: 'https://climate.esa.int/en/data/',
          offers: 'Climate data records: soil moisture, land cover, sea level, aerosols, land surface temperature, water vapour…',
          note: 'NetCDF downloads from the CEDA archive / ESA CCI Open Data Portal.' },
        { name: 'OpenEI (NREL Open Energy Information)', status: ['link'], url: 'https://openei.org/',
          offers: 'Energy and renewable-resource datasets and NREL APIs.',
          note: 'NREL APIs need a key and mostly cover the United States; for solar in Saudi Arabia use the Global Solar Atlas above.' },
        { name: 'United States Geological Survey (USGS)', status: ['link'], url: 'https://earthexplorer.usgs.gov/',
          offers: 'EarthExplorer: Landsat, SRTM / ASTER elevation; FEWS NET actual evapotranspiration (SSEBop).',
          note: 'EarthExplorer downloads need a free USGS login.' },
        { name: 'INSPIRE Geoportal (European Union)', status: ['link'], url: 'https://inspire-geoportal.ec.europa.eu/',
          offers: 'Spatial data of EU member states.',
          note: 'Covers Europe only — no data for Saudi Arabia.' },
        { name: 'Google Earth Engine', status: ['data', 'layer'], url: 'https://earthengine.google.com/',
          offers: 'Petabyte catalogue: Sentinel-5P gases, ERA5-Land, CHIRPS, MODIS, TerraClimate, GRACE, Copernicus DEM…',
          use: '"Google Earth Engine" in the sidebar: 21 curated datasets. Generate a Code Editor script (map, station table, chart, CSV export) or sign in to show the map, station values and daily series here.',
          note: 'Needs a free (non-commercial) Earth Engine account; signing in here also needs your own OAuth client ID and Cloud project.' },
        { name: 'Copernicus Atmosphere Monitoring Service (CAMS)', status: ['data'], url: 'https://atmosphere.copernicus.eu/',
          offers: 'Global atmospheric composition analysis and 5-day forecast (~40 km): NO₂, SO₂, O₃, CO, HCHO, CO₂, CH₄, dust, PM.',
          use: 'Station values in "Atmospheric Gases" and "Environmental Parameters", and source "CAMS air quality" in time series and areal analysis (via Open-Meteo).',
          note: 'History from Aug 2022 for NO₂, SO₂, O₃, CO, dust and PM; CO₂, CH₄ and HCHO only for recent periods.' },
        { name: 'ERA5 reanalysis (ECMWF / Copernicus)', status: ['data'], url: 'https://cds.climate.copernicus.eu/',
          offers: 'Hourly global reanalysis, 1940 → present, ~25 km.',
          use: 'Source "ERA5 reanalysis" (via Open-Meteo): all variables, no gaps.' },
    ];

    const BADGE = {
        data: '<span class="badge badge-data">Data</span>',
        layer: '<span class="badge badge-layer">Map layer</span>',
        link: '<span class="badge badge-link">Link</span>',
    };

    function render() {
        const order = { data: 0, layer: 1, link: 2 };
        const rows = [...CATALOG].sort((a, b) => order[a.status[0]] - order[b.status[0]]).map(c => `
            <tr>
                <td><a href="${c.url}" target="_blank" rel="noopener">${c.name}</a><div class="small">${c.offers}</div></td>
                <td>${c.status.map(s => BADGE[s]).join(' ')}</td>
                <td class="small">${c.use ? c.use : ''}${c.note ? `<div class="note">${c.note}</div>` : ''}</td>
            </tr>`).join('');
        document.getElementById('catalog-body').innerHTML = `
            <p class="small">${BADGE.data} values for each station in the time-series window and the areal analysis ·
               ${BADGE.layer} shown on the map ("Global Map Layers" in the sidebar) ·
               ${BADGE.link} link only — the reason is given.</p>
            <div class="table-scroll"><table class="data-table catalog">
                <thead><tr><th>Source</th><th>Used as</th><th>How it is used / why not</th></tr></thead>
                <tbody>${rows}</tbody></table></div>`;
    }

    render();
    const modal = document.getElementById('catalog-modal');
    document.getElementById('btn-catalog').addEventListener('click', () => modal.classList.remove('hidden'));
    document.getElementById('catalog-close').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
})();
