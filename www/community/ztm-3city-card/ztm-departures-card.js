class ZtmDeparturesCard extends HTMLElement {
    // 1. Definicja edytora wizualnego
    static getConfigElement() {
        return document.createElement("ztm-departures-card-editor");
    }

    // 2. Domyślna konfiguracja po dodaniu karty
    static getStubConfig(hass) {
        // Znajdź pierwszy sensor ZTM (alfabetycznie)
        const ztmSensors = Object.keys(hass.states)
            .filter(entityId => entityId.startsWith('sensor.autobusy_'))
            .sort();
        
        const defaultEntity = ztmSensors.length > 0 ? ztmSensors[0] : "";
        
        // Wyciągnij nazwę przystanku z friendly_name lub entity_id
        let defaultTitle = "Odjazdy";
        if (defaultEntity && hass.states[defaultEntity]) {
            const friendlyName = hass.states[defaultEntity].attributes.friendly_name || "";
            // Usuń prefix "Autobusy " z nazwy
            const stopName = friendlyName.replace(/^Autobusy\s+/i, "");
            defaultTitle = stopName ? `Odjazdy ${stopName}` : "Odjazdy";
        }
        
        return {
            entity: defaultEntity,
            title: defaultTitle,
            limit: 10,
            blink_now: true,
            red_threshold: 6
        };
    }

    set hass(hass) {
        this._hass = hass;
        const entityId = this.config.entity;
        const state = hass.states[entityId];

        if (!state) {
            this.innerHTML = `
                <ha-card class="error">
                    <div style="padding: 20px; color: red;">
                        Encja <b>${entityId || '?'}</b> niedostępna.
                        <br><small>Edytuj kartę i wybierz sensor.</small>
                    </div>
                </ha-card>`;
            return;
        }

        if (this._lastStateStr === JSON.stringify(state.attributes)) {
            return; 
        }
        this._lastStateStr = JSON.stringify(state.attributes);
        this.departures = state.attributes.wszystkie_odjazdy || [];

        if (!this.selectedLines) {
            this.selectedLines = new Set();
        }

        if (!this.content) {
            this.renderBase();
        }

        this.updateFilters();
        this.updateTable();
    }

    setConfig(config) {
        if (!config.entity) {
            console.warn("ZTM Card: Brak encji");
        }
        this.config = config;
        this.selectedLines = new Set(); 
    }

    // Funkcja określająca typ pojazdu na podstawie numeru linii
    getVehicleType(lineNumber) {
        const tramLines = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];
        const nightTrams = ['N1', 'N3', 'N4', 'N5', 'N6', 'N8', 'N9', 'N11', 'N12', 'N13', 'N14', 'N15'];
        
        if (tramLines.includes(lineNumber) || nightTrams.includes(lineNumber)) {
            return 'tram';
        }
        return 'bus';
    }

    // Funkcja zwracająca ikonkę SVG
    getVehicleIcon(type) {
        if (type === 'tram') {
            return `<svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                <path d="M12,3C8.5,3 5.6,3.1 4,4.3V5H20V4.3C18.4,3.1 15.5,3 12,3M4,6V15.5C4,17.4 5.6,19 7.5,19L6,20.5V21H7L9,19H15L17,21H18V20.5L16.5,19C18.4,19 20,17.4 20,15.5V6H4M7.5,17C6.7,17 6,16.3 6,15.5C6,14.7 6.7,14 7.5,14C8.3,14 9,14.7 9,15.5C9,16.3 8.3,17 7.5,17M11,10H6V7H11V10M13,10V7H18V10H13M16.5,17C15.7,17 15,16.3 15,15.5C15,14.7 15.7,14 16.5,14C17.3,14 18,14.7 18,15.5C18,16.3 17.3,17 16.5,17M12,2L15,0H9L12,2Z" />
            </svg>`;
        } else {
            return `<svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                <path d="M18,11H6V6H18M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M4,16C4,16.88 4.39,17.67 5,18.22V20A1,1 0 0,0 6,21H7A1,1 0 0,0 8,20V19H16V20A1,1 0 0,0 17,21H18A1,1 0 0,0 19,20V18.22C19.61,17.67 20,16.88 20,16V6C20,2.5 16.42,2 12,2C7.58,2 4,2.5 4,6V16Z" />
            </svg>`;
        }
    }

    renderBase() {
        const blinkNow = this.config.blink_now !== false; // Domyślnie true
        const blinkAnimation = blinkNow ? 'blink 1s ease-in-out infinite' : 'none';

        this.innerHTML = `
            <ha-card>
                <div class="card-header">
                    <div class="name">${this.config.title || 'Odjazdy'}</div>
                </div>
                <div id="filter-container" class="filter-container"></div>
                <div id="departures-container" class="departures-container"></div>
            </ha-card>
            <style>
                ha-card { padding-bottom: 10px; }
                .card-header { padding: 16px; font-size: 18px; font-weight: bold; }
                .filter-container { 
                    padding: 0 16px 10px 16px; 
                    display: flex; 
                    gap: 8px; 
                    flex-wrap: wrap; 
                }
                .filter-btn {
                    background: var(--secondary-background-color);
                    border: 1px solid var(--divider-color);
                    border-radius: 16px;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.2s;
                    color: var(--primary-text-color);
                    user-select: none;
                }
                .filter-btn:hover {
                    background: var(--secondary-text-color);
                    color: white;
                }
                .filter-btn.active {
                    background: var(--primary-color);
                    color: var(--text-primary-color, white);
                    border-color: var(--primary-color);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .departures-container { padding: 0; }
                .row {
                    display: flex;
                    align-items: center;
                    padding: 8px 16px;
                    border-bottom: 1px solid var(--divider-color);
                }
                .row:last-child { border-bottom: none; }
                .line-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-right: 12px;
                }
                .line-badge {
                    background: var(--primary-color);
                    color: white;
                    font-weight: bold;
                    border-radius: 4px;
                    min-width: 36px;
                    text-align: center;
                    padding: 4px 0;
                    font-size: 14px;
                }
                .vehicle-icon {
                    display: flex;
                    align-items: center;
                    opacity: 0.8;
                }
                .direction { flex: 1; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .time { font-weight: bold; font-size: 15px; text-align: right; min-width: 70px; }
                .time-now { 
                    color: var(--error-color, #db4437);
                    animation: ${blinkAnimation};
                }
                .time-soon { color: var(--error-color, #db4437); }
                .time-future { color: var(--success-color, #43a047); }
                .no-data { padding: 20px; text-align: center; opacity: 0.6; }
                
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            </style>
        `;
        this.content = this.querySelector('#departures-container');
        this.filters = this.querySelector('#filter-container');

        this.filters.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;
            const filter = btn.getAttribute('data-filter');
            this.toggleFilter(filter);
        });
    }

    updateFilters() {
        const lines = [...new Set(this.departures.map(d => d.linia))].sort();
        const isAllActive = this.selectedLines.size === 0;

        let html = `<button class="filter-btn ${isAllActive ? 'active' : ''}" data-filter="all">Wszystkie</button>`;
        
        lines.forEach(line => {
            const isActive = this.selectedLines.has(line) ? 'active' : '';
            html += `<button class="filter-btn ${isActive}" data-filter="${line}">${line}</button>`;
        });

        this.filters.innerHTML = html;
    }

    toggleFilter(line) {
        if (line === 'all') {
            this.selectedLines.clear();
        } else {
            if (this.selectedLines.has(line)) {
                this.selectedLines.delete(line);
            } else {
                this.selectedLines.add(line);
            }
        }
        this.updateFilters();
        this.updateTable();
    }

    updateTable() {
        if (!this.content) return;

        const filtered = this.selectedLines.size === 0 
            ? this.departures 
            : this.departures.filter(d => this.selectedLines.has(d.linia));

        const limit = this.config.limit || 10;
        const limited = filtered.slice(0, limit);

        if (limited.length === 0) {
            const selectedText = Array.from(this.selectedLines).join(", ");
            this.content.innerHTML = `<div class="no-data">Brak odjazdów${selectedText ? ' dla: ' + selectedText : ''}</div>`;
            return;
        }

        const redThreshold = this.config.red_threshold !== undefined ? this.config.red_threshold : 6;

        this.content.innerHTML = limited.map(kurs => {
            const vehicleType = this.getVehicleType(kurs.linia);
            const vehicleIcon = this.getVehicleIcon(vehicleType);
            
            let timeClass = 'time-future';
            if (kurs.czas === 'Teraz') {
                timeClass = 'time-now';
            } else if (redThreshold > 0 && kurs.minuty !== undefined && kurs.minuty < redThreshold) {
                timeClass = 'time-soon';
            }
            
            return `
                <div class="row">
                    <div class="line-info">
                        <div class="line-badge">${kurs.linia}</div>
                        <div class="vehicle-icon">${vehicleIcon}</div>
                    </div>
                    <div class="direction">${kurs.kierunek}</div>
                    <div class="time ${timeClass}">${kurs.czas}</div>
                </div>
            `;
        }).join('');
    }

    getCardSize() {
        return 3;
    }
}

