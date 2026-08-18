# Weather System API

Configure and preview weather effects through the Bridge API. Cloe Desktop periodically fetches real weather data and renders a matching weather animation behind the character (rain, snow, thunderstorm, fog, etc.).

## Data Model

### Config (`/weather/config`)

```json
{
  "enabled": false,
  "showWeather": true,
  "provider": "open-meteo",
  "apiKey": "",
  "city": "auto",
  "intervalMin": 30
}
```

| Field | Type | Description |
|------|------|------|
| `enabled` | bool | whether weather fetching is on (master switch) |
| `showWeather` | bool | weather canvas visibility (independent of `enabled`, can be hidden separately) |
| `provider` | string | `'open-meteo'` (no key needed) or `'qweather'` (QWeather, requires apiKey) |
| `apiKey` | string | QWeather API key (only needed when provider=qweather) |
| `city` | string | city name; `'auto'` detects it from the system timezone |
| `intervalMin` | number | fetch interval in minutes, minimum 5 |

### Weather Data (returned by `/weather/now`, `/weather/test`, `/weather/inject`)

```json
{
  "weather": {
    "provider": "open-meteo",
    "city": "Shanghai",
    "weatherCode": 61,
    "weatherType": "rain",
    "text": "Rain",
    "temp": 20,
    "feelsLike": 19,
    "humidity": 85,
    "windSpeed": 10,
    "windDir": 90,
    "windGusts": 20,
    "visibility": 5000,
    "cloudCover": 80,
    "precipitation": 5,
    "rain": 5,
    "snowfall": 0,
    "isDay": true
  }
}
```

### weatherType Values

| weatherType | Meaning |
|-------------|------|
| `clear` | clear |
| `cloudy` | cloudy |
| `rain` | rain |
| `snow` | snow |
| `fog` | fog |
| `thunderstorm` | thunderstorm |
| `sandstorm` | sandstorm (open-meteo, requires low visibility + high wind) |
| `icy` | icy (low-temperature scenario) |

## API Endpoints

### Read Config

```bash
curl -s http://localhost:19851/weather/config
```

### Update Config

Automatically restarts polling after updating, and broadcasts `weather-config-changed` to all clients.

```bash
# Enable weather + use open-meteo (no key needed) + auto city
curl -s -X POST http://localhost:19851/weather/config -H 'Content-Type: application/json' \
  -d '{"enabled":true,"provider":"open-meteo","city":"auto","intervalMin":30}'

# Switch to QWeather (requires your own key)
curl -s -X POST http://localhost:19851/weather/config -H 'Content-Type: application/json' \
  -d '{"provider":"qweather","apiKey":"YOUR_KEY","city":"Beijing"}'

# Just hide the weather canvas (keep fetching in the background)
curl -s -X POST http://localhost:19851/weather/config -H 'Content-Type: application/json' \
  -d '{"showWeather":false}'
```

### Toggle On/Off

Quickly flips `enabled` (equivalent to changing `enabled` via config).

```bash
curl -s -X POST http://localhost:19851/weather/toggle
```

### Read Current Weather

Returns the most recently cached weather data (does not trigger a new request).

```bash
curl -s http://localhost:19851/weather/now
```

### Force Refetch

Immediately triggers a fetch and returns the latest weather (useful for verifying after configuring an apiKey).

```bash
curl -s -X POST http://localhost:19851/weather/test
```

## Weather Preview (for development/debugging)

`/weather/preview` temporarily displays a given weather type; it **does not automatically revert** -- call `/weather/preview-end` manually to end it. Handy for previewing rain effects when it isn't actually raining.

### Preview a Specific Weather Type

```bash
# Preview rain
curl -s -X POST http://localhost:19851/weather/preview -H 'Content-Type: application/json' \
  -d '{"weatherType":"rain"}'

# Preview nighttime snow
curl -s -X POST http://localhost:19851/weather/preview -H 'Content-Type: application/json' \
  -d '{"weatherType":"snow","isNight":true}'

# Preview a thunderstorm + special effect (e.g. lightning specialType)
curl -s -X POST http://localhost:19851/weather/preview -H 'Content-Type: application/json' \
  -d '{"weatherType":"thunderstorm","specialType":"lightning","isNight":false}'

# Specify an hour (affects the lighting angle)
curl -s -X POST http://localhost:19851/weather/preview -H 'Content-Type: application/json' \
  -d '{"weatherType":"clear","previewHour":18}'
```

| Parameter | Type | Description |
|------|------|------|
| `weatherType` | string | see the value table above |
| `specialType` | string\|null | special effect (e.g. lightning); pass null to clear |
| `isNight` | bool | whether it's a night scene (affects the temperature template and lighting) |
| `previewHour` | number\|null | hour (0-23), affects the lighting angle |

### End the Preview

Clears any special effect and restores the real weather.

```bash
curl -s -X POST http://localhost:19851/weather/preview-end
```

## Injecting Fake Weather (for testing)

`/weather/inject` directly injects a fake weather object and broadcasts it, bypassing the fetch. Supports day/night variants (`clear`, `clear-night`, `rain-night`, etc.). Mainly used for automated testing.

```bash
curl -s -X POST http://localhost:19851/weather/inject -H 'Content-Type: application/json' \
  -d '{"weatherType":"snow"}'
```

## Notes

- `open-meteo` is completely free and requires no registration; `qweather` requires applying for a key at [dev.qweather.com](https://dev.qweather.com)
- When `city: 'auto'`, the city name is inferred from the system timezone (e.g. `Asia/Shanghai` -> Shanghai), and open-meteo's geocoding endpoint resolves the coordinates
- Weather config is persisted under the `weather` field of `~/.cloe/config.json`, and automatically restored and polling resumed after an app restart
- `intervalMin` has a minimum of 5 (values below 5 are forced up to 5) to avoid overly frequent requests
- Clients receive `weather-update` (weather changed), `weather-config-changed` (config changed), and `weather-special-preview` (special effect) messages via WebSocket
