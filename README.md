# Archive

A quiet, monochrome inbox for links. Save something now, mark where you actually put it later.

- **대기 중 / 완료 folders** — an item waits in the inbox until you press **저장 완료** and choose where you saved it (네이버 지도, 유튜브, 인스타그램, 구매/장바구니, 메모/노션, or 직접 입력). The card then shows `✓ 네이버 지도 저장됨` with the time and moves to 완료, where it can be returned to the inbox or deleted.
- **Cards** carry the site badge (YouTube, Instagram, Threads, Naver …), title, domain, note, tags and an optional photo, with 열기 / 삭제 actions.
- **Share links** — opening `?add=<text or URL>` or `?url=…&title=…&text=…` opens the add sheet with the link pulled out of the share text (a link buried in an Instagram or YouTube share blurb is found too). `?v=`/`?add=` parameters are cleared from the address bar after use.
- **One-tap paste** — **링크 붙여넣기** reads the clipboard; pasting anywhere while the sheet is open fills the URL field.
- **Backup** — `···` → JSON 백업 / 백업 가져오기, plus 완료 폴더 비우기.
- **GitHub sync** — `···` → **GitHub 동기화** takes a fine-grained or classic token (repo `Contents: Read and write` on the private repo `jozy0501-coder/Test-`) and keeps `archive-data.json` on its `main` branch in step with the device. The token stays in this browser's localStorage, never in the URL. Items merge by id on `updatedAt` (newest wins) and removals travel as tombstones, so an item deleted on one device does not come back from the other. Sync runs on load, on returning to the app, and right after every add / edit / 저장 완료 / delete / 완료 폴더 비우기. The header pill shows `동기화됨` or `로컬 전용`; tap it to open the settings sheet.
- **PWA** — installable, offline shell, data in IndexedDB on the device, plus the private repo when sync is on.

## Files

```
index.html            app shell
assets/css/style.css  monochrome styles
assets/js/app.js      all app logic (no dependencies)
manifest.json         PWA manifest
sw.js                 service worker (cache: my-archive-v2-2)
preview.html          phone-frame preview of the app
data/items.json       empty; the app no longer seeds data from it
```

## Run locally

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Served by GitHub Pages at <https://jozy0501-coder.github.io/yeji-archive/>.

## Add to Home Screen (iPhone)

1. Open the site in Safari.
2. Tap Share → **홈 화면에 추가**.
