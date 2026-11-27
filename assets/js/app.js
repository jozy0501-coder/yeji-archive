/* Archive — a minimal link inbox: capture, mark where it was saved, clear it out. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * constants
   * ------------------------------------------------------------------ */

  var DB_NAME = 'yejiArchive';
  var DB_VER = 1;
  var STORE = 'items';
  var LS_KEY = 'yejiArchive:v2:items';

  var SAVE_TARGETS = [
    { key: 'naver-map', label: '네이버 지도', mark: 'N' },
    { key: 'youtube', label: '유튜브', mark: 'Y' },
    { key: 'instagram', label: '인스타그램', mark: 'I' },
    { key: 'cart', label: '구매/장바구니', mark: '장' },
    { key: 'memo', label: '메모/노션', mark: 'M' },
    { key: 'custom', label: '직접 입력', mark: '+' }
  ];

  var HOST_RULES = [
    { re: /(^|\.)youtube\.com$/, label: 'YouTube', mark: 'Y' },
    { re: /^youtu\.be$/, label: 'YouTube', mark: 'Y' },
    { re: /(^|\.)instagram\.com$/, label: 'Instagram', mark: 'I' },
    { re: /(^|\.)threads\.(net|com)$/, label: 'Threads', mark: 'T' },
    { re: /^(map|m\.map)\.naver\.com$/, label: '네이버 지도', mark: 'N' },
    { re: /^naver\.me$/, label: '네이버 지도', mark: 'N' },
    { re: /^(smartstore|brand|shopping)\.naver\.com$/, label: '네이버 쇼핑', mark: 'N' },
    { re: /^blog\.naver\.com$/, label: '네이버 블로그', mark: 'N' },
    { re: /(^|\.)naver\.com$/, label: '네이버', mark: 'N' },
    { re: /^map\.kakao\.com$/, label: '카카오맵', mark: 'K' },
    { re: /(^|\.)tiktok\.com$/, label: 'TikTok', mark: 'T' },
    { re: /(^|\.)(x|twitter)\.com$/, label: 'X', mark: 'X' },
    { re: /(^|\.)facebook\.com$/, label: 'Facebook', mark: 'F' },
    { re: /(^|\.)pinterest\.[a-z.]+$/, label: 'Pinterest', mark: 'P' },
    { re: /(^|\.)musinsa\.com$/, label: '무신사', mark: 'M' },
    { re: /(^|\.)29cm\.co\.kr$/, label: '29CM', mark: '2' },
    { re: /(^|\.)kurly\.com$/, label: '컬리', mark: 'K' },
    { re: /(^|\.)coupang\.com$/, label: '쿠팡', mark: 'C' },
    { re: /(^|\.)zigzag\.kr$/, label: '지그재그', mark: 'Z' },
    { re: /(^|\.)oliveyoung\.co\.kr$/, label: '올리브영', mark: 'O' },
    { re: /(^|\.)notion\.(so|site)$/, label: 'Notion', mark: 'N' },
    { re: /^(maps\.google\.com|goo\.gl)$/, label: '구글 지도', mark: 'G' },
    { re: /^maps\.apple\.com$/, label: '애플 지도', mark: 'A' },
    { re: /(^|\.)brunch\.co\.kr$/, label: '브런치', mark: 'B' },
    { re: /(^|\.)yogiyo\.co\.kr$/, label: '요기요', mark: 'Y' },
    { re: /(^|\.)baemin\.com$/, label: '배달의민족', mark: 'B' }
  ];

  var TITLE_HINTS = {
    'YouTube': 'YouTube 영상',
    'Instagram': 'Instagram 게시물',
    'Threads': 'Threads 글',
    'TikTok': 'TikTok 영상',
    'X': 'X 게시물',
    'Facebook': 'Facebook 게시물',
    'Pinterest': 'Pinterest 핀',
    '네이버 지도': '네이버 지도 장소',
    '네이버 쇼핑': '네이버 쇼핑 상품',
    '네이버 블로그': '네이버 블로그 글',
    '네이버': '네이버 링크',
    '카카오맵': '카카오맵 장소',
    '구글 지도': '구글 지도 장소',
    '애플 지도': '애플 지도 장소',
    'Notion': 'Notion 페이지',
    '무신사': '무신사 상품',
    '29CM': '29CM 상품',
    '컬리': '컬리 상품',
    '쿠팡': '쿠팡 상품',
    '지그재그': '지그재그 상품',
    '올리브영': '올리브영 상품',
    '브런치': '브런치 글',
    '요기요': '요기요 가게',
    '배달의민족': '배달의민족 가게'
  };

  var ICONS = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/></svg>',
    open: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14.5V20H4V6h5.5"/></svg>'
  };

  /* ------------------------------------------------------------------ *
   * state
   * ------------------------------------------------------------------ */

  var items = [];
  var tab = 'inbox';
  var q = '';
  var db = null;
  var idbOk = false;
  var formId = null;
  var pendingPhoto = null;
  var photoTouched = false;
  var saveId = null;
  var currentSheet = null;
  var confirmRun = null;
  var toastTimer = null;
  var installEvent = null;

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------ *
   * small helpers
   * ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function uid() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function byId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }

  /* ------------------------------------------------------------------ *
   * urls
   * ------------------------------------------------------------------ */

  function safeUrl(url) {
    if (!url) return null;
    try {
      var u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (u.hostname.indexOf('.') < 0) return null;
      return u;
    } catch (e) { return null; }
  }

  function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    s = s.replace(/^[<("'\s]+/, '').replace(/[>"')\s]+$/, '');
    if (/^https?:\/\//i.test(s)) return safeUrl(s) ? s : '';
    if (/^\/\//.test(s)) { s = 'https:' + s; return safeUrl(s) ? s : ''; }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([\/?#].*)?$/i.test(s)) {
      s = 'https://' + s;
      return safeUrl(s) ? s : '';
    }
    return '';
  }

  function extractUrl(text) {
    if (!text) return '';
    var t = String(text);
    var m = t.match(/https?:\/\/[^\s<>"'`]+/i);
    if (m) return trimTail(m[0]);
    m = t.match(/(?:^|[\s(\[])((?:[a-z0-9-]+\.)+(?:com|net|org|co\.kr|kr|io|me|so|app|link|ly|be|to|gl|site|shop|store)(?:\/[^\s<>"'`]*)?)/i);
    if (m) return trimTail(normalizeUrl(m[1]));
    return '';
  }

  function trimTail(u) {
    return String(u).replace(/[.,;:!?)\]}>'"]+$/, '');
  }

  function detect(url) {
    var u = safeUrl(url);
    if (!u) return { label: '메모', mark: '·' };
    var host = u.hostname.toLowerCase();
    for (var i = 0; i < HOST_RULES.length; i++) {
      if (HOST_RULES[i].re.test(host)) return { label: HOST_RULES[i].label, mark: HOST_RULES[i].mark };
    }
    var bare = host.replace(/^www\./, '');
    return { label: bare, mark: bare.charAt(0).toUpperCase() };
  }

  function shortHost(url) {
    var u = safeUrl(url);
    return u ? u.hostname.replace(/^www\./, '') : '';
  }

  function autoTitle(url) {
    var u = safeUrl(url);
    if (!u) return '';
    var d = detect(url);
    var query = u.searchParams.get('query') || u.searchParams.get('q') || '';
    if (/naver\.com$|naver\.me$/.test(u.hostname) && /map/.test(u.hostname) && query) {
      return decodeURIComponent(query.replace(/\+/g, ' '));
    }
    if (TITLE_HINTS[d.label]) return TITLE_HINTS[d.label];
    var seg = u.pathname.split('/').filter(Boolean).pop() || '';
    if (seg && seg.length <= 40 && !/^\d+$/.test(seg)) {
      var clean = decodeURIComponent(seg).replace(/[-_+]+/g, ' ').trim();
      if (clean && clean.length <= 40) return clean;
    }
    return d.label;
  }

  function parseTags(raw) {
    return String(raw || '')
      .split(/[,#]/)
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t && t.length <= 24; })
      .slice(0, 8);
  }

  /* ------------------------------------------------------------------ *
   * storage
   * ------------------------------------------------------------------ */

  function openDB() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }

  function idbAll() {
    return new Promise(function (resolve) {
      if (!db) return resolve(null);
      try {
        var t = db.transaction(STORE, 'readonly');
        var r = t.objectStore(STORE).getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function idbPut(item) {
    return new Promise(function (resolve) {
      if (!db) return resolve(false);
      try {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(item);
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { resolve(false); };
        t.onabort = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function idbDel(id) {
    return new Promise(function (resolve) {
      if (!db) return resolve(false);
      try {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(id);
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { resolve(false); };
        t.onabort = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function lsAll() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function lsSet(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function persist(item) {
    if (!idbOk) { lsSet(items); return; }
    idbPut(item).then(function (ok) { if (!ok) { idbOk = false; lsSet(items); } });
  }

  function persistRemove(id) {
    if (!idbOk) { lsSet(items); return; }
    idbDel(id).then(function (ok) { if (!ok) { idbOk = false; lsSet(items); } });
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var url = normalizeUrl(raw.url || '');
    var title = String(raw.title || '').trim();
    if (!url && !title) return null;
    return {
      id: String(raw.id || uid()),
      url: url,
      title: title || autoTitle(url),
      note: String(raw.note || ''),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 8) : parseTags(raw.tags),
      photo: typeof raw.photo === 'string' ? raw.photo : '',
      status: raw.status === 'done' ? 'done' : 'inbox',
      savedTo: raw.savedTo && raw.savedTo.label ? { key: String(raw.savedTo.key || 'custom'), label: String(raw.savedTo.label) } : null,
      createdAt: raw.createdAt || new Date().toISOString(),
      completedAt: raw.completedAt || null,
      updatedAt: raw.updatedAt || null
    };
  }

  /* ------------------------------------------------------------------ *
   * rendering
   * ------------------------------------------------------------------ */

  function counts() {
    var c = { inbox: 0, done: 0 };
    items.forEach(function (it) {
      if (it.status === 'done') c.done++;
      else c.inbox++;
    });
    return c;
  }

  function itemHtml(it) {
    var d = detect(it.url);
    var done = it.status === 'done';
    var host = shortHost(it.url);
    var html = '';

    html += '<article class="item" data-id="' + esc(it.id) + '">';
    html += '<div class="item-body">';

    html += '<div class="src">';
    html += '<span class="mark" aria-hidden="true">' + esc(d.mark) + '</span>';
    html += '<span class="src-label">' + esc(d.label) + '</span>';
    if (host) html += '<span class="host">' + esc(host) + '</span>';
    html += '<button class="icon-btn edit-btn" data-act="edit" aria-label="수정" title="수정">' + ICONS.pencil + '</button>';
    html += '</div>';

    html += '<h2 class="item-title">' + esc(it.title) + '</h2>';
    if (it.note) html += '<p class="item-note">' + esc(it.note) + '</p>';
    if (it.tags && it.tags.length) {
      html += '<div class="tags">' + it.tags.map(function (t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join('') + '</div>';
    }

    if (done && it.savedTo) {
      html += '<div class="saved">' + ICONS.check + '<span>' + esc(it.savedTo.label) + ' 저장됨</span>' +
        (it.completedAt ? '<span class="when">' + esc(fmtDate(it.completedAt)) + '</span>' : '') + '</div>';
    }

    html += '<div class="acts">';
    if (done) {
      html += '<button class="btn btn-line" data-act="back">대기로 되돌리기</button>';
    } else {
      html += '<button class="btn btn-primary" data-act="done">저장 완료</button>';
    }
    if (it.url) {
      html += '<a class="btn btn-plain" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' + ICONS.open + '<span>열기</span></a>';
    }
    html += '<button class="btn btn-plain warn" data-act="delete">삭제</button>';
    html += '</div>';

    html += '</div>';
    if (it.photo) {
      html += '<div class="thumb"><img src="' + esc(it.photo) + '" alt="" loading="lazy"></div>';
    }
    html += '</article>';
    return html;
  }

  function matches(it) {
    if (!q) return true;
    var hay = [it.title, it.note, (it.tags || []).join(' '), it.url, detect(it.url).label].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function render() {
    var c = counts();
    $('nInbox').textContent = c.inbox;
    $('nDone').textContent = c.done;

    $('tabInbox').classList.toggle('is-on', tab === 'inbox');
    $('tabDone').classList.toggle('is-on', tab === 'done');
    $('tabInbox').setAttribute('aria-selected', tab === 'inbox' ? 'true' : 'false');
    $('tabDone').setAttribute('aria-selected', tab === 'done' ? 'true' : 'false');

    var list = items.filter(function (it) { return it.status === (tab === 'done' ? 'done' : 'inbox'); });
    list = list.filter(matches);
    list.sort(function (a, b) {
      var ka = tab === 'done' ? (a.completedAt || a.createdAt) : a.createdAt;
      var kb = tab === 'done' ? (b.completedAt || b.createdAt) : b.createdAt;
      return String(kb).localeCompare(String(ka));
    });

    $('list').innerHTML = list.map(itemHtml).join('');
    $('empty').hidden = list.length > 0;
    $('foot').hidden = items.length === 0;

    if (!list.length) {
      if (q) {
        $('emptyTitle').textContent = '검색 결과가 없어요';
        $('emptyText').innerHTML = '다른 말로 찾아보거나 검색을 지워 주세요.';
      } else if (tab === 'done') {
        $('emptyTitle').textContent = '완료한 항목이 없어요';
        $('emptyText').innerHTML = '저장을 마친 링크에 <b>저장 완료</b>를 누르면<br>어디에 저장했는지와 함께 여기로 옮겨집니다.';
      } else {
        $('emptyTitle').textContent = '인박스가 비어 있어요';
        $('emptyText').innerHTML = '공유한 링크를 붙여넣거나<br>아래 + 버튼으로 추가해 보세요.';
      }
    }

    $('searchBtn').hidden = items.length === 0;
    if (items.length === 0 && !$('searchRow').hidden) toggleSearch(false);
    $('menuClearDone').disabled = c.done === 0;
  }

  /* ------------------------------------------------------------------ *
   * sheets
   * ------------------------------------------------------------------ */

  function openSheet(id) {
    if (currentSheet && currentSheet !== id) closeSheet(currentSheet);
    hideToast();
    currentSheet = id;
    var el = $(id);
    el.classList.add('on');
    el.setAttribute('aria-hidden', 'false');
    $('scrim').classList.add('on');
    document.body.classList.add('locked');
  }

  function closeSheet(id) {
    id = id || currentSheet;
    if (!id) return;
    var el = $(id);
    if (el) {
      el.classList.remove('on');
      el.setAttribute('aria-hidden', 'true');
    }
    if (currentSheet === id) currentSheet = null;
    if (!document.querySelector('.sheet.on')) {
      $('scrim').classList.remove('on');
      document.body.classList.remove('locked');
    }
    if (id === 'formSheet') {
      formId = null;
      pendingPhoto = null;
      photoTouched = false;
    }
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').classList.remove('on');
  }

  function toast(msg, actionLabel, fn) {
    var t = $('toast');
    var b = $('toastAct');
    $('toastMsg').textContent = msg;
    if (actionLabel && fn) {
      b.hidden = false;
      b.textContent = actionLabel;
      b.onclick = function () {
        clearTimeout(toastTimer);
        t.classList.remove('on');
        fn();
      };
    } else {
      b.hidden = true;
      b.onclick = null;
    }
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, actionLabel ? 6500 : 2800);
  }

  /* ------------------------------------------------------------------ *
   * add / edit form
   * ------------------------------------------------------------------ */

  function updateUrlHint() {
    var hint = $('urlHint');
    var raw = $('fUrl').value.trim();
    if (!raw) {
      hint.hidden = true;
      $('fTitle').placeholder = '비워두면 자동으로 채워요';
      return;
    }
    var url = normalizeUrl(raw);
    if (!url) {
      hint.hidden = false;
      hint.innerHTML = '<span style="color:#B3261E">주소 형식을 확인해 주세요</span>';
      return;
    }
    var d = detect(url);
    var guess = autoTitle(url);
    hint.hidden = false;
    hint.innerHTML = '<span class="mark">' + esc(d.mark) + '</span>' + esc(d.label) + ' · ' + esc(shortHost(url));
    $('fTitle').placeholder = '비워두면 ‘' + guess + '’(으)로 저장돼요';
  }

  function showPhoto() {
    var wrap = $('photoPreview');
    if (pendingPhoto) {
      $('photoImg').src = pendingPhoto;
      wrap.hidden = false;
      $('photoBtn').textContent = '사진 바꾸기';
    } else {
      $('photoImg').removeAttribute('src');
      wrap.hidden = true;
      $('photoBtn').textContent = '사진 추가';
    }
  }

  function openForm(id, prefill) {
    var it = id ? byId(id) : null;
    formId = it ? it.id : null;
    pendingPhoto = it ? (it.photo || null) : null;
    photoTouched = false;

    $('formTitle').textContent = it ? '항목 수정' : '링크 추가';
    $('fSave').textContent = it ? '저장' : '추가';
    $('fUrl').value = it ? it.url : ((prefill && prefill.url) || '');
    $('fTitle').value = it ? it.title : ((prefill && prefill.title) || '');
    $('fTags').value = it ? (it.tags || []).join(', ') : ((prefill && prefill.tags) || '');
    $('fNote').value = it ? it.note : ((prefill && prefill.note) || '');
    setFormErr('');
    showPhoto();
    updateUrlHint();
    openSheet('formSheet');
    setTimeout(function () {
      var first = (!it && prefill && prefill.url) ? $('fTitle') : $('fUrl');
      try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
    }, 300);
  }

  function setFormErr(msg) {
    var e = $('formErr');
    if (!msg) { e.hidden = true; e.textContent = ''; return; }
    e.hidden = false;
    e.textContent = msg;
  }

  function submitForm(e) {
    if (e) e.preventDefault();
    var rawUrl = $('fUrl').value.trim();
    var url = normalizeUrl(rawUrl);
    if (rawUrl && !url) {
      setFormErr('링크 주소를 확인해 주세요. https://로 시작하는 주소만 저장할 수 있어요.');
      return;
    }
    var title = $('fTitle').value.trim();
    if (!title && !url) {
      setFormErr('링크나 제목 중 하나는 넣어 주세요.');
      return;
    }
    if (!title) title = autoTitle(url);
    var tags = parseTags($('fTags').value);
    var note = $('fNote').value.trim();
    var now = new Date().toISOString();
    var editing = !!formId;

    if (editing) {
      var item = byId(formId);
      if (!item) { closeSheet('formSheet'); return; }
      item.url = url;
      item.title = title;
      item.note = note;
      item.tags = tags;
      if (photoTouched) item.photo = pendingPhoto || '';
      item.updatedAt = now;
      persist(item);
      closeSheet('formSheet');
      render();
      toast('수정했어요');
      return;
    }

    var fresh = normalizeItem({
      id: uid(), url: url, title: title, note: note, tags: tags, photo: pendingPhoto || '',
      status: 'inbox', savedTo: null, createdAt: now, completedAt: null
    });
    items.push(fresh);
    persist(fresh);
    closeSheet('formSheet');
    tab = 'inbox';
    if (q) { q = ''; $('searchInput').value = ''; }
    render();
    toast('인박스에 추가했어요');
  }

  /* ------------------------------------------------------------------ *
   * save targets
   * ------------------------------------------------------------------ */

  function openSaveSheet(id) {
    var it = byId(id);
    if (!it) return;
    saveId = id;
    $('saveSub').textContent = it.title;
    $('saveOpts').innerHTML = SAVE_TARGETS.map(function (t) {
      return '<button class="opt" data-key="' + esc(t.key) + '">' +
        '<span class="mark" aria-hidden="true">' + esc(t.mark) + '</span>' +
        '<span>' + esc(t.label) + '</span>' +
        '<span class="chev">' + ICONS.chev + '</span></button>';
    }).join('');
    $('saveCustom').hidden = true;
    $('customInput').value = '';
    openSheet('saveSheet');
  }

  function applyTarget(key, label) {
    var it = byId(saveId);
    if (!it) { closeSheet('saveSheet'); return; }
    it.status = 'done';
    it.savedTo = { key: key, label: label };
    it.completedAt = new Date().toISOString();
    persist(it);
    closeSheet('saveSheet');
    tab = 'done';
    render();
    toast('‘' + label + '’에 저장 완료로 옮겼어요');
  }

  function returnToInbox(id) {
    var it = byId(id);
    if (!it) return;
    it.status = 'inbox';
    it.savedTo = null;
    it.completedAt = null;
    persist(it);
    tab = 'inbox';
    render();
    toast('대기 중으로 되돌렸어요');
  }

  /* ------------------------------------------------------------------ *
   * delete
   * ------------------------------------------------------------------ */

  function removeItem(id) {
    var idx = -1;
    for (var i = 0; i < items.length; i++) if (items[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    var removed = items[idx];
    items.splice(idx, 1);
    persistRemove(id);
    render();
    toast('삭제했어요', '실행 취소', function () {
      items.splice(Math.min(idx, items.length), 0, removed);
      persist(removed);
      render();
    });
  }

  /* ------------------------------------------------------------------ *
   * confirm / info / menu
   * ------------------------------------------------------------------ */

  function confirmSheet(title, msg, okLabel, fn) {
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = msg;
    $('confirmOk').textContent = okLabel || '확인';
    confirmRun = fn;
    openSheet('confirmSheet');
  }

  function openMenu() {
    var m = $('menu');
    var r = $('menuBtn').getBoundingClientRect();
    m.hidden = false;
    m.style.top = (r.bottom + 8) + 'px';
    m.style.right = Math.max(10, window.innerWidth - r.right - 6) + 'px';
    m.style.left = 'auto';
    $('menuBtn').setAttribute('aria-expanded', 'true');
    setTimeout(function () {
      document.addEventListener('click', onDocClick, { once: true });
    }, 0);
  }

  function closeMenu() {
    if ($('menu').hidden) return;
    $('menu').hidden = true;
    $('menuBtn').setAttribute('aria-expanded', 'false');
  }

  function onDocClick(e) {
    if (!$('menu').contains(e.target) && e.target !== $('menuBtn')) closeMenu();
  }

  /* ------------------------------------------------------------------ *
   * backup
   * ------------------------------------------------------------------ */

  function exportJson() {
    var payload = { app: 'yeji-archive', version: 2, exportedAt: new Date().toISOString(), items: items };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yeji-archive-' + stamp() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    toast('백업 파일을 내려받았어요');
  }

  function importJson(file) {
    if (!file) return;
    file.text().then(function (txt) {
      var data;
      try { data = JSON.parse(txt); } catch (e) { toast('JSON 파일을 읽을 수 없어요'); return; }
      var arr = Array.isArray(data) ? data : (data && data.items);
      if (!Array.isArray(arr)) { toast('백업 파일 형식이 아니에요'); return; }
      var added = 0, updated = 0;
      arr.forEach(function (raw) {
        var it = normalizeItem(raw);
        if (!it) return;
        var ex = byId(it.id);
        if (ex) {
          ex.url = it.url; ex.title = it.title; ex.note = it.note; ex.tags = it.tags;
          ex.photo = it.photo || ex.photo; ex.status = it.status; ex.savedTo = it.savedTo;
          ex.completedAt = it.completedAt; ex.createdAt = it.createdAt;
          persist(ex);
          updated++;
        } else {
          items.push(it);
          persist(it);
          added++;
        }
      });
      render();
      toast(added + '개 추가 · ' + updated + '개 갱신했어요');
    }).catch(function () { toast('백업 파일을 읽을 수 없어요'); });
  }

  /* ------------------------------------------------------------------ *
   * photo
   * ------------------------------------------------------------------ */

  function resizePhoto(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1000;
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, max / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try { resolve(canvas.toDataURL('image/jpeg', 0.82)); } catch (e) { reject(e); }
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  /* ------------------------------------------------------------------ *
   * search
   * ------------------------------------------------------------------ */

  function toggleSearch(force) {
    var row = $('searchRow');
    var show = typeof force === 'boolean' ? force : row.hidden;
    row.hidden = !show;
    $('searchBtn').setAttribute('aria-pressed', show ? 'true' : 'false');
    if (show) {
      $('searchInput').focus();
    } else {
      $('searchInput').value = '';
      q = '';
      render();
    }
  }

  /* ------------------------------------------------------------------ *
   * share link (?add= / ?url=)
   * ------------------------------------------------------------------ */

  function handleShare() {
    var p;
    try { p = new URLSearchParams(location.search); } catch (e) { return; }
    var rawAdd = p.get('add') || '';
    var rawUrlParam = p.get('url') || '';
    var rawTitle = p.get('title') || '';
    var rawText = p.get('text') || '';

    if (!rawAdd && !rawUrlParam && !rawText) return;

    var url = extractUrl(rawUrlParam) || extractUrl(rawAdd) || extractUrl(rawText);
    var title = rawTitle.trim();
    var note = rawText.trim();

    if (note && url) {
      note = note.split(url).join(' ');
      if (rawUrlParam) note = note.split(rawUrlParam).join(' ');
      note = note.replace(/\s+/g, ' ').trim();
      if (note === rawAdd.trim()) note = '';
    }
    if (!url && !title && rawAdd) title = rawAdd.trim();

    openForm(null, { url: url, title: title, note: note });

    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   * events
   * ------------------------------------------------------------------ */

  function bind() {
    $('tabInbox').addEventListener('click', function () { tab = 'inbox'; render(); });
    $('tabDone').addEventListener('click', function () { tab = 'done'; render(); });

    $('fab').addEventListener('click', function () { openForm(null, null); });

    $('searchBtn').addEventListener('click', function () { toggleSearch(); });
    $('searchInput').addEventListener('input', function () {
      q = this.value.trim().toLowerCase();
      render();
    });

    $('menuBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      if ($('menu').hidden) openMenu(); else closeMenu();
    });

    $('menu').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      closeMenu();
      var act = b.getAttribute('data-act');
      if (act === 'export') exportJson();
      if (act === 'import') $('importFile').click();
      if (act === 'install') doInstall();
      if (act === 'about') openSheet('infoSheet');
      if (act === 'clearDone') {
        var n = counts().done;
        if (!n) { toast('완료 폴더가 비어 있어요'); return; }
        confirmSheet('완료 폴더를 비울까요?', '완료한 ' + n + '개 항목이 모두 삭제됩니다. 대기 중 항목은 그대로 남습니다.', '비우기', function () {
          var kept = items.filter(function (it) { return it.status !== 'done'; });
          var gone = items.filter(function (it) { return it.status === 'done'; });
          items = kept;
          if (idbOk) gone.forEach(function (it) { idbDel(it.id); }); else lsSet(items);
          render();
          toast(gone.length + '개를 비웠어요');
        });
      }
    });

    $('importFile').addEventListener('change', function () {
      importJson(this.files && this.files[0]);
      this.value = '';
    });

    $('list').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var art = btn.closest('.item');
      if (!art) return;
      var id = art.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'done') openSaveSheet(id);
      if (act === 'edit') openForm(id, null);
      if (act === 'delete') removeItem(id);
      if (act === 'back') returnToInbox(id);
    });

    $('saveOpts').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-key]');
      if (!b) return;
      var key = b.getAttribute('data-key');
      if (key === 'custom') {
        $('saveCustom').hidden = false;
        $('customInput').focus();
        return;
      }
      var t = null;
      for (var i = 0; i < SAVE_TARGETS.length; i++) if (SAVE_TARGETS[i].key === key) t = SAVE_TARGETS[i];
      applyTarget(key, t ? t.label : '저장처');
    });

    $('customCancel').addEventListener('click', function () {
      $('saveCustom').hidden = true;
    });
    $('customOk').addEventListener('click', function () {
      var label = $('customInput').value.trim();
      if (!label) { $('customInput').focus(); return; }
      applyTarget('custom', label);
    });
    $('customInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('customOk').click(); }
    });

    $('itemForm').addEventListener('submit', submitForm);
    $('fUrl').addEventListener('input', updateUrlHint);
    $('fUrl').addEventListener('paste', function () {
      var self = this;
      setTimeout(function () {
        var url = extractUrl(self.value);
        if (url) { self.value = url; updateUrlHint(); }
      }, 0);
    });

    $('pasteBtn').addEventListener('click', pasteFromClipboard);

    $('photoBtn').addEventListener('click', function () { $('fPhoto').click(); });
    $('fPhoto').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      resizePhoto(f).then(function (data) {
        pendingPhoto = data;
        photoTouched = true;
        showPhoto();
      }).catch(function () { toast('사진을 불러오지 못했어요'); });
      e.target.value = '';
    });
    $('photoRemove').addEventListener('click', function () {
      pendingPhoto = null;
      photoTouched = true;
      showPhoto();
    });

    $('confirmOk').addEventListener('click', function () {
      var fn = confirmRun;
      confirmRun = null;
      closeSheet('confirmSheet');
      if (fn) fn();
    });

    $('scrim').addEventListener('click', function () { closeSheet(); });
    document.addEventListener('click', function (e) {
      var closer = e.target.closest('[data-close]');
      if (closer) {
        var sheet = closer.closest('.sheet');
        if (sheet) closeSheet(sheet.id);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (currentSheet) closeSheet();
        closeMenu();
      }
    });

    // a paste anywhere while the add sheet is open fills the link
    document.addEventListener('paste', function (e) {
      if (currentSheet !== 'formSheet') return;
      var data = e.clipboardData || window.clipboardData;
      if (!data) return;
      var text = data.getData('text');
      var url = extractUrl(text);
      if (!url) return;
      var target = document.activeElement;
      if (target === $('fNote') || target === $('fTitle') || target === $('fTags')) return;
      e.preventDefault();
      $('fUrl').value = url;
      updateUrlHint();
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installEvent = e;
    });
  }

  function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      $('fUrl').focus();
      toast('길게 눌러 링크를 붙여넣어 주세요');
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      var url = extractUrl(text);
      if (!url) { toast('클립보드에 링크가 없어요'); return; }
      $('fUrl').value = url;
      updateUrlHint();
      toast('링크를 붙여넣었어요');
    }).catch(function () {
      $('fUrl').focus();
      toast('길게 눌러 링크를 붙여넣어 주세요');
    });
  }

  function doInstall() {
    if (installEvent) {
      installEvent.prompt();
      installEvent = null;
      return;
    }
    openSheet('infoSheet');
    toast('Safari 공유 → 홈 화면에 추가');
  }

  /* ------------------------------------------------------------------ *
   * service worker
   * ------------------------------------------------------------------ */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    var refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || refreshed) return;
      refreshed = true;
      location.reload();
    });
    var started = false;
    function start() {
      if (started) return;
      started = true;
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
  }

  /* ------------------------------------------------------------------ *
   * boot
   * ------------------------------------------------------------------ */

  function boot() {
    bind();
    openDB().then(function (handle) {
      db = handle;
      idbOk = !!db;
      return idbAll();
    }).then(function (list) {
      if (Array.isArray(list)) {
        items = list.map(normalizeItem).filter(Boolean);
      } else {
        idbOk = false;
        items = lsAll().map(normalizeItem).filter(Boolean);
      }
      render();
      handleShare();
      registerSW();
    }).catch(function () {
      items = lsAll().map(normalizeItem).filter(Boolean);
      render();
      handleShare();
      registerSW();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