// ==========================================================
// EDYTOR WIZUALNY (UI)
// ==========================================================
class ZtmDeparturesCardEditor extends HTMLElement {
    setConfig(config) {
        this._config = config;
        this.render();
    }

    set hass(hass) {
        this._hass = hass;
        const entityPicker = this.querySelector("ha-entity-picker");
        if (entityPicker) {
            entityPicker.hass = hass;
        }
        
        // Automatycznie ustaw tytuł przy zmianie sensora (jeśli pole tytułu jest puste)
        if (this._config && this._config.entity && !this._titleManuallySet) {
            this._updateTitleFromEntity(this._config.entity);
        }
    }

    render() {
        if (!this.innerHTML) {
            this.innerHTML = `
                <div class="card-config">
                    <div class="option">
                        <ha-entity-picker
                            label="Wybierz sensor (ZTM)"
                            domain-filter="sensor"
                            class="entity-picker"
                        ></ha-entity-picker>
                    </div>
                    <div class="option">
                        <label class="label">Tytuł karty</label>
                        <input type="text" class="input-text" id="title-input" placeholder="np. Odjazdy Wołkowyska 01">
                    </div>
                    <div class="option">
                        <label class="label">Ilość wierszy (Limit)</label>
                        <input type="number" class="input-number" id="limit-input" min="1" max="50">
                    </div>
                    <div class="option">
                        <label class="label">
                            <input type="checkbox" id="blink-input" style="margin-right: 8px;">
                            Miganie dla "Teraz"
                        </label>
                    </div>
                    <div class="option">
                        <label class="label">Próg czerwonej czcionki (min, 0=wyłączone)</label>
                        <input type="number" class="input-number" id="red-threshold-input" min="0" max="60">
                    </div>
                </div>
                <style>
                    .card-config { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
                    .option { display: flex; flex-direction: column; gap: 5px; }
                    .label { font-size: 14px; font-weight: 500; color: var(--secondary-text-color); }
                    .input-text, .input-number {
                        padding: 8px;
                        border: 1px solid var(--divider-color);
                        border-radius: 4px;
                        background: var(--card-background-color);
                        color: var(--primary-text-color);
                        font-size: 14px;
                    }
                    ha-entity-picker { display: block; }
                </style>
            `;

            this.querySelector("ha-entity-picker").addEventListener("value-changed", this._entityChanged.bind(this));
            this.querySelector("#title-input").addEventListener("change", this._valueChanged.bind(this, "title"));
            this.querySelector("#title-input").addEventListener("input", () => { this._titleManuallySet = true; });
            this.querySelector("#limit-input").addEventListener("change", this._valueChanged.bind(this, "limit"));
            this.querySelector("#blink-input").addEventListener("change", this._valueChanged.bind(this, "blink_now"));
            this.querySelector("#red-threshold-input").addEventListener("change", this._valueChanged.bind(this, "red_threshold"));
        }

        const entityPicker = this.querySelector("ha-entity-picker");
        if (entityPicker) {
            entityPicker.hass = this._hass;
            entityPicker.value = this._config.entity || "";
        }
        
        this.querySelector("#title-input").value = this._config.title || "";
        this.querySelector("#limit-input").value = this._config.limit !== undefined ? this._config.limit : 10;
        this.querySelector("#blink-input").checked = this._config.blink_now !== false;
        this.querySelector("#red-threshold-input").value = this._config.red_threshold !== undefined ? this._config.red_threshold : 6;
    }

