# My Archive

A small, offline-first scrapbook of places, things and links — built as a mobile-first web app for iPhone Safari (add to Home Screen).

- **Search** across titles, notes, tags and your own memos
- **Filters** by category (카페 · 맛집 · 아이템 · 링크·계정 · 여행·숙소 · 볼거리) and by where a record came from (favorites, shared, found together, added by me)
- **Detail sheet** with the full note, tags, a link out to the map or shop, a favorite toggle and a private memo
- **Add your own** records with a photo (resized in the browser) — stored on the device in IndexedDB
- **JSON backup** export / import so a phone change doesn't lose anything
- **PWA**: installable, offline shell, app icon and manifest

## How it works

`data/items.json` holds the seed collection. Favorites, memos and records you add live only in your browser (IndexedDB + localStorage) — nothing is sent anywhere.

```
index.html          app shell
assets/css/style.css
assets/js/app.js    all app logic (no dependencies)
assets/images/      58 photos, resized to max 1000px wide
data/items.json     seed records
manifest.json       PWA manifest
sw.js               service worker (offline shell)
```

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Served by GitHub Pages at <https://jozy0501-coder.github.io/yeji-archive/>.

## Add to Home Screen (iPhone)

1. Open the site in Safari.
2. Tap the Share button.
3. Choose **홈 화면에 추가**.
