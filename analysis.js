// ============================================================
// Areal analysis: average a variable over an area (Saudi Arabia or a
// boundary you draw) for a chosen period, using several standard methods:
//   Arithmetic mean, Thiessen polygons, Isohyetal, Inverse Distance
//   Weighting (IDW), Thin-plate spline and Ordinary kriging.
// ============================================================

(function () {
    'use strict';

    const map = window.WX.map;
    const VARS = window.PERIOD_VARS;
    const DU = window.dateUtils;
    const $ = id => document.getElementById(id);

    const EARTH_R = 6371.0088;          // km
    const KX = 111.32 * Math.cos(24 * Math.PI / 180);  // km per degree longitude near 24°N
    const KY = 110.57;                  // km per degree latitude

    const METHODS = {
        arithmetic: 'Arithmetic Mean',
        thiessen:   'Thiessen Polygons',
        isohyetal:  'Isohyetal',
        idw:        'Inverse Distance Weighting',
        spline:     'Thin-Plate Spline',
        kriging:    'Ordinary Kriging',
    };

    const RAMPS = {
        blues: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
        reds:  ['#fff5f0', '#fcbba1', '#fb6a4a', '#cb181d', '#67000d'],
        temp:  ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026'],
        humid: ['#ffffe5', '#c7e9b4', '#41b6c4', '#225ea8', '#081d58'],
        solar: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'],
        soil:  ['#fff7ec', '#d9f0a3', '#78c679', '#238443', '#004529'],
    };

    let nationalGeom = null;
    let customGeom = null;
    const boundaryLayer = L.layerGroup().addTo(map);
    const resultLayer = L.layerGroup().addTo(map);
    let lastRun = null;

    // ---------------- Geometry helpers ----------------
    const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;

    function pointInRing(x, y, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }

    function pointInGeom(lon, lat, g) {
        for (const p of polys(g)) {
            if (!pointInRing(lon, lat, p[0])) continue;
            let inHole = false;
            for (let k = 1; k < p.length; k++) if (pointInRing(lon, lat, p[k])) { inHole = true; break; }
            if (!inHole) return true;
        }
        return false;
    }

    function geomBBox(g) {
        let b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const p of polys(g)) for (const [x, y] of p[0]) {
            if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
            if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
        }
        return b;
    }

    const toXY = (lon, lat) => [lon * KX, lat * KY];

    function currentGeom() {
        return ($('an-boundary').value === 'custom' && customGeom) ? customGeom : nationalGeom;
    }

    function drawBoundary() {
        boundaryLayer.clearLayers();
        const g = currentGeom();
        if (!g) return;
        L.geoJSON({ type: 'Feature', geometry: g }, {
            style: { color: '#34e89e', weight: 2, fill: false, dashArray: '6,4' },
            interactive: false
        }).addTo(boundaryLayer);
    }

    async function loadNationalBoundary() {
        try {
            const topo = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json')).json();
            const f = topojson.feature(topo, topo.objects.countries).features.find(f => String(f.id) === '682');
            if (!f) throw new Error('Saudi Arabia not found in boundary file');
            nationalGeom = f.geometry;
        } catch (e) {
            console.warn('Boundary download failed, using a bounding box instead:', e);
            nationalGeom = { type: 'Polygon', coordinates: [[[34.5, 16], [55.7, 16], [55.7, 32.5], [34.5, 32.5], [34.5, 16]]] };
        }
        drawBoundary();
    }

    // ---------------- Linear algebra ----------------
    // Solve A x = b by Gaussian elimination with partial pivoting
    function solve(A, b) {
        const n = b.length;
        const M = A.map((row, i) => [...row, b[i]]);
        for (let c = 0; c < n; c++) {
            let p = c;
            for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
            if (Math.abs(M[p][c]) < 1e-12) throw new Error('Singular matrix (stations too close or duplicated)');
            [M[c], M[p]] = [M[p], M[c]];
            for (let r = c + 1; r < n; r++) {
                const f = M[r][c] / M[c][c];
                if (f === 0) continue;
                for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
            }
        }
        const x = new Array(n).fill(0);
        for (let r = n - 1; r >= 0; r--) {
            let s = M[r][n];
            for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
            x[r] = s / M[r][r];
        }
        return x;
    }

    // ---------------- Interpolators ----------------
    // Each returns a function (x, y) -> value, with x, y in km

    function makeIdw(pts, power) {
        return (x, y) => {
            let sw = 0, sz = 0;
            for (const p of pts) {
                const d = Math.hypot(x - p.x, y - p.y);
                if (d < 0.5) return p.v;
                const w = 1 / Math.pow(d, power);
                sw += w; sz += w * p.v;
            }
            return sz / sw;
        };
    }

    function makeSpline(pts, smoothing) {
        const n = pts.length, S = 100;   // scale distances to 100 km units for numerical stability
        const phi = r => r <= 0 ? 0 : (r / S) * (r / S) * Math.log(r / S);
        const N = n + 3;
        const A = Array.from({ length: N }, () => new Array(N).fill(0));
        const b = new Array(N).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                A[i][j] = phi(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)) + (i === j ? smoothing : 0);
            }
            A[i][n] = A[n][i] = 1;
            A[i][n + 1] = A[n + 1][i] = pts[i].x / S;
            A[i][n + 2] = A[n + 2][i] = pts[i].y / S;
            b[i] = pts[i].v;
        }
        const w = solve(A, b);
        return (x, y) => {
            let s = w[n] + w[n + 1] * x / S + w[n + 2] * y / S;
            for (let i = 0; i < n; i++) s += w[i] * phi(Math.hypot(x - pts[i].x, y - pts[i].y));
            return s;
        };
    }

    // Fit an exponential semivariogram  γ(h) = c0 + c·(1 − exp(−3h/a))  to the station data
    function fitVariogram(pts) {
        const n = pts.length;
        const mean = pts.reduce((s, p) => s + p.v, 0) / n;
        const variance = pts.reduce((s, p) => s + (p.v - mean) ** 2, 0) / n;
        if (variance < 1e-12) return null;

        const pairs = [];
        let maxD = 0;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const h = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            pairs.push([h, 0.5 * (pts[i].v - pts[j].v) ** 2]);
            if (h > maxD) maxD = h;
        }
        const lagMax = maxD / 2, NB = 12;
        const bins = Array.from({ length: NB }, () => ({ h: 0, g: 0, n: 0 }));
        for (const [h, g] of pairs) {
            if (h > lagMax) continue;
            const k = Math.min(NB - 1, Math.floor(h / lagMax * NB));
            bins[k].h += h; bins[k].g += g; bins[k].n++;
        }
        const emp = bins.filter(b => b.n > 0).map(b => ({ h: b.h / b.n, g: b.g / b.n, n: b.n }));

        let best = { sse: Infinity, nugget: 0, sill: variance, range: lagMax };
        for (let ai = 1; ai <= 30; ai++) {
            const a = Math.max(50, lagMax * 2 * ai / 30);
            for (let fi = 0; fi <= 5; fi++) {
                const f = fi / 10;   // nugget as a fraction of the sill (0–50 %)
                const m = emp.map(e => f + (1 - f) * (1 - Math.exp(-3 * e.h / a)));
                let num = 0, den = 0;
                emp.forEach((e, i) => { num += e.n * e.g * m[i]; den += e.n * m[i] * m[i]; });
                const s = den > 0 ? num / den : variance;
                if (s <= 0) continue;
                let sse = 0;
                emp.forEach((e, i) => { sse += e.n * (e.g - s * m[i]) ** 2; });
                if (sse < best.sse) best = { sse, nugget: s * f, sill: s, range: a };
            }
        }
        best.empirical = emp;
        return best;
    }

    function makeKriging(pts) {
        const vg = fitVariogram(pts);
        if (!vg) {
            const c = pts[0].v;
            return { fn: () => c, variogram: null };
        }
        const gamma = h => h <= 0 ? 0 : vg.nugget + (vg.sill - vg.nugget) * (1 - Math.exp(-3 * h / vg.range));
        const n = pts.length, N = n + 1;
        const A = Array.from({ length: N }, () => new Array(N).fill(0));
        const b = new Array(N).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) A[i][j] = gamma(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
            A[i][n] = A[n][i] = 1;
            b[i] = pts[i].v;
        }
        // Because the kriging matrix is symmetric, z*(x0) = [γ0; 1]ᵀ · A⁻¹ · [z; 0]
        const alpha = solve(A, b);
        const fn = (x, y) => {
            let s = alpha[n];
            for (let i = 0; i < n; i++) s += alpha[i] * gamma(Math.hypot(x - pts[i].x, y - pts[i].y));
            return s;
        };
        return { fn, variogram: vg };
    }

    // ---------------- Grid ----------------
    function buildGrid(g, res) {
        const bb = geomBBox(g);
        const lonMin = Math.floor((bb[0] - res) / res) * res, lonMax = Math.ceil((bb[2] + res) / res) * res;
        const latMin = Math.floor((bb[1] - res) / res) * res, latMax = Math.ceil((bb[3] + res) / res) * res;
        const nx = Math.round((lonMax - lonMin) / res), ny = Math.round((latMax - latMin) / res);
        const inside = new Uint8Array(nx * ny);
        const rowArea = new Float64Array(ny);
        const rad = Math.PI / 180;
        let totalArea = 0;
        for (let j = 0; j < ny; j++) {
            const lat = latMax - (j + 0.5) * res;
            // exact area of a lat/lon cell on a sphere
            rowArea[j] = EARTH_R * EARTH_R * (res * rad) * Math.abs(Math.sin((lat + res / 2) * rad) - Math.sin((lat - res / 2) * rad));
            for (let i = 0; i < nx; i++) {
                const lon = lonMin + (i + 0.5) * res;
                if (pointInGeom(lon, lat, g)) { inside[j * nx + i] = 1; totalArea += rowArea[j]; }
            }
        }
        return { lonMin, lonMax, latMin, latMax, nx, ny, res, inside, rowArea, totalArea };
    }

    function evalField(G, fn, clamp) {
        const f = new Float64Array(G.nx * G.ny);
        for (let j = 0; j < G.ny; j++) {
            const lat = G.latMax - (j + 0.5) * G.res;
            for (let i = 0; i < G.nx; i++) {
                const [x, y] = toXY(G.lonMin + (i + 0.5) * G.res, lat);
                f[j * G.nx + i] = clamp(fn(x, y));
            }
        }
        return f;
    }

    function areaMean(G, f) {
        let s = 0;
        for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
            const k = j * G.nx + i;
            if (G.inside[k]) s += G.rowArea[j] * f[k];
        }
        return s / G.totalArea;
    }

    function niceStep(range) {
        if (!(range > 0)) return 1;
        const raw = range / 8;
        const p = Math.pow(10, Math.floor(Math.log10(raw)));
        const m = raw / p;
        return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
    }

    // ---------------- Methods ----------------
    function runMethods(pts, G, opts, v) {
        const clamp = x => {
            if (v.nonneg && x < 0) x = 0;
            if (v.max !== undefined && x > v.max) x = v.max;
            return x;
        };
        const out = {};

        // 1. Arithmetic mean of stations inside the boundary
        const insidePts = pts.filter(p => p.inside);
        out.arithmetic = {
            value: insidePts.length ? insidePts.reduce((s, p) => s + p.v, 0) / insidePts.length : null,
            note: `${insidePts.length} station(s) inside the boundary`
        };

        // 2. Thiessen polygons: every grid cell belongs to its nearest station
        const owner = new Int16Array(G.nx * G.ny).fill(-1);
        const ownArea = new Float64Array(pts.length);
        const thField = new Float64Array(G.nx * G.ny);
        for (let j = 0; j < G.ny; j++) {
            const lat = G.latMax - (j + 0.5) * G.res;
            for (let i = 0; i < G.nx; i++) {
                const k = j * G.nx + i;
                const [x, y] = toXY(G.lonMin + (i + 0.5) * G.res, lat);
                let best = -1, bd = Infinity;
                pts.forEach((p, idx) => { const d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < bd) { bd = d; best = idx; } });
                owner[k] = best;
                thField[k] = pts[best].v;
                if (G.inside[k]) ownArea[best] += G.rowArea[j];
            }
        }
        let thSum = 0;
        pts.forEach((p, idx) => { thSum += ownArea[idx] * p.v; });
        out.thiessen = {
            value: thSum / G.totalArea,
            note: `${pts.filter((p, i) => ownArea[i] > 0).length} station polygon(s) cover the area`,
            field: thField, owner,
            weights: pts.map((p, i) => ({ name: p.name, v: p.v, area: ownArea[i], w: ownArea[i] / G.totalArea }))
                        .filter(r => r.area > 0).sort((a, b) => b.w - a.w)
        };

        // 3. IDW
        const idwField = evalField(G, makeIdw(pts, opts.power), clamp);
        out.idw = { value: areaMean(G, idwField), note: `power p = ${opts.power}`, field: idwField };

        // 4. Thin-plate spline
        try {
            const spField = evalField(G, makeSpline(pts, opts.smoothing), clamp);
            out.spline = { value: areaMean(G, spField), note: `smoothing λ = ${opts.smoothing}`, field: spField };
        } catch (e) { out.spline = { value: null, note: e.message }; }

        // 5. Ordinary kriging
        try {
            const kr = makeKriging(pts);
            const krField = evalField(G, kr.fn, clamp);
            const vg = kr.variogram;
            out.kriging = {
                value: areaMean(G, krField), field: krField, variogram: vg,
                note: vg ? `exponential variogram: nugget ${vg.nugget.toFixed(2)}, sill ${vg.sill.toFixed(2)}, range ${vg.range.toFixed(0)} km`
                         : 'all stations equal — constant field'
            };
        } catch (e) { out.kriging = { value: null, note: e.message }; }

        // 6. Isohyetal: contour the interpolated surface, then weight each band
        //    by its area using the average of its two bounding isohyets
        const base = out[opts.isoBase]?.field || idwField;
        let vmin = Infinity, vmax = -Infinity;
        for (let k = 0; k < base.length; k++) if (G.inside[k]) { vmin = Math.min(vmin, base[k]); vmax = Math.max(vmax, base[k]); }
        const step = opts.interval > 0 ? opts.interval : niceStep(vmax - vmin);
        const L0 = Math.floor(vmin / step) * step;
        const nb = Math.max(1, Math.ceil((vmax - L0) / step));
        const levels = Array.from({ length: nb + 1 }, (_, i) => +(L0 + i * step).toFixed(10));
        const bandArea = new Float64Array(nb);
        for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
            const k = j * G.nx + i;
            if (!G.inside[k]) continue;
            const b = Math.min(nb - 1, Math.max(0, Math.floor((base[k] - L0) / step)));
            bandArea[b] += G.rowArea[j];
        }
        let isoVal;
        if (vmax - vmin < 1e-9) isoVal = vmin;
        else {
            isoVal = 0;
            for (let b = 0; b < nb; b++) isoVal += bandArea[b] * (levels[b] + levels[b + 1]) / 2;
            isoVal /= G.totalArea;
        }
        out.isohyetal = {
            value: isoVal, field: base, levels, step,
            note: `interval ${step} ${v.unit}, drawn from ${METHODS[opts.isoBase] || 'IDW'}`,
            bands: Array.from(bandArea).map((a, b) => ({ lo: levels[b], hi: levels[b + 1], area: a, w: a / G.totalArea }))
                                       .filter(r => r.area > 0)
        };

        return out;
    }

    // ---------------- Rendering ----------------
    function rampColor(colors, t) {
        t = Math.max(0, Math.min(1, t));
        const s = t * (colors.length - 1), i = Math.min(colors.length - 2, Math.floor(s)), f = s - i;
        const a = colors[i], b = colors[i + 1];
        const c = n => Math.round(parseInt(a.slice(n, n + 2), 16) * (1 - f) + parseInt(b.slice(n, n + 2), 16) * f);
        return [c(1), c(3), c(5)];
    }

    // Draw a grid as an image, resampled into Web-Mercator rows so it lines up with the map
    function addRaster(G, valueAt, colorOf, borderAt, pixelated) {
        const canvas = document.createElement('canvas');
        canvas.width = G.nx; canvas.height = G.ny;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(G.nx, G.ny);
        const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
        const yTop = merc(G.latMax), yBot = merc(G.latMin);
        for (let r = 0; r < G.ny; r++) {
            const y = yTop - (r + 0.5) * (yTop - yBot) / G.ny;
            const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
            const j = Math.min(G.ny - 1, Math.max(0, Math.floor((G.latMax - lat) / G.res)));
            for (let i = 0; i < G.nx; i++) {
                const k = j * G.nx + i, o = (r * G.nx + i) * 4;
                if (!G.inside[k]) continue;
                const rgb = (borderAt && borderAt(j, i)) ? [40, 40, 40] : colorOf(valueAt(k));
                img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 200;
            }
        }
        ctx.putImageData(img, 0, 0);
        L.imageOverlay(canvas.toDataURL(), [[G.latMin, G.lonMin], [G.latMax, G.lonMax]], {
            opacity: 0.8, className: pixelated ? 'pixelated' : '', interactive: false
        }).addTo(resultLayer);
    }

    function addIsolines(G, field, levels, unit) {
        if (typeof d3 === 'undefined' || !d3.contours) return;
        const contours = d3.contours().size([G.nx, G.ny]).thresholds(levels)(Array.from(field));
        const onEdge = ([x, y]) => x <= 0 || y <= 0 || x >= G.nx || y >= G.ny;
        const toLL = ([x, y]) => [G.latMax - y * G.res, G.lonMin + x * G.res];
        for (const c of contours) {
            for (const poly of c.coordinates) for (const ring of poly) {
                let seg = [];
                const flush = () => {
                    if (seg.length > 1) {
                        L.polyline(seg, { color: '#222', weight: 1.3, opacity: 0.9 })
                            .bindTooltip(`${+c.value.toFixed(3)} ${unit}`, { sticky: true })
                            .addTo(resultLayer);
                    }
                    seg = [];
                };
                for (const pt of ring) {
                    if (onEdge(pt)) flush(); else seg.push(toLL(pt));
                }
                flush();
            }
        }
    }

    function render(run) {
        resultLayer.clearLayers();
        const { G, pts, results, v, method } = run;
        const colors = RAMPS[v.ramp] || RAMPS.blues;

        // Colour scale from station values (and fields) for consistency between methods
        let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
        if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
        const colorOf = val => rampColor(colors, (val - lo) / (hi - lo));

        const r = results[method];
        if (method === 'thiessen') {
            const own = r.owner;
            const border = (j, i) => {
                const k = j * G.nx + i;
                return (i + 1 < G.nx && own[k + 1] !== own[k]) || (j + 1 < G.ny && own[k + G.nx] !== own[k]);
            };
            addRaster(G, k => r.field[k], colorOf, border, true);
        } else if (method === 'isohyetal') {
            const step = r.step, L0 = r.levels[0];
            addRaster(G, k => {
                const b = Math.floor((r.field[k] - L0) / step);
                return L0 + (b + 0.5) * step;
            }, colorOf, null, true);
            addIsolines(G, r.field, r.levels, v.unit);
        } else if (method !== 'arithmetic' && r.field) {
            addRaster(G, k => r.field[k], colorOf, null, false);
        }

        // Station markers labelled with their period value
        pts.forEach(p => {
            L.circleMarker([p.lat, p.lon], {
                radius: 5, color: '#fff', weight: 1.5,
                fillColor: p.inside ? '#111' : '#777', fillOpacity: 1
            }).bindTooltip(`${p.v.toFixed(1)}`, { permanent: true, direction: 'top', className: 'val-label', offset: [0, -4] })
              .bindPopup(`<b>${p.name}</b><br>${v.label}: ${p.v.toFixed(2)} ${v.unit}`)
              .addTo(resultLayer);
        });

        // Key in the map corner and in the panel
        window.MapKey.set('analysis', {
            title: `${METHODS[method]} — ${v.label}`,
            sub: `${window.DATA_SOURCES[run.source]?.name || ''} · ${run.from} → ${run.until} · ${v.agg === 'sum' ? 'period total' : 'period mean'}`,
            colors, labels: [lo.toFixed(1), ((lo + hi) / 2).toFixed(1), hi.toFixed(1)], unit: v.unit,
            note: method === 'arithmetic' ? 'Arithmetic mean has no surface; dots show station values.' : ''
        });
        const grad = `linear-gradient(to right, ${colors.join(',')})`;
        $('an-legend').innerHTML = `
            <div class="legend-gradient" style="background:${grad};"></div>
            <div class="legend-labels"><span>${lo.toFixed(1)}</span><span>${((lo + hi) / 2).toFixed(1)}</span><span>${hi.toFixed(1)} ${v.unit}</span></div>`;
    }

    function renderTables(run) {
        const { results, v, method, G, from, until, source, excluded, flagged, minCoverage, pts } = run;
        const fmt = x => (x === null || x === undefined || Number.isNaN(x)) ? 'N/A' : x.toFixed(2);
        const srcName = window.DATA_SOURCES[source].name;

        const rows = Object.entries(METHODS).map(([k, name]) => `
            <tr class="${k === method ? 'selected' : ''}" data-method="${k}">
                <td>${name}</td>
                <td class="num"><strong>${fmt(results[k]?.value)}</strong></td>
                <td class="small">${results[k]?.note || ''}</td>
            </tr>`).join('');
        let html = `<p class="small">${v.label} (${v.agg === 'sum' ? 'period total' : 'period mean'}), ${from} → ${until}, from <strong>${srcName}</strong>.
                    Area: ${Math.round(G.totalArea).toLocaleString()} km². ${pts.length} stations used
                    (each with at least ${Math.round(minCoverage * 100)}% of days reported).</p>
            ${excluded.length ? `<p class="small">Not used: ${excluded.join(', ')}.</p>` : ''}
            ${flagged.length ? `<p class="small">* ${flagged.join(', ')}: rain was observed on some days with no amount reported, so these totals are too low.</p>` : ''}
            ${source === 'ncm' && v.agg === 'sum' ? `<p class="small">Totals add up the days each station reported; missing days are not filled in.</p>` : ''}
            <table class="data-table">
              <thead><tr><th>Method</th><th>Areal value (${v.unit})</th><th>Details</th></tr></thead>
              <tbody>${rows}</tbody></table>`;

        if (method === 'thiessen') {
            html += `<h4>Thiessen weights</h4><table class="data-table">
                <thead><tr><th>Station</th><th>Value</th><th>Area km²</th><th>Weight</th></tr></thead><tbody>
                ${results.thiessen.weights.map(w => `<tr><td>${w.name}</td><td class="num">${fmt(w.v)}</td>
                    <td class="num">${Math.round(w.area).toLocaleString()}</td><td class="num">${(w.w * 100).toFixed(1)}%</td></tr>`).join('')}
                </tbody></table>`;
        }
        if (method === 'isohyetal') {
            html += `<h4>Isohyet bands</h4><table class="data-table">
                <thead><tr><th>Between isohyets</th><th>Mean</th><th>Area km²</th><th>Share</th></tr></thead><tbody>
                ${results.isohyetal.bands.map(b => `<tr><td>${fmt(b.lo)} – ${fmt(b.hi)}</td><td class="num">${fmt((b.lo + b.hi) / 2)}</td>
                    <td class="num">${Math.round(b.area).toLocaleString()}</td><td class="num">${(b.w * 100).toFixed(1)}%</td></tr>`).join('')}
                </tbody></table>`;
        }
        if (method === 'kriging' && results.kriging.variogram) {
            const vg = results.kriging.variogram;
            html += `<h4>Fitted semivariogram</h4><table class="data-table">
                <thead><tr><th>Lag (km)</th><th>Empirical γ</th><th>Model γ</th><th>Pairs</th></tr></thead><tbody>
                ${vg.empirical.map(e => `<tr><td class="num">${e.h.toFixed(0)}</td><td class="num">${fmt(e.g)}</td>
                    <td class="num">${fmt(vg.nugget + (vg.sill - vg.nugget) * (1 - Math.exp(-3 * e.h / vg.range)))}</td><td class="num">${e.n}</td></tr>`).join('')}
                </tbody></table>`;
        }
        $('an-results').innerHTML = html;
        $('an-results').querySelectorAll('tr[data-method]').forEach(tr =>
            tr.addEventListener('click', () => { $('an-method').value = tr.dataset.method; showMethod(); }));
    }

    function showMethod() {
        if (!lastRun) return;
        lastRun.method = $('an-method').value;
        render(lastRun);
        renderTables(lastRun);
    }

    // ---------------- Run ----------------
    function setStatus(msg, isError) {
        const s = $('an-status');
        s.textContent = msg;
        s.className = 'status' + (isError ? ' error' : '');
    }

    async function runAnalysis() {
        const from = $('an-from').value, until = $('an-until').value;
        const g = currentGeom();
        if (!g) return setStatus('The boundary is still loading — try again in a moment.', true);

        const key = $('an-variable').value;
        const v = VARS[key];
        const source = $('an-source').value;
        const SRC = window.DATA_SOURCES[source];
        const rangeErr = window.sourceRangeError(source, from, until);
        if (rangeErr) return setStatus(rangeErr, true);
        if (!SRC.vars.includes(key)) {
            const others = Object.values(window.DATA_SOURCES).filter(x => x.vars.includes(key)).map(x => x.name).join(', ');
            return setStatus(`${SRC.name} does not provide ${v.label}. Sources that do: ${others}.`, true);
        }
        const minCoverage = Math.min(100, Math.max(0, Number($('an-coverage').value) || 0)) / 100;

        setStatus(source === 'ncm' ? 'Downloading NCM station observations (NOAA archive)…' : 'Downloading ERA5 data for the period…');
        let data;
        try {
            data = await window.fetchSource(source, SAUDI_WEATHER_STATIONS, from, until,
                (done, total) => setStatus(`Downloading ${SRC.name}: ${done} of ${total} stations…`));
        } catch (e) {
            return setStatus('Could not load data: ' + e.message, true);
        }

        const pts = [], excluded = [], flagged = [];
        SAUDI_WEATHER_STATIONS.forEach((s, i) => {
            const d = data[i];
            if (!d?.available) { excluded.push(`${s.city} (no data)`); return; }
            const series = d.daily[key] || [];
            const sm = window.summarizeSeries(series, v.agg);
            const coverage = series.length ? sm.n / series.length : 0;
            if (sm.value === null || coverage < minCoverage) {
                excluded.push(`${s.city} (${Math.round(coverage * 100)}% of days)`);
                return;
            }
            let label = s.city;
            if (key === 'precipitation_sum' && d.rainNoAmount > 0) {
                if ($('an-rainmissing').value === 'exclude') {
                    excluded.push(`${s.city} (rain on ${d.rainNoAmount} day(s) with no amount)`);
                    return;
                }
                label = s.city + '*';
                flagged.push(s.city);
            }
            const [x, y] = toXY(s.lon, s.lat);
            // Skip duplicate locations (they make the interpolation matrices singular)
            if (pts.some(p => Math.hypot(p.x - x, p.y - y) < 1)) { excluded.push(`${s.city} (same location as another station)`); return; }
            pts.push({ id: s.id, name: label, lat: s.lat, lon: s.lon, x, y, v: sm.value, coverage, inside: pointInGeom(s.lon, s.lat, g) });
        });
        if (pts.length < 3) {
            return setStatus(`At least 3 stations with enough data are needed (found ${pts.length}).`
                + (source === 'ncm' ? ' NCM observations in the NOAA archive currently end on ' + window.NCM_DATA_END + '.' : ''), true);
        }

        setStatus('Interpolating…');
        await new Promise(r => setTimeout(r, 30));   // let the status repaint

        const t0 = performance.now();
        const res = Number($('an-res').value);
        const G = buildGrid(g, res);
        if (G.totalArea <= 0) return setStatus('The boundary is too small for this grid size. Choose a finer grid.', true);

        const opts = {
            power: Number($('an-power').value) || 2,
            smoothing: Math.max(0, Number($('an-smooth').value) || 0),
            interval: Number($('an-interval').value) || 0,
            isoBase: $('an-isobase').value
        };
        let results;
        try {
            results = runMethods(pts, G, opts, v);
        } catch (e) {
            return setStatus('Calculation failed: ' + e.message, true);
        }

        lastRun = { G, pts, results, v, key, from, until, source, excluded, flagged, minCoverage, method: $('an-method').value };
        render(lastRun);
        renderTables(lastRun);
        setStatus(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s · ${pts.length} stations · grid ${G.nx}×${G.ny} cells.`);
    }

    function downloadCsv() {
        if (!lastRun) return;
        const { pts, results, v, from, until } = lastRun;
        const srcNote = window.DATA_SOURCES[lastRun.source].provider;
        const lines = [`# ${v.label} (${v.unit}), ${from} to ${until}; source: ${srcNote}`, 'method,areal_value,details'];
        Object.entries(METHODS).forEach(([k, name]) =>
            lines.push(`${name},${results[k]?.value ?? ''},"${(results[k]?.note || '').replace(/"/g, "'")}"`));
        lines.push('', 'station,lat,lon,inside_boundary,value,thiessen_area_km2,thiessen_weight');
        pts.forEach(p => {
            const w = results.thiessen.weights.find(r => r.name === p.name);
            lines.push(`${p.name},${p.lat},${p.lon},${p.inside},${p.v},${w ? w.area.toFixed(1) : 0},${w ? w.w.toFixed(4) : 0}`);
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `areal_${lastRun.key}_${from}_${until}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ---------------- Custom boundary drawing ----------------
    let drawing = false, drawPts = [], drawLine = null;

    function startDrawing() {
        drawing = true; drawPts = [];
        map.doubleClickZoom.disable();
        map.getContainer().classList.add('drawing');
        $('an-finish').disabled = false;
        setStatus('Click on the map to add corners of your boundary, then press "Finish".');
    }

    function finishDrawing() {
        drawing = false;
        map.doubleClickZoom.enable();
        map.getContainer().classList.remove('drawing');
        $('an-finish').disabled = true;
        if (drawLine) { map.removeLayer(drawLine); drawLine = null; }
        if (drawPts.length < 3) return setStatus('A boundary needs at least 3 points.', true);
        customGeom = { type: 'Polygon', coordinates: [[...drawPts, drawPts[0]]] };
        $('an-boundary').value = 'custom';
        drawBoundary();
        setStatus('Custom boundary set. Press "Run analysis".');
    }

    map.on('click', e => {
        if (!drawing) return;
        drawPts.push([e.latlng.lng, e.latlng.lat]);
        const ll = drawPts.map(([x, y]) => [y, x]);
        if (drawLine) drawLine.setLatLngs(ll);
        else drawLine = L.polyline(ll, { color: '#ff6b6b', weight: 2, dashArray: '4,4' }).addTo(map);
    });

    // ---------------- UI wiring ----------------
    function init() {
        // Default to the latest 12 months that have NCM observations
        const until = window.NCM_DATA_END < DU.archiveMaxDate() ? window.NCM_DATA_END : DU.archiveMaxDate();
        $('an-from').value = DU.shiftDate(until, -364);
        $('an-until').value = until;
        $('an-from').min = $('an-until').min = DU.ARCHIVE_MIN;
        $('an-from').max = $('an-until').max = DU.shiftDate(DU.isoDate(new Date()), 15);

        // Data sources from the registry (sources.js)
        $('an-source').innerHTML = Object.entries(window.DATA_SOURCES)
            .map(([k, x]) => `<option value="${k}" title="${x.provider}">${x.name}${x.kind === 'forecast' ? ' (forecast)' : ''}</option>`).join('');
        $('an-source').value = 'ncm';
        $('an-source').addEventListener('change', () => {
            // Move the period into the new source's coverage if needed
            const k = $('an-source').value, r = window.DATA_SOURCES[k].range();
            if (window.sourceRangeError(k, $('an-from').value, $('an-until').value)) {
                if (window.DATA_SOURCES[k].kind === 'forecast') {
                    const t = DU.isoDate(new Date());
                    $('an-from').value = t; $('an-until').value = r.max;
                } else {
                    const end = (k === 'ncm' && window.NCM_DATA_END < r.max) ? window.NCM_DATA_END : r.max;
                    $('an-until').value = end; $('an-from').value = DU.shiftDate(end, -29);
                }
                setStatus(`Period changed to ${$('an-from').value} → ${$('an-until').value} (${window.DATA_SOURCES[k].name} covers ${r.min} to ${r.max}).`);
            }
        });

        // Directions cannot be interpolated as plain numbers, so they are left out here
        $('an-variable').innerHTML = Object.entries(VARS).filter(([, v]) => !v.noAreal)
            .map(([k, v]) => `<option value="${k}">${v.label} (${v.unit})</option>`).join('');
        $('an-method').innerHTML = Object.entries(METHODS)
            .map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
        $('an-method').value = 'thiessen';

        $('btn-analysis').addEventListener('click', () => $('analysis-panel').classList.toggle('hidden'));
        $('an-close').addEventListener('click', () => $('analysis-panel').classList.add('hidden'));
        $('an-run').addEventListener('click', runAnalysis);
        $('an-method').addEventListener('change', showMethod);
        $('an-boundary').addEventListener('change', () => {
            if ($('an-boundary').value === 'custom' && !customGeom) startDrawing();
            drawBoundary();
        });
        $('an-draw').addEventListener('click', startDrawing);
        $('an-finish').addEventListener('click', finishDrawing);
        $('an-clear').addEventListener('click', () => {
            resultLayer.clearLayers();
            window.MapKey.remove('analysis');
            $('an-results').innerHTML = '';
            $('an-legend').innerHTML = '';
            lastRun = null;
            setStatus('Cleared.');
        });
        $('an-csv').addEventListener('click', downloadCsv);

        // Keep the analysis panel from passing clicks / scrolls to the map
        L.DomEvent.disableClickPropagation($('analysis-panel'));
        L.DomEvent.disableScrollPropagation($('analysis-panel'));

        loadNationalBoundary();
    }

    init();
})();