    _entityChanged(ev) {
        if (!this._config || !this._hass) return;
        
        const newEntity = ev.detail.value;
        if (this._config.entity === newEntity) return;

        // Automatycznie zaktualizuj tytuł tylko jeśli użytkownik go ręcznie nie zmienił
        if (!this._titleManuallySet) {
            this._updateTitleFromEntity(newEntity);
        }

        const newConfig = {
            ...this._config,
            entity: newEntity,
        };

        this._dispatchConfigChanged(newConfig);
    }

    _updateTitleFromEntity(entityId) {
        if (!this._hass || !entityId) return;
        
        const state = this._hass.states[entityId];
        if (state) {
            const friendlyName = state.attributes.friendly_name || "";
            const stopName = friendlyName.replace(/^Autobusy\s+/i, "");
            const newTitle = stopName ? `Odjazdy ${stopName}` : "Odjazdy";
            
            this.querySelector("#title-input").value = newTitle;
            
            const newConfig = {
                ...this._config,
                title: newTitle,
            };
            this._dispatchConfigChanged(newConfig);
        }
    }

    _valueChanged(key, ev) {
        if (!this._config || !this._hass) return;

        const target = ev.target;
        let newValue = target.value;
        
        if (key === "limit" || key === "red_threshold") {
            newValue = parseInt(newValue);
        } else if (key === "blink_now") {
            newValue = target.checked;
        }

        if (this._config[key] === newValue) return;

        const newConfig = {
            ...this._config,
            [key]: newValue,
        };

        this._dispatchConfigChanged(newConfig);
    }

    _dispatchConfigChanged(newConfig) {
        this._config = newConfig;
        const event = new CustomEvent("config-changed", {
            detail: { config: newConfig },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }
}

customElements.define('ztm-departures-card-editor', ZtmDeparturesCardEditor);
customElements.define('ztm-departures-card', ZtmDeparturesCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "ztm-departures-card",
    name: "ZTM Trójmiasto",
    description: "Karta odjazdów na żywo (Gdańsk/Gdynia/Sopot)",
    preview: true
});