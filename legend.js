// ============================================================
// Map key: one panel in the bottom-right corner of the map with a key
// (colour gradient bar + values) for every layer that is switched on.
//
// Other scripts call:
//   MapKey.set(id, { title, sub, colors | gradient, labels, unit, swatches, note })
//   MapKey.remove(id)
// colors   : list of CSS colours for a gradient bar (left = low)
// gradient : a ready CSS gradient instead of colors
// labels   : values written under the bar, spread evenly (first = left end)
// swatches : [{ color, label }] for categories instead of a bar
// ============================================================

(function () {
    'use strict';

    const entries = new Map();   // id -> entry, in the order layers were switched on
    let box = null, list = null, collapsed = false;

    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function bar(e) {
        const bg = e.gradient || `linear-gradient(to right, ${e.colors.join(', ')})`;
        const labels = (e.labels || []).map(l => `<span>${esc(l)}</span>`).join('');
        return `<div class="mk-bar" style="background:${bg}"></div>
                <div class="mk-ticks">${labels}</div>`;
    }

    function swatches(e) {
        return `<div class="mk-swatches">${e.swatches.map(s =>
            `<span class="mk-sw"><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`;
    }

    function render() {
        if (!box) return;
        box.hidden = entries.size === 0;
        box.querySelector('.mk-count').textContent = entries.size ? `(${entries.size})` : '';
        list.innerHTML = [...entries.values()].reverse().map(e => `
            <div class="mk-item">
                <div class="mk-title">${esc(e.title)}${e.unit ? ` <span class="mk-unit">${esc(e.unit)}</span>` : ''}</div>
                ${e.sub ? `<div class="mk-sub">${esc(e.sub)}</div>` : ''}
                ${e.swatches ? swatches(e) : (e.colors || e.gradient) ? bar(e) : ''}
                ${e.note ? `<div class="mk-sub">${esc(e.note)}</div>` : ''}
            </div>`).join('');
    }

    function attach(map) {
        const Control = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd() {
                box = L.DomUtil.create('div', 'map-key');
                box.innerHTML = `
                    <button type="button" class="mk-head" id="map-key-toggle" aria-expanded="true">
                        <span>Map key <span class="mk-count"></span></span><span class="mk-chev">▾</span>
                    </button>
                    <div class="mk-list"></div>`;
                list = box.querySelector('.mk-list');
                box.querySelector('.mk-head').addEventListener('click', () => {
                    collapsed = !collapsed;
                    box.classList.toggle('collapsed', collapsed);
                    box.querySelector('.mk-head').setAttribute('aria-expanded', String(!collapsed));
                });
                // Start folded on phones so the key does not cover the map
                if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) {
                    collapsed = true;
                    box.classList.add('collapsed');
                }
                L.DomEvent.disableClickPropagation(box);
                L.DomEvent.disableScrollPropagation(box);
                return box;
            }
        });
        new Control().addTo(map);
        render();
    }

    window.MapKey = {
        attach,
        set(id, entry) { entries.delete(id); entries.set(id, entry); render(); },
        remove(id) { if (entries.delete(id)) render(); },
        has: id => entries.has(id),
    };
})();
