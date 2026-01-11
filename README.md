TEST10
# ZTM 3City Departures Card

Niestandardowa karta Lovelace dla Home Assistant, zaprojektowana do wyświetlania odjazdów ZTM Gdańsk, Gdynia i Sopot w czytelnej formie tablicy przystankowej.

## 📋 Wymagania
Karta wymaga zainstalowanej integracji backendowej:
👉 [ZTM 3City Integration](https://github.com/jakubex12/ztm-3city)

## 🚀 Instalacja
### Przez HACS
1. Otwórz **HACS** -> **Frontend**.
2. Kliknij trzy kropki w prawym górnym rogu i wybierz **Niestandardowe repozytoria**.\
3. Wklej link: `https://github.com/jakubex12/ztm-3city-card`
4. Wybierz kategorię **Dashboard**.
5. Kliknij **Pobierz**.
6. Po instalacji odśwież interfejs Home Assistant.

## ⚙️ Konfiguracja
Kartę możesz dodać przez edytor wizualny lub ręcznie w YAML:

```yaml
type: custom:ztm-departures-card
entity: sensor.autobusy_wolkowyska_01
title: Odjazdy Wołkowyska [01]
show_num_departures: 5
