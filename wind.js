// ============================================================
// Wind speed & direction map layer
// Arrows point the way the wind is blowing (downwind) and are coloured by speed.
//   • station arrows: the live readings already loaded for each station
//   • wind field: a 2° grid of current 10 m wind over Saudi Arabia (Open-Meteo,
//     best-match forecast model), loaded when the layer is switched on
// ============================================================

(function () {
    'use strict';

    const WX = window.WX;
    const group = L.layerGroup();
    let loading = false;

    const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const compass = deg => COMPASS[Math.round(deg / 22.5) % 16];

    function speedColor(kmh) {
        if (kmh < 10) return '#9ecae1';
        if (kmh < 20) return '#4292c6';
        if (kmh < 30) return '#2171b5';
        if (kmh < 45) return '#08519c';
        return '#e6550d';
    }

    // fromDeg = meteorological direction (where the wind comes FROM)
    function arrowIcon(fromDeg, kmh, big) {
        const size = big ? 34 : 24;
        const rot = (fromDeg + 180) % 360;
        const col = speedColor(kmh);
        return L.divIcon({
            className: 'wind-arrow',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
                     <path d="M12 2 L18 12 L13.5 11 L13.5 22 L10.5 22 L10.5 11 L6 12 Z" fill="${col}" stroke="#fff" stroke-width="${big ? 1.2 : 0.8}"/>
                   </svg>`
        });
    }

    function addArrow(lat, lon, fromDeg, kmh, label, big) {
        if (fromDeg === null || fromDeg === undefined || kmh === null || kmh === undefined) return;
        L.marker([lat, lon], { icon: arrowIcon(fromDeg, kmh, big), interactive: true, keyboard: false })
            .bindTooltip(`${label ? `<b>${label}</b><br>` : ''}Wind from ${compass(fromDeg)} (${Math.round(fromDeg)}°) at ${kmh.toFixed(0)} km/h`)
            .addTo(group);
    }

    async function build() {
        if (loading) return;
        loading = true;
        group.clearLayers();

        // Wind field on a 2° grid
        const lats = [], lons = [];
        for (let la = 16; la <= 32; la += 2) for (let lo = 35; lo <= 55; lo += 2) { lats.push(la); lons.push(lo); }
        try {
            const q = new URLSearchParams({
                latitude: lats.join(','), longitude: lons.join(','),
                current: 'wind_speed_10m,wind_direction_10m', timezone: 'Asia/Riyadh'
            });
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.reason || `HTTP ${res.status}`);
            (Array.isArray(json) ? json : [json]).forEach((r, i) =>
                addArrow(lats[i], lons[i], r.current?.wind_direction_10m, r.current?.wind_speed_10m, null, false));
        } catch (e) {
            console.warn('Wind field could not be loaded:', e);
        }

        // Station arrows on top
        SAUDI_WEATHER_STATIONS.forEach(s => {
            const w = WX.getWeather(s.id);
            if (w) addArrow(s.lat, s.lon, w.winddirection, w.windspeed, s.city, true);
        });
        loading = false;
    }

    group.on('add', build);
    WX.overlayLayers.wind = group;
})();
