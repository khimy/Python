// ============================================================
// Saudi Arabia Weather & Environmental Data Map
// Uses Open-Meteo API (free, no API key required) for live data
// Uses OpenWeatherMap tile layers for weather overlays
// ============================================================

(function () {
    'use strict';

    // --- Map Initialization ---
    const map = L.map('map', {
        center: [23.8859, 45.0792],
        zoom: 6,
        minZoom: 4,
        maxZoom: 18,
        zoomControl: true
    });

    // --- Base Map Layers ---
    const baseMaps = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri, Maxar, Earthstar Geographics',
            maxZoom: 18
        }),
        terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenTopoMap contributors',
            maxZoom: 17
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB',
            maxZoom: 19
        })
    };

    baseMaps.osm.addTo(map);

    // Shared with timeseries.js and analysis.js
    window.WX = { map };   // more fields (layers, legends, live data) are added below

    // --- Base map radio buttons ---
    document.querySelectorAll('input[name="basemap"]').forEach(radio => {
        radio.addEventListener('change', function () {
            Object.values(baseMaps).forEach(layer => map.removeLayer(layer));
            baseMaps[this.value].addTo(map);
        });
    });

    // --- Weather Overlay Layers (OpenWeatherMap free tiles) ---
    // Note: OpenWeatherMap requires an API key for tile layers.
    // We use alternative free sources where possible.

    const OWM_KEY = ''; // Users can add their own key

    const overlayLayers = {};

    // DEM layer - using OpenTopoMap as a DEM visualization
    overlayLayers.dem = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenTopoMap (DEM visualization)',
        maxZoom: 17,
        opacity: 0.7
    });

    // Weather tile overlays from OpenWeatherMap (free tier)
    // If no API key, we show colored interpolation from station data instead
    if (OWM_KEY) {
        overlayLayers.precipitation = L.tileLayer(
            `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
            { attribution: '&copy; OpenWeatherMap', opacity: 0.6, maxZoom: 18 }
        );
        overlayLayers.temperature = L.tileLayer(
            `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
            { attribution: '&copy; OpenWeatherMap', opacity: 0.6, maxZoom: 18 }
        );
        overlayLayers.humidity = L.tileLayer(
            `https://tile.openweathermap.org/map/humidity_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
            { attribution: '&copy; OpenWeatherMap', opacity: 0.6, maxZoom: 18 }
        );
        overlayLayers.soil = L.tileLayer(
            `https://tile.openweathermap.org/map/soil_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
            { attribution: '&copy; OpenWeatherMap', opacity: 0.6, maxZoom: 18 }
        );
    }

    // --- Station Layer ---
    const stationLayerGroup = L.layerGroup().addTo(map);

    // --- Weather data cache ---
    let weatherDataCache = {};
    window.WX.overlayLayers = overlayLayers;
    window.WX.getWeather = id => weatherDataCache[id];

    // --- Create station icon ---
    function createStationIcon(temp) {
        const color = temp !== null ? getTemperatureColor(temp) : '#34e89e';
        return L.divIcon({
            className: 'station-marker-wrapper',
            html: `<div class="station-marker" style="background:${color};"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            popupAnchor: [0, -10]
        });
    }

    function getTemperatureColor(temp) {
        if (temp <= 0) return '#0000ff';
        if (temp <= 10) return '#00aaff';
        if (temp <= 20) return '#00cc66';
        if (temp <= 30) return '#ffcc00';
        if (temp <= 40) return '#ff6600';
        return '#ff0000';
    }

    // --- Build popup content ---
    function buildPopupContent(station, weather) {
        let html = `<div class="popup-title">${station.name}</div>`;
        html += `<div class="popup-row"><span class="popup-label">City:</span><span class="popup-value">${station.city}</span></div>`;
        html += `<div class="popup-row"><span class="popup-label">ICAO:</span><span class="popup-value">${station.id}</span></div>`;
        html += `<div class="popup-row"><span class="popup-label">WMO:</span><span class="popup-value">${station.wmo}</span></div>`;
        html += `<div class="popup-row"><span class="popup-label">Type:</span><span class="popup-value">${station.type}</span></div>`;
        html += `<div class="popup-row"><span class="popup-label">Elevation:</span><span class="popup-value">${station.elevation} m</span></div>`;
        html += `<div class="popup-row"><span class="popup-label">Lat / Lon:</span><span class="popup-value">${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}</span></div>`;
        html += `<div class="popup-row"><span class="popup-label">NCM observations:</span><span class="popup-value">${station.gsod ? 'Yes (NOAA GSOD ' + station.gsod + ')' : 'Not available'}</span></div>`;
        html += `<button class="btn btn-small popup-btn" onclick="openTimeSeries('${station.id}')">📈 Time series — choose From / Until</button>`;

        if (weather) {
            html += `<div class="popup-section">Current Weather</div>`;
            html += row('Temperature', fmt(weather.temperature, '°C'));
            html += row('Feels Like', fmt(weather.apparent_temperature, '°C'));
            html += row('Humidity', fmt(weather.humidity, '%'));
            html += row('Precipitation', fmt(weather.precipitation, ' mm'));
            html += row('Wind Speed', fmt(weather.windspeed, ' km/h'));
            html += row('Wind Direction', fmt(weather.winddirection, '°'));
            html += row('Surface Pressure', fmt(weather.pressure, ' hPa'));
            html += row('Cloud Cover', fmt(weather.cloudcover, '%'));

            html += `<div class="popup-section">Daily Summary</div>`;
            html += row('Max Temp', fmt(weather.temp_max, '°C'));
            html += row('Min Temp', fmt(weather.temp_min, '°C'));
            html += row('Precip. Sum', fmt(weather.precipitation_sum, ' mm'));
            html += row('Rain Sum', fmt(weather.rain_sum, ' mm'));
            html += row('ET₀ (Evapotranspiration)', fmt(weather.et0, ' mm'));
            html += row('Solar Radiation', fmt(weather.shortwave_radiation, ' MJ/m²'));
            html += row('Sunshine Duration', fmt(weather.sunshine_hours, ' hrs'));

            html += `<div class="popup-section">Soil Data</div>`;
            html += row('Soil Temp (0-6 cm)', fmt(weather.soil_temp_0_6, '°C'));
            html += row('Soil Moisture (0-1 cm)', fmt(weather.soil_moisture_0_1, ' m³/m³'));
            html += row('Soil Moisture (1-3 cm)', fmt(weather.soil_moisture_1_3, ' m³/m³'));

            html += `<div class="popup-section">Environmental / Air Quality</div>`;
            const cat = pm25Category(weather.pm25);
            if (cat) {
                html += row('Air Quality (PM2.5)', `<span class="aq-badge" style="background:${cat.color};color:${['#00e400', '#ffff00', '#ff7e00'].includes(cat.color) ? '#111' : '#fff'};">${cat.label}</span>`);
            }
            html += row('Dust', fmt(weather.dust, ' µg/m³'));
            html += row('PM10', fmt(weather.pm10, ' µg/m³'));
            html += row('PM2.5', fmt(weather.pm25, ' µg/m³'));
            html += row('Aerosol Optical Depth', fmt(weather.aod, ''));
            html += row('UV Index', fmt(weather.uv, ''));
            html += row('Ozone (O₃)', fmt(weather.ozone, ' µg/m³'));
            html += row('NO₂', fmt(weather.no2, ' µg/m³'));
            html += row('SO₂', fmt(weather.so2, ' µg/m³'));
            html += row('CO', fmt(weather.co, ' µg/m³'));
            html += row('Formaldehyde (HCHO)', fmt(weather.hcho, ' µg/m³'));
            html += row('Carbon Dioxide (CO₂)', fmt(weather.co2, ' ppm'));
            html += row('Methane (CH₄)', fmt(weather.ch4, ' µg/m³'));
            html += row('Visibility', weather.visibility != null ? (weather.visibility / 1000).toFixed(1) + ' km' : 'N/A');
            html += row('Vapour Pressure Deficit', fmt(weather.vpd, ' kPa'));
            html += row('Wind Gusts', fmt(weather.wind_gusts, ' km/h'));
        } else {
            html += `<div class="popup-section" style="color:#ff6b6b;">Loading weather data...</div>`;
        }

        return html;
    }

    function row(label, value) {
        return `<div class="popup-row"><span class="popup-label">${label}:</span><span class="popup-value">${value}</span></div>`;
    }

    function fmt(val, unit) {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'number') return val.toFixed(1) + unit;
        return val + unit;
    }

    // --- Update sidebar station info ---
    function updateStationInfo(station, weather) {
        const container = document.getElementById('station-info');
        let html = `<div class="station-name">${station.name}</div>`;

        const rows = [
            ['City', station.city],
            ['ICAO', station.id],
            ['WMO', station.wmo],
            ['Type', station.type],
            ['Elevation', station.elevation + ' m'],
            ['Coordinates', `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}`],
        ];

        if (weather) {
            rows.push(
                ['Temperature', fmt(weather.temperature, '°C')],
                ['Humidity', fmt(weather.humidity, '%')],
                ['Precipitation', fmt(weather.precipitation, ' mm')],
                ['Wind', fmt(weather.windspeed, ' km/h')],
                ['Pressure', fmt(weather.pressure, ' hPa')],
                ['Solar Radiation', fmt(weather.shortwave_radiation, ' MJ/m²')],
                ['ET₀', fmt(weather.et0, ' mm')],
                ['Soil Moisture', fmt(weather.soil_moisture_0_1, ' m³/m³')],
                ['Dust', fmt(weather.dust, ' µg/m³')],
                ['PM2.5', fmt(weather.pm25, ' µg/m³')],
                ['UV Index', fmt(weather.uv, '')],
                ['AOD', fmt(weather.aod, '')],
            );
        }

        rows.forEach(([label, value]) => {
            html += `<div class="info-row"><span class="info-label">${label}</span><span class="info-value">${value}</span></div>`;
        });
        html += `<button class="btn" onclick="openTimeSeries('${station.id}')">📈 Time series — choose From / Until</button>`;

        container.innerHTML = html;
    }

    // --- Fetch weather data from Open-Meteo ---
    async function fetchWeatherData(station) {
        const params = new URLSearchParams({
            latitude: station.lat,
            longitude: station.lon,
            current: [
                'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
                'precipitation', 'cloud_cover', 'surface_pressure',
                'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'
            ].join(','),
            daily: [
                'temperature_2m_max', 'temperature_2m_min',
                'precipitation_sum', 'rain_sum',
                'et0_fao_evapotranspiration',
                'shortwave_radiation_sum',
                'sunshine_duration'
            ].join(','),
            hourly: [
                'soil_temperature_6cm',
                'soil_moisture_0_to_1cm',
                'soil_moisture_1_to_3cm',
                'visibility',
                'vapour_pressure_deficit'
            ].join(','),
            timezone: 'Asia/Riyadh',
            forecast_days: 1
        });

        const url = `https://api.open-meteo.com/v1/forecast?${params}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            const current = data.current || {};
            const daily = data.daily || {};
            const hourly = data.hourly || {};

            // Use the hourly value for the current hour
            const lastHourIdx = currentHourIndex(hourly.time, current.time);

            return {
                temperature: current.temperature_2m ?? null,
                apparent_temperature: current.apparent_temperature ?? null,
                humidity: current.relative_humidity_2m ?? null,
                precipitation: current.precipitation ?? null,
                cloudcover: current.cloud_cover ?? null,
                pressure: current.surface_pressure ?? null,
                windspeed: current.wind_speed_10m ?? null,
                winddirection: current.wind_direction_10m ?? null,
                temp_max: daily.temperature_2m_max?.[0] ?? null,
                temp_min: daily.temperature_2m_min?.[0] ?? null,
                precipitation_sum: daily.precipitation_sum?.[0] ?? null,
                rain_sum: daily.rain_sum?.[0] ?? null,
                et0: daily.et0_fao_evapotranspiration?.[0] ?? null,
                shortwave_radiation: daily.shortwave_radiation_sum?.[0] ?? null,
                sunshine_hours: daily.sunshine_duration?.[0] ? (daily.sunshine_duration[0] / 3600).toFixed(1) : null,
                soil_temp_0_6: hourly.soil_temperature_6cm?.[lastHourIdx] ?? null,
                soil_moisture_0_1: hourly.soil_moisture_0_to_1cm?.[lastHourIdx] ?? null,
                soil_moisture_1_3: hourly.soil_moisture_1_to_3cm?.[lastHourIdx] ?? null,
                wind_gusts: current.wind_gusts_10m ?? null,
                visibility: hourly.visibility?.[lastHourIdx] ?? null,
                vpd: hourly.vapour_pressure_deficit?.[lastHourIdx] ?? null,
            };
        } catch (err) {
            console.error(`Failed to fetch weather for ${station.name}:`, err);
            return null;
        }
    }

    function currentHourIndex(times, currentTime) {
        if (!times || !times.length) return 0;
        if (currentTime) {
            const idx = times.indexOf(currentTime.slice(0, 13) + ':00');
            if (idx >= 0) return idx;
        }
        return times.length - 1;
    }

    // --- Fetch environmental / air quality data from Open-Meteo ---
    async function fetchAirQuality(station) {
        const params = new URLSearchParams({
            latitude: station.lat,
            longitude: station.lon,
            current: [
                'dust', 'pm10', 'pm2_5', 'aerosol_optical_depth', 'uv_index',
                'ozone', 'nitrogen_dioxide', 'sulphur_dioxide', 'carbon_monoxide',
                'formaldehyde', 'carbon_dioxide', 'methane'
            ].join(','),
            timezone: 'Asia/Riyadh'
        });

        try {
            const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const c = (await response.json()).current || {};
            return {
                dust: c.dust ?? null,
                pm10: c.pm10 ?? null,
                pm25: c.pm2_5 ?? null,
                aod: c.aerosol_optical_depth ?? null,
                uv: c.uv_index ?? null,
                ozone: c.ozone ?? null,
                no2: c.nitrogen_dioxide ?? null,
                so2: c.sulphur_dioxide ?? null,
                co: c.carbon_monoxide ?? null,
                hcho: c.formaldehyde ?? null,
                co2: c.carbon_dioxide ?? null,
                ch4: c.methane ?? null,
            };
        } catch (err) {
            console.error(`Failed to fetch air quality for ${station.name}:`, err);
            return null;
        }
    }

    // PM2.5 category (US EPA 24h breakpoints)
    function pm25Category(v) {
        if (v === null || v === undefined) return null;
        if (v <= 9) return { label: 'Good', color: '#00e400' };
        if (v <= 35.4) return { label: 'Moderate', color: '#ffff00' };
        if (v <= 55.4) return { label: 'Unhealthy (Sensitive)', color: '#ff7e00' };
        if (v <= 125.4) return { label: 'Unhealthy', color: '#ff0000' };
        if (v <= 225.4) return { label: 'Very Unhealthy', color: '#8f3f97' };
        return { label: 'Hazardous', color: '#7e0023' };
    }

    // --- Load all stations onto the map ---
    async function loadStations() {
        const overlay = document.getElementById('loading-overlay');
        overlay.style.display = 'flex';

        stationLayerGroup.clearLayers();

        // Fetch weather for all stations concurrently (with small batches to be polite)
        const batchSize = 5;
        for (let i = 0; i < SAUDI_WEATHER_STATIONS.length; i += batchSize) {
            const batch = SAUDI_WEATHER_STATIONS.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(async (station) => {
                const [wx, aq] = await Promise.all([fetchWeatherData(station), fetchAirQuality(station)]);
                const weather = (wx || aq) ? { ...(wx || {}), ...(aq || {}) } : null;
                weatherDataCache[station.id] = weather;
                return { station, weather };
            }));

            results.forEach(({ station, weather }) => {
                const temp = weather?.temperature ?? null;
                const marker = L.marker([station.lat, station.lon], {
                    icon: createStationIcon(temp),
                    title: station.name
                });

                marker.bindPopup(buildPopupContent(station, weather), {
                    maxWidth: 350,
                    minWidth: 280,
                    maxHeight: 420
                });

                marker.on('click', () => updateStationInfo(station, weather));

                stationLayerGroup.addLayer(marker);
            });

            // Small delay between batches
            if (i + batchSize < SAUDI_WEATHER_STATIONS.length) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        overlay.style.display = 'none';

        // After loading, also generate interpolation layers
        generateHeatLayers();
    }

    // --- Generate heat/interpolation overlay layers from station data ---
    function generateHeatLayers() {
        // Create circle-based visualization for each weather parameter
        const params = {
            precipitation: { key: 'precipitation', unit: 'mm', colors: ['#f7fbff', '#6baed6', '#08306b'] },
            temperature: { key: 'temperature', unit: '°C', colors: ['#0000ff', '#00cc66', '#ff0000'] },
            humidity: { key: 'humidity', unit: '%', colors: ['#fff5eb', '#fd8d3c', '#7f2704'] },
            evaporation: { key: 'et0', unit: 'mm', colors: ['#f7fcf5', '#74c476', '#00441b'] },
            pet: { key: 'et0', unit: 'mm', colors: ['#fff5f0', '#fb6a4a', '#67000d'] },
            solar: { key: 'shortwave_radiation', unit: 'MJ/m²', colors: ['#ffffd4', '#fe9929', '#8c2d04'] },
            soil: { key: 'soil_moisture_0_1', unit: 'm³/m³', colors: ['#fff7ec', '#ec7014', '#7f2704'] },
            dust: { key: 'dust', unit: 'µg/m³', colors: ['#fff7bc', '#d95f0e', '#662506'] },
            pm10: { key: 'pm10', unit: 'µg/m³', colors: ['#ffffcc', '#fd8d3c', '#800026'] },
            pm25: { key: 'pm25', unit: 'µg/m³', colors: ['#00e400', '#ff7e00', '#7e0023'] },
            aod: { key: 'aod', unit: '', colors: ['#f7f4f9', '#df65b0', '#67001f'] },
            uv: { key: 'uv', unit: '', colors: ['#4eb400', '#f88700', '#b54cff'] },
            ozone: { key: 'ozone', unit: 'µg/m³', colors: ['#f7fcfd', '#8c96c6', '#4d004b'] },
            no2: { key: 'no2', unit: 'µg/m³', colors: ['#fcfbfd', '#9e9ac8', '#3f007d'] },
            so2: { key: 'so2', unit: 'µg/m³', colors: ['#ffffe5', '#78c679', '#004529'] },
            co: { key: 'co', unit: 'µg/m³', colors: ['#f7f7f7', '#969696', '#252525'] },
            hcho: { key: 'hcho', unit: 'µg/m³', colors: ['#fff7f3', '#f768a1', '#49006a'] },
            co2: { key: 'co2', unit: 'ppm', colors: ['#ffffcc', '#fd8d3c', '#800026'] },
            ch4: { key: 'ch4', unit: 'µg/m³', colors: ['#f7fcf5', '#41ab5d', '#00441b'] },
            visibility: { key: 'visibility', unit: 'm', colors: ['#67000d', '#fcbba1', '#f7fbff'] },
            vpd: { key: 'vpd', unit: 'kPa', colors: ['#f7fcf0', '#7bccc4', '#084081'] },
            gusts: { key: 'wind_gusts', unit: 'km/h', colors: ['#f7fbff', '#6baed6', '#08306b'] },
        };

        Object.entries(params).forEach(([layerName, config]) => {
            if (overlayLayers[layerName] && !OWM_KEY) {
                // Already exists from OWM - skip
            }

            // Only create if not already OWM-backed
            if (!OWM_KEY || !['precipitation', 'temperature', 'humidity', 'soil'].includes(layerName)) {
                const group = L.layerGroup();

                SAUDI_WEATHER_STATIONS.forEach(station => {
                    const weather = weatherDataCache[station.id];
                    if (!weather) return;

                    const value = weather[config.key];
                    if (value === null || value === undefined) return;

                    const circle = L.circle([station.lat, station.lon], {
                        radius: 80000,
                        fillColor: interpolateColor(value, config.key, config.colors),
                        fillOpacity: 0.35,
                        stroke: false
                    });

                    circle.bindTooltip(`${station.city}: ${value.toFixed?.(1) ?? value} ${config.unit}`, {
                        permanent: false
                    });

                    group.addLayer(circle);
                });

                overlayLayers[layerName] = group;
            }
        });
    }

    function interpolateColor(value, key, colors) {
        const ranges = {
            temperature: [0, 50],
            humidity: [0, 100],
            precipitation: [0, 20],
            et0: [0, 10],
            shortwave_radiation: [0, 35],
            soil_moisture_0_1: [0, 0.5],
            dust: [0, 2000],
            pm10: [0, 1000],
            pm25: [0, 250],
            aod: [0, 2],
            uv: [0, 12],
            ozone: [0, 200],
            no2: [0, 100],
            so2: [0, 100],
            co: [0, 1000],
            hcho: [0, 10],
            co2: [410, 470],
            ch4: [1300, 1900],
            visibility: [0, 24000],
            vpd: [0, 8],
            wind_gusts: [0, 100],
        };

        const [min, max] = ranges[key] || [0, 100];
        const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));

        // Simple 3-color gradient
        if (ratio < 0.5) {
            return lerpColor(colors[0], colors[1], ratio * 2);
        }
        return lerpColor(colors[1], colors[2], (ratio - 0.5) * 2);
    }

    function lerpColor(a, b, t) {
        const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
        const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
        const rr = Math.round(ar + (br - ar) * t);
        const rg = Math.round(ag + (bg - ag) * t);
        const rb = Math.round(ab + (bb - ab) * t);
        return `#${rr.toString(16).padStart(2, '0')}${rg.toString(16).padStart(2, '0')}${rb.toString(16).padStart(2, '0')}`;
    }

    // --- Layer toggle handlers ---
    document.querySelectorAll('input[data-layer]').forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const layerName = this.dataset.layer;

            if (layerName === 'stations') {
                if (this.checked) {
                    stationLayerGroup.addTo(map);
                } else {
                    map.removeLayer(stationLayerGroup);
                }
                return;
            }

            const layer = overlayLayers[layerName];
            if (!layer) {
                alert(`Layer "${layerName}" requires weather data to be loaded first, or an OpenWeatherMap API key for tile-based overlays.`);
                this.checked = false;
                return;
            }

            if (this.checked) {
                layer.addTo(map);
                updateLegend(layerName);
            } else {
                map.removeLayer(layer);
                clearLegendIfLast();
            }
        });
    });

    // --- Legend management ---
    const legendConfigs = window.WX.legendConfigs = {
        dem: {
            title: 'DEM Elevation',
            gradient: 'linear-gradient(to right, #006400, #90EE90, #FFFF00, #8B4513, #FFFFFF)',
            labels: ['0m', '500m', '1000m', '2000m', '3000m+']
        },
        precipitation: {
            title: 'Precipitation',
            gradient: 'linear-gradient(to right, #f7fbff, #6baed6, #08306b)',
            labels: ['0 mm', '10 mm', '20+ mm']
        },
        temperature: {
            title: 'Temperature',
            gradient: 'linear-gradient(to right, #0000ff, #00cc66, #ffcc00, #ff0000)',
            labels: ['0°C', '20°C', '35°C', '50°C']
        },
        humidity: {
            title: 'Relative Humidity',
            gradient: 'linear-gradient(to right, #fff5eb, #fd8d3c, #7f2704)',
            labels: ['0%', '50%', '100%']
        },
        evaporation: {
            title: 'Evapotranspiration (ET₀)',
            gradient: 'linear-gradient(to right, #f7fcf5, #74c476, #00441b)',
            labels: ['0 mm', '5 mm', '10+ mm']
        },
        pet: {
            title: 'Potential Evapotranspiration',
            gradient: 'linear-gradient(to right, #fff5f0, #fb6a4a, #67000d)',
            labels: ['0 mm', '5 mm', '10+ mm']
        },
        solar: {
            title: 'Solar Radiation',
            gradient: 'linear-gradient(to right, #ffffd4, #fe9929, #8c2d04)',
            labels: ['0', '17', '35+ MJ/m²']
        },
        soil: {
            title: 'Soil Moisture (0-1 cm)',
            gradient: 'linear-gradient(to right, #fff7ec, #ec7014, #7f2704)',
            labels: ['0', '0.25', '0.5 m³/m³']
        },
        dust: { title: 'Dust Concentration', gradient: 'linear-gradient(to right, #fff7bc, #d95f0e, #662506)', labels: ['0', '1000', '2000+ µg/m³'] },
        pm10: { title: 'PM10', gradient: 'linear-gradient(to right, #ffffcc, #fd8d3c, #800026)', labels: ['0', '500', '1000+ µg/m³'] },
        pm25: { title: 'PM2.5', gradient: 'linear-gradient(to right, #00e400, #ff7e00, #7e0023)', labels: ['0', '125', '250+ µg/m³'] },
        aod: { title: 'Aerosol Optical Depth', gradient: 'linear-gradient(to right, #f7f4f9, #df65b0, #67001f)', labels: ['0', '1', '2+'] },
        uv: { title: 'UV Index', gradient: 'linear-gradient(to right, #4eb400, #f88700, #b54cff)', labels: ['0', '6', '12+'] },
        ozone: { title: 'Ozone (O₃)', gradient: 'linear-gradient(to right, #f7fcfd, #8c96c6, #4d004b)', labels: ['0', '100', '200+ µg/m³'] },
        no2: { title: 'Nitrogen Dioxide (NO₂)', gradient: 'linear-gradient(to right, #fcfbfd, #9e9ac8, #3f007d)', labels: ['0', '50', '100+ µg/m³'] },
        so2: { title: 'Sulphur Dioxide (SO₂)', gradient: 'linear-gradient(to right, #ffffe5, #78c679, #004529)', labels: ['0', '50', '100+ µg/m³'] },
        co: { title: 'Carbon Monoxide (CO)', gradient: 'linear-gradient(to right, #f7f7f7, #969696, #252525)', labels: ['0', '500', '1000+ µg/m³'] },
        hcho: { title: 'Formaldehyde (HCHO)', gradient: 'linear-gradient(to right, #fff7f3, #f768a1, #49006a)', labels: ['0', '5', '10+ µg/m³'] },
        co2: { title: 'Carbon Dioxide (CO₂)', gradient: 'linear-gradient(to right, #ffffcc, #fd8d3c, #800026)', labels: ['410', '440', '470+ ppm'] },
        ch4: { title: 'Methane (CH₄)', gradient: 'linear-gradient(to right, #f7fcf5, #41ab5d, #00441b)', labels: ['1300', '1600', '1900+ µg/m³'] },
        wind: { title: 'Wind speed & direction', gradient: 'linear-gradient(to right, #c6dbef, #6baed6, #2171b5, #08306b)', labels: ['0', '15', '30', '45+ km/h'] },
        visibility: { title: 'Visibility', gradient: 'linear-gradient(to right, #67000d, #fcbba1, #f7fbff)', labels: ['0 km', '12 km', '24+ km'] },
        vpd: { title: 'Vapour Pressure Deficit', gradient: 'linear-gradient(to right, #f7fcf0, #7bccc4, #084081)', labels: ['0', '4', '8+ kPa'] },
        gusts: { title: 'Wind Gusts', gradient: 'linear-gradient(to right, #f7fbff, #6baed6, #08306b)', labels: ['0', '50', '100+ km/h'] },
    };

    function updateLegend(layerName) {
        const config = legendConfigs[layerName];
        if (!config) return;

        const container = document.getElementById('legend-container');
        container.innerHTML = `
            <strong>${config.title}</strong>
            <div class="legend-gradient" style="background: ${config.gradient};"></div>
            <div class="legend-labels">
                ${config.labels.map(l => `<span>${l}</span>`).join('')}
            </div>
        `;
    }

    function clearLegendIfLast() {
        const anyChecked = document.querySelectorAll('input[data-layer]:checked:not([data-layer="stations"])');
        if (anyChecked.length === 0) {
            document.getElementById('legend-container').innerHTML = '<p class="legend-hint">Enable a layer to see its legend</p>';
        }
    }

    // --- Refresh button ---
    document.getElementById('btn-refresh').addEventListener('click', () => {
        loadStations();
    });

    // --- Scale control ---
    L.control.scale({ imperial: false }).addTo(map);

    // --- Ensure map renders correctly ---
    setTimeout(() => map.invalidateSize(), 100);
    window.addEventListener('resize', () => map.invalidateSize());

    // --- Initialize ---
    loadStations();

})();
