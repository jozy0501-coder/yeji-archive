/* My Archive — a small, offline-first scrapbook for places, things and links. */
(function () {
  'use strict';

  var CATEGORIES = ['전체', '카페', '맛집', '아이템', '링크·계정', '여행·숙소', '볼거리'];
  var SOURCES = [
    { key: 'all', label: '전체' },
    { key: 'fav', label: '즐겨찾기 ★' },
    { key: 'shared', label: '내가 공유한 것' },
    { key: 'found', label: '함께 찾은 것' },
    { key: 'local', label: '내가 추가한 것' }
  ];
  var SOURCE_LABEL = { shared_by_user: '내가 공유함', found_with_pickle: '함께 찾음', local: '내가 추가함' };
  var STORE_KEY = 'myArchive:v1';

  var baseItems = [];
  var localItems = [];
  var state = { favs: {}, memos: {} };
  var filters = { q: '', cat: '전체', src: 'all' };
  var current = null;
  var editing = null;
  var pendingPhoto = null;
  var photoTouched = false;
  var activeSheet = null;
  var importedCount = 0;
  var lastFocus = null;

  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  /* ---------------- storage ---------------- */
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        state.favs = d.favs || {};
        state.memos = d.memos || {};
      }
    } catch (e) { /* private mode etc. */ }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('no-idb'));
      var req = indexedDB.open('myArchive', 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('items')) {
          req.result.createObjectStore('items', { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(db, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction('items', mode);
      var store = t.objectStore('items');
      var out = fn(store);
      t.oncomplete = function () { resolve(out && out.result); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error); };
    });
  }
  function idbAll() {
    return openDB().then(function (db) {
      return tx(db, 'readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; });
    }).catch(function () { return lsItems(); });
  }
  function idbPut(item) {
    return openDB().then(function (db) { return tx(db, 'readwrite', function (s) { return s.put(item); }); })
      .catch(function () { var l = lsItems(); l = l.filter(function (i) { return i.id !== item.id; }); l.push(item); lsSet(l); });
  }
  function idbDel(id) {
    return openDB().then(function (db) { return tx(db, 'readwrite', function (s) { return s.delete(id); }); })
      .catch(function () { lsSet(lsItems().filter(function (i) { return i.id !== id; })); });
  }
  function idbClear() {
    return openDB().then(function (db) { return tx(db, 'readwrite', function (s) { return s.clear(); }); })
      .catch(function () { lsSet([]); });
  }
  function lsItems() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY + ':items') || '[]'); } catch (e) { return []; }
  }
  function lsSet(list) {
    try { localStorage.setItem(STORE_KEY + ':items', JSON.stringify(list)); } catch (e) { showToast('저장 공간이 부족해요'); }
  }

  /* ---------------- helpers ---------------- */
  function allItems() { return baseItems.concat(localItems); }
  function byId(id) {
    for (var i = 0; i < baseItems.length; i++) if (baseItems[i].id === id) return baseItems[i];
    for (var j = 0; j < localItems.length; j++) if (localItems[j].id === id) return localItems[j];
    return null;
  }
  function isFav(id) { return !!state.favs[id]; }
  function memoOf(id) { return state.memos[id] || ''; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function shortDate(d) {
    if (!d) return '';
    var p = String(d).split('-');
    return p.length === 3 ? p[1] + '.' + p[2] : d;
  }
  function longDate(d) {
    if (!d) return '';
    var p = String(d).split('-');
    if (p.length !== 3) return d;
    return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일';
  }
  function todayISO() {
    var n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function linkLabel(url) {
    var h = hostOf(url);
    if (!h) return '링크 열기';
    if (h.indexOf('map.naver.com') >= 0 || h.indexOf('naver.me') >= 0) return '네이버 지도에서 보기';
    if (h.indexOf('google.com') >= 0 || h.indexOf('goo.gl') >= 0) return '지도에서 보기';
    if (h.indexOf('instagram.com') >= 0) return '인스타그램에서 보기';
    if (h.indexOf('threads.com') >= 0 || h.indexOf('threads.net') >= 0) return '스레드에서 보기';
    return '링크 열기';
  }
  function sourceLabel(it) {
    if (it.source === 'local') return '내가 추가함';
    return SOURCE_LABEL[it.source] || '';
  }
  var toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2200);
  }

  /* ---------------- chips ---------------- */
  function buildChips() {
    el.catChips.innerHTML = '';
    CATEGORIES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (c === filters.cat ? ' active' : '');
      b.textContent = c;
      b.setAttribute('aria-pressed', String(c === filters.cat));
      b.addEventListener('click', function () {
        filters.cat = c;
        syncChips();
        render();
      });
      el.catChips.appendChild(b);
    });
    el.srcChips.innerHTML = '';
    SOURCES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (s.key === filters.src ? ' active' : '');
      b.textContent = s.label;
      b.setAttribute('aria-pressed', String(s.key === filters.src));
      b.addEventListener('click', function () {
        filters.src = s.key;
        syncChips();
        render();
      });
      el.srcChips.appendChild(b);
    });
  }
  function syncChips() {
    var cats = el.catChips.children;
    for (var i = 0; i < cats.length; i++) {
      var on = cats[i].textContent === filters.cat;
      cats[i].classList.toggle('active', on);
      cats[i].setAttribute('aria-pressed', String(on));
    }
    var srcs = el.srcChips.children;
    for (var j = 0; j < srcs.length; j++) {
      var on2 = srcs[j].textContent === SOURCES[j].label && SOURCES[j].key === filters.src;
      srcs[j].classList.toggle('active', on2);
      srcs[j].setAttribute('aria-pressed', String(on2));
    }
  }

  /* ---------------- filtering & rendering ---------------- */
  function filtered() {
    var q = filters.q.trim().toLowerCase();
    return allItems().filter(function (it) {
      if (filters.cat !== '전체' && it.category !== filters.cat) return false;
      if (filters.src === 'fav' && !isFav(it.id)) return false;
      if (filters.src === 'shared' && it.source !== 'shared_by_user') return false;
      if (filters.src === 'found' && it.source !== 'found_with_pickle') return false;
      if (filters.src === 'local' && it.source !== 'local') return false;
      if (!q) return true;
      var hay = [it.title, it.note, (it.tags || []).join(' '), memoOf(it.id)].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) {
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? 1 : -1;
      return 0;
    });
  }

  function render() {
    var list = filtered();
    el.grid.innerHTML = '';
    var frag = document.createDocumentFragment();
    list.forEach(function (it, i) { frag.appendChild(makeCard(it, i)); });
    el.grid.appendChild(frag);

    var total = allItems().length;
    if (filters.q) {
      el.countText.innerHTML = '검색 결과 <span class="num">' + list.length + '</span>개';
    } else if (filters.cat !== '전체' || filters.src !== 'all') {
      var parts = [];
      if (filters.cat !== '전체') parts.push(filters.cat);
      if (filters.src !== 'all') {
        for (var k = 0; k < SOURCES.length; k++) {
          if (SOURCES[k].key === filters.src) parts.push(SOURCES[k].label.replace(' ★', ''));
        }
      }
      el.countText.innerHTML = parts.join(' · ') + ' · <span class="num">' + list.length + '</span>개';
    } else {
      el.countText.innerHTML = '<span class="num">' + total + '</span>개의 기록';
    }
    el.empty.hidden = list.length > 0;
    el.footCount.textContent = String(total);
  }

  function makeCard(it, i) {
    var card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', it.title + ' 자세히 보기');
    card.style.animationDelay = Math.min(i * 22, 320) + 'ms';
    card.dataset.id = it.id;

    var thumb = document.createElement('div');
    thumb.className = 'thumb' + (it.image ? '' : ' ph');
    if (it.image) {
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = it.image;
      img.alt = it.title;
      thumb.appendChild(img);
    } else {
      thumb.insertAdjacentHTML('beforeend',
        '<svg class="ph-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/>' +
        '<circle cx="9" cy="10.5" r="1.4"/><path d="M5.6 17l4.4-4.4 3.4 3.4 2.1-2.1 2.9 2.9"/></svg>');
    }
    var badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = it.category;
    thumb.appendChild(badge);

    var star = document.createElement('button');
    star.type = 'button';
    star.className = 'card-star' + (isFav(it.id) ? ' on' : '');
    star.setAttribute('aria-label', isFav(it.id) ? '즐겨찾기 해제' : '즐겨찾기 추가');
    star.setAttribute('aria-pressed', String(isFav(it.id)));
    star.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.63 5.33 5.88.86-4.25 4.14 1 5.86L12 17.02l-5.26 2.77 1-5.86L3.49 9.79l5.88-.86z"/></svg>';
    star.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFav(it.id, star);
    });
    thumb.appendChild(star);

    var body = document.createElement('div');
    body.className = 'card-body';

    var title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = it.title;
    body.appendChild(title);

    var noteText = memoOf(it.id) || it.note || '';
    if (noteText) {
      var note = document.createElement('p');
      note.className = 'card-note';
      note.textContent = noteText;
      body.appendChild(note);
    }

    var meta = document.createElement('div');
    meta.className = 'card-meta';
    var date = document.createElement('span');
    date.className = 'date';
    date.textContent = shortDate(it.date);
    meta.appendChild(date);
    var tag0 = (it.tags || [])[0];
    if (tag0) {
      var pip = document.createElement('span');
      pip.className = 'pip';
      meta.appendChild(pip);
      var t = document.createElement('span');
      t.textContent = tag0;
      meta.appendChild(t);
    }
    body.appendChild(meta);

    card.appendChild(thumb);
    card.appendChild(body);

    card.addEventListener('click', function () { openDetail(it.id); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(it.id); }
    });
    return card;
  }

  function toggleFav(id, btnEl) {
    if (state.favs[id]) delete state.favs[id]; else state.favs[id] = 1;
    saveState();
    var on = isFav(id);
    if (btnEl) {
      btnEl.classList.toggle('on', on);
      btnEl.setAttribute('aria-pressed', String(on));
      btnEl.setAttribute('aria-label', on ? '즐겨찾기 해제' : '즐겨찾기 추가');
    }
    if (current && current.id === id) updateDetailFav();
    render();
    showToast(on ? '즐겨찾기에 담았어요' : '즐겨찾기에서 뺐어요');
  }

  /* ---------------- sheets ---------------- */
  function openSheet(sheet) {
    if (activeSheet === sheet) return;
    if (activeSheet) closeSheet(activeSheet, true);
    lastFocus = document.activeElement;
    sheet.hidden = false;
    el.backdrop.hidden = false;
    void sheet.offsetHeight;
    sheet.classList.add('open');
    el.backdrop.classList.add('show');
    document.documentElement.style.overflow = 'hidden';
    activeSheet = sheet;
    var closeBtn = sheet.querySelector('.sheet-close');
    if (closeBtn) setTimeout(function () { try { closeBtn.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function closeSheet(sheet, instant) {
    sheet = sheet || activeSheet;
    if (!sheet) return;
    sheet.classList.remove('open');
    activeSheet = null;
    el.backdrop.classList.remove('show');
    document.documentElement.style.overflow = '';
    var hide = function () { sheet.hidden = true; };
    if (instant) hide(); else setTimeout(hide, 340);
    setTimeout(function () {
      if (!activeSheet) {
        el.backdrop.hidden = true;
      }
    }, 360);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------------- detail ---------------- */
  function openDetail(id) {
    var it = byId(id);
    if (!it) return;
    current = it;

    el.dCat.textContent = it.category;
    el.dTitle.textContent = it.title;
    el.dDate.textContent = longDate(it.date);
    el.dSource.textContent = sourceLabel(it);
    el.dNote.textContent = it.note || '';
    el.dNote.hidden = !it.note;

    el.dTags.innerHTML = '';
    (it.tags || []).forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag';
      b.textContent = t;
      b.addEventListener('click', function () {
        filters.q = t;
        filters.cat = '전체';
        filters.src = 'all';
        el.searchInput.value = t;
        el.clearSearch.hidden = false;
        syncChips();
        render();
        closeSheet(el.detailSheet);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      el.dTags.appendChild(b);
    });

    if (it.image) {
      el.dImg.src = it.image;
      el.dImg.alt = it.title;
      el.dHero.classList.remove('no-img');
    } else {
      el.dImg.removeAttribute('src');
      el.dImg.alt = '';
      el.dHero.classList.add('no-img');
    }

    if (it.url) {
      el.dLink.href = it.url;
      $('dLinkText').textContent = linkLabel(it.url);
      el.dLink.hidden = false;
    } else {
      el.dLink.removeAttribute('href');
      el.dLink.hidden = true;
    }

    updateDetailFav();
    el.dMemo.value = memoOf(it.id);

    var local = it.source === 'local';
    el.detailFoot.hidden = !local;

    openSheet(el.detailSheet);
    el.detailSheet.scrollTop = 0;
  }

  function updateDetailFav() {
    var on = current ? isFav(current.id) : false;
    el.dFav.setAttribute('aria-pressed', String(on));
    el.dFav.querySelector('span').textContent = on ? '즐겨찾기됨' : '즐겨찾기';
  }

  /* ---------------- add / edit form ---------------- */
  function openForm(item) {
    editing = item || null;
    photoTouched = false;
    pendingPhoto = item ? item.image : null;
    $('formTitle').textContent = item ? '기록 수정' : '새 기록 추가';
    $('fTitle').value = item ? item.title : '';
    $('fCat').value = item ? item.category : '카페';
    $('fUrl').value = item && item.url ? item.url : '';
    $('fNote').value = item ? item.note || '' : '';
    $('fTags').value = item ? (item.tags || []).join(', ') : '';
    $('fPhoto').value = '';
    updatePhotoPreview();
    openSheet(el.formSheet);
    setTimeout(function () { try { $('fTitle').focus({ preventScroll: true }); } catch (e) {} }, 380);
  }

  function updatePhotoPreview() {
    if (pendingPhoto) {
      $('photoImg').src = pendingPhoto;
      $('photoPreview').hidden = false;
      $('photoLabel').textContent = '사진 바꾸기';
    } else {
      $('photoImg').removeAttribute('src');
      $('photoPreview').hidden = true;
      $('photoLabel').textContent = '사진 선택';
    }
  }

  function readPhoto(file) {
    if (!file || !/^image\//.test(file.type)) { showToast('이미지 파일만 넣을 수 있어요'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX = 1200;
        var w = img.width, h = img.height;
        var scale = Math.min(1, MAX / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FAF8F5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          pendingPhoto = canvas.toDataURL('image/jpeg', 0.82);
        } catch (e) {
          pendingPhoto = reader.result;
        }
        photoTouched = true;
        updatePhotoPreview();
      };
      img.onerror = function () { showToast('사진을 읽지 못했어요'); };
      img.src = reader.result;
    };
    reader.onerror = function () { showToast('사진을 읽지 못했어요'); };
    reader.readAsDataURL(file);
  }

  function submitForm(e) {
    e.preventDefault();
    var title = $('fTitle').value.trim();
    if (!title) { showToast('제목을 적어 주세요'); $('fTitle').focus(); return; }
    var tags = $('fTags').value.split(',').map(function (s) { return s.trim().replace(/^#/, ''); })
      .filter(function (s) { return s.length > 0; }).slice(0, 12);
    var url = $('fUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    var item = {
      id: editing ? editing.id : 'local-' + Date.now(),
      title: title,
      category: $('fCat').value,
      date: editing ? editing.date : todayISO(),
      note: $('fNote').value.trim(),
      url: url || null,
      source: 'local',
      tags: tags,
      image: pendingPhoto || null
    };
    Promise.resolve(idbPut(item)).then(function () {
      return idbAll();
    }).then(function (list) {
      localItems = list || [];
      closeSheet(el.formSheet);
      render();
      showToast(editing ? '기록을 고쳤어요' : '기록을 담았어요');
      if (editing && current && current.id === item.id) closeSheet(el.detailSheet);
      editing = null;
    }).catch(function () {
      showToast('저장하지 못했어요');
    });
  }

  function deleteLocal(it) {
    if (!it) return;
    var ok = window.confirm('"' + it.title + '" 기록을 삭제할까요?\n기기에서만 지워지고 되돌릴 수 없어요.');
    if (!ok) return;
    idbDel(it.id).then(function () {
      localItems = localItems.filter(function (i) { return i.id !== it.id; });
      delete state.favs[it.id];
      delete state.memos[it.id];
      saveState();
      closeSheet(el.detailSheet);
      render();
      showToast('기록을 지웠어요');
    });
  }

  /* ---------------- backup ---------------- */
  function exportJSON() {
    var payload = {
      app: 'my-archive',
      version: 1,
      exported_at: new Date().toISOString(),
      user_items: localItems,
      favorites: state.favs,
      memos: state.memos
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'my-archive-backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    showToast('백업 파일을 내려받았어요');
  }

  function importJSON(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var d;
      try { d = JSON.parse(reader.result); } catch (e) { showToast('JSON 파일을 읽을 수 없어요'); return; }
      if (!d || (!d.user_items && !d.favorites && !d.memos)) { showToast('백업 파일 형식이 아니에요'); return; }
      var items = Array.isArray(d.user_items) ? d.user_items.filter(function (i) { return i && i.id && i.title; }) : [];
      var ok = window.confirm('백업을 가져올까요?\n지금 기기에 추가한 기록 ' + localItems.length + '개와 즐겨찾기·메모가 백업 내용으로 바뀝니다.');
      if (!ok) return;
      idbClear().then(function () {
        var chain = Promise.resolve();
        items.forEach(function (i) { chain = chain.then(function () { return idbPut(i); }); });
        return chain;
      }).then(function () {
        state.favs = d.favorites || {};
        state.memos = d.memos || {};
        saveState();
        return idbAll();
      }).then(function (list) {
        localItems = list || [];
        importedCount = items.length;
        render();
        showToast('기록 ' + importedCount + '개를 가져왔어요');
      }).catch(function () { showToast('가져오지 못했어요'); });
    };
    reader.onerror = function () { showToast('파일을 읽지 못했어요'); };
    reader.readAsText(file, 'utf-8');
  }

  /* ---------------- info sheet ---------------- */
  function openInfo(kind) {
    if (kind === 'install') {
      el.infoBody.innerHTML =
        '<h2>홈 화면에 추가하기</h2>' +
        '<ol><li>Safari에서 이 페이지를 엽니다.</li>' +
        '<li>하단의 공유 버튼(□↑)을 누릅니다.</li>' +
        '<li>“홈 화면에 추가”를 선택합니다.</li></ol>' +
        '<p class="hint">홈 화면에서 열면 주소창 없이 앱처럼 열리고, 한 번 열어 두면 인터넷이 없어도 기록을 볼 수 있어요.</p>';
    } else {
      el.infoBody.innerHTML =
        '<h2>My Archive</h2>' +
        '<p>함께 찾고, 공유하고, 저장해 둔 장소와 물건을 한곳에 모은 개인 스크랩북입니다.</p>' +
        '<p>즐겨찾기와 메모, 새로 추가한 기록은 이 기기에만 저장됩니다. 브라우저 데이터를 지우면 함께 사라지니 가끔 <strong>JSON으로 백업</strong>해 두세요.</p>' +
        '<p class="hint">기록 ' + allItems().length + '개 · 사진 ' + allItems().filter(function (i) { return i.image; }).length + '장</p>';
    }
    openSheet(el.infoSheet);
  }

  /* ---------------- events ---------------- */
  function bind() {
    el.searchInput.addEventListener('input', function () {
      filters.q = el.searchInput.value;
      el.clearSearch.hidden = !filters.q;
      clearTimeout(bind.t);
      bind.t = setTimeout(render, 90);
    });
    el.clearSearch.addEventListener('click', function () {
      el.searchInput.value = '';
      filters.q = '';
      el.clearSearch.hidden = true;
      render();
      el.searchInput.focus();
    });
    el.fab.addEventListener('click', function () { openForm(null); });
    el.detailClose.addEventListener('click', function () { closeSheet(el.detailSheet); });
    el.formClose.addEventListener('click', function () { closeSheet(el.formSheet); });
    $('fCancel').addEventListener('click', function () { closeSheet(el.formSheet); });
    $('infoClose').addEventListener('click', function () { closeSheet(el.infoSheet); });
    el.backdrop.addEventListener('click', function () { if (activeSheet) closeSheet(activeSheet); });
    $('itemForm').addEventListener('submit', submitForm);

    el.dFav.addEventListener('click', function () {
      if (current) toggleFav(current.id);
    });
    el.memoSave.addEventListener('click', function () {
      if (!current) return;
      var v = el.dMemo.value.trim();
      if (v) state.memos[current.id] = v; else delete state.memos[current.id];
      saveState();
      render();
      showToast(v ? '메모를 저장했어요' : '메모를 지웠어요');
    });
    el.memoClear.addEventListener('click', function () {
      if (!current) return;
      el.dMemo.value = '';
      delete state.memos[current.id];
      saveState();
      render();
      showToast('메모를 지웠어요');
    });
    el.dEdit.addEventListener('click', function () {
      if (!current) return;
      var item = current;
      closeSheet(el.detailSheet);
      setTimeout(function () { openForm(item); }, 60);
    });
    el.dDelete.addEventListener('click', function () { deleteLocal(current); });

    $('photoPicker').addEventListener('click', function () { $('fPhoto').click(); });
    $('fPhoto').addEventListener('change', function (e) { readPhoto(e.target.files && e.target.files[0]); });
    $('photoRemove').addEventListener('click', function () {
      pendingPhoto = null;
      photoTouched = true;
      $('fPhoto').value = '';
      updatePhotoPreview();
    });

    var menuBtn = $('menuBtn');
    var menu = $('menuPop');
    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = menu.hidden;
      menu.hidden = !willOpen;
      menuBtn.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) {
        menu.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      var act = b.dataset.act;
      if (act === 'export') exportJSON();
      else if (act === 'import') $('importFile').click();
      else if (act === 'install') openInfo('install');
      else if (act === 'about') openInfo('about');
    });
    $('importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      importJSON(f);
      e.target.value = '';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!menu.hidden) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
        else if (activeSheet) closeSheet(activeSheet);
      }
    });

    window.addEventListener('scroll', function () {
      el.topStack.classList.toggle('is-stuck', window.scrollY > 4);
    }, { passive: true });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {});
      });
    }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    el = {
      topStack: $('topStack'), catChips: $('catChips'), srcChips: $('srcChips'),
      searchInput: $('searchInput'), clearSearch: $('clearSearch'),
      grid: $('grid'), empty: $('empty'), countText: $('countText'), footCount: $('footCount'),
      toast: $('toast'), backdrop: $('backdrop'), fab: $('fab'),
      detailSheet: $('detailSheet'), formSheet: $('formSheet'), infoSheet: $('infoSheet'),
      detailClose: $('detailClose'), formClose: $('formClose'), infoClose: $('infoClose'),
      dTitle: $('dTitle'), dCat: $('dCat'), dDate: $('dDate'),
      dSource: $('dSource'), dNote: $('dNote'), dTags: $('dTags'), dLink: $('dLink'),
      dImg: $('dImg'), dHero: $('dHero'), dFav: $('dFav'), dMemo: $('dMemo'),
      memoSave: $('memoSave'), memoClear: $('memoClear'),
      detailFoot: $('detailFoot'), dEdit: $('dEdit'), dDelete: $('dDelete'),
      infoBody: $('infoBody')
    };
    loadState();
    buildChips();
    bind();

    fetch('./data/items.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) { baseItems = (d && d.items) || []; })
      .catch(function () { showToast('기록을 불러오지 못했어요. 새로고침해 주세요.'); })
      .then(function () {
        return idbAll().then(function (list) {
          localItems = list || [];
          render();
        });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
