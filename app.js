/* ============================================================
   盲轉TV — Google TV Edition  |  app.js
   Google TV Remote Key Codes:
     DPAD Left/Right  = channel ±
     DPAD Up/Down     = video ±
     DPAD Center/OK   = confirm
     MediaPlayPause   = play/pause
     MediaRewind      = prev channel
     MediaFastForward = next channel
     ColorF0Red       = random
     ColorF1Green     = guide (channel list)
     ColorF2Yellow    = CRT toggle
     ColorF3Blue      = subtitles
     Back/Escape      = back/close
     0-9              = number dial
     ChannelUp/Down   = channel ±
   ============================================================ */

'use strict';

/* ── Default Channels ── */
const DEFAULT_CHANNELS = [
  { id: 1,  name: 'ViuTV',          chId: 'UCjmJDjuh8xALJSH6MsFgBig', emoji: '📺', category: '港台' },
  { id: 2,  name: '香港電台 RTHK',  chId: 'UCov2zYcNKnFGnMRzlbLpC-g', emoji: '📻', category: '港台' },
  { id: 3,  name: '壹傳媒 Next TV',  chId: 'UCX2pYbcjzVkVNT9VGqKc0Aw', emoji: '📡', category: '港台' },
  { id: 4,  name: 'Now 新聞',        chId: 'UCY5N3kEbJ7MuPswSW7IVGHA', emoji: '📰', category: '新聞' },
  { id: 5,  name: 'CNN',             chId: 'UCupvZG-5ko_eiXAupbDfxWw', emoji: '🌐', category: '新聞' },
  { id: 6,  name: 'BBC News',        chId: 'UC16niRr50-MSBwiO3YDb3RA', emoji: '🇬🇧', category: '新聞' },
  { id: 7,  name: 'NHK World',       chId: 'UC6a76FHiRNEfHrEAqL8Gfzg', emoji: '🇯🇵', category: '新聞' },
  { id: 8,  name: 'NASA',            chId: 'UCLA_DiR1FfKNvjuUpBHmylQ', emoji: '🚀', category: '知識' },
  { id: 9,  name: 'TED',             chId: 'UCAuUUnT6oDeKwE6v1NGQxug', emoji: '💡', category: '知識' },
  { id: 10, name: 'National Geog.',  chId: 'UCpVm7bg6pXKo1Pr6k5kxG9A', emoji: '🌍', category: '知識' },
  { id: 11, name: 'Lofi Girl',       chId: 'UCSJ4gkVC6NrvII8umztf0Ow', emoji: '🎵', category: '音樂' },
  { id: 12, name: 'Vevo',            chId: 'UCg9_QB3IQWB5ZF-RTKF55UQ', emoji: '🎬', category: '音樂' },
];

/* ── State ── */
const state = {
  channels: [],
  currentChIdx: 0,
  currentVidIdx: 0,
  videos: [],             // current channel's video list
  player: null,           // YT player instance
  playerReady: false,
  isPlaying: false,
  crtEnabled: false,
  crtIntensity: 40,
  truetvMode: false,      // auto-advance
  subtitlesOn: false,
  guideOpen: false,
  addModalOpen: false,
  guideTab: 'all',        // 'all' | 'fav'
  guideFocusIdx: 0,
  numBuffer: '',
  numTimer: null,
  osdChTimer: null,
  hudTimer: null,
  toolbarTimer: null,
  crtOsdTimer: null,
  toastTimer: null,
  favorites: [],
  searchQuery: '',
};

/* ── In-memory storage (with localStorage fallback) ── */
const STORAGE_KEY = 'blindtv_channels_v2';
const FAV_KEY = 'blindtv_favorites_v2';

// Pure in-memory store
const _mem = {};
const store = {
  getItem(k) { return _mem[k] || null; },
  setItem(k, v) { _mem[k] = v; }
};

function loadChannels() {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return DEFAULT_CHANNELS.map(c => ({ ...c }));
}

function saveChannels() {
  try { store.setItem(STORAGE_KEY, JSON.stringify(state.channels)); } catch(e) {}
}

function loadFavorites() {
  try {
    const raw = store.getItem(FAV_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return [];
}

function saveFavorites() {
  try { store.setItem(FAV_KEY, JSON.stringify(state.favorites)); } catch(e) {}
}

/* ── DOM Refs ── */
const $ = id => document.getElementById(id);
const el = {
  welcomeScreen: $('welcomeScreen'),
  ytContainer:   $('ytContainer'),
  hudTop:        $('hudTop'),
  hudChNum:      $('hudChNum'),
  hudChName:     $('hudChName'),
  hudVidTitle:   $('hudVidTitle'),
  hudTime:       $('hudTime'),
  toolbar:       $('toolbar'),
  guideOverlay:  $('guideOverlay'),
  guideList:     $('guideList'),
  guideSearch:   $('guideSearch'),
  addModal:      $('addModal'),
  osdNum:        $('osdNum'),
  osdCh:         $('osdCh'),
  osdChNum:      $('osdChNum'),
  osdChName:     $('osdChName'),
  osdChBarFill:  $('osdChBarFill'),
  toast:         $('toast'),
  osdCrt:        $('osdCrt'),
  crtSlider:     $('crtSlider'),
  crtVal:        $('crtVal'),
  crtOverlay:    $('crtOverlay'),
  crtScanlines:  $('crtScanlines'),
  vignette:      $('vignette'),
  iconPlay:      $('iconPlay'),
  iconPause:     $('iconPause'),
  tbPlayLabel:   $('tbPlayLabel'),
  inputChName:   $('inputChName'),
  inputChId:     $('inputChId'),
  inputChNum:    $('inputChNum'),
  btnOpenGuide:  $('btnOpenGuide'),
  btnGuide:      $('btnGuide'),
  btnCloseGuide: $('btnCloseGuide'),
  btnRandom:     $('btnRandom'),
  btnSubtitle:   $('btnSubtitle'),
  btnCrt:        $('btnCrt'),
  btnFullscreen: $('btnFullscreen'),
  btnPlayPause:  $('btnPlayPause'),
  btnPrevCh:     $('btnPrevCh'),
  btnNextCh:     $('btnNextCh'),
  btnPrevVid:    $('btnPrevVid'),
  btnNextVid:    $('btnNextVid'),
  btnAddChannel: $('btnAddChannel'),
  btnCloseModal: $('btnCloseModal'),
  btnCancelModal:$('btnCancelModal'),
  btnConfirmAdd: $('btnConfirmAdd'),
  tabAll:        $('tabAll'),
  tabFav:        $('tabFav'),
};

/* ── Clock ── */
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  el.hudTime.textContent = `${hh}:${mm}`;
}
setInterval(updateClock, 10000);
updateClock();

/* ── YouTube IFrame API ── */
window.onYouTubeIframeAPIReady = function() {
  state.player = new YT.Player('ytPlayer', {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      iv_load_policy: 3,
      cc_load_policy: 0,
      fs: 0,
      playsinline: 1,
      enablejsapi: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    }
  });
};

function loadYTAPI() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

function onPlayerReady(e) {
  state.playerReady = true;
  if (state.channels.length > 0) {
    loadChannel(state.currentChIdx);
  }
}

function onPlayerStateChange(e) {
  const YT_PLAYING = 1, YT_PAUSED = 2, YT_ENDED = 0, YT_BUFFERING = 3;
  if (e.data === YT_PLAYING) {
    state.isPlaying = true;
    updatePlayBtn();
    // get video title
    try {
      const data = state.player.getVideoData();
      if (data && data.title) {
        el.hudVidTitle.textContent = data.title;
      }
    } catch(err) {}
  } else if (e.data === YT_PAUSED) {
    state.isPlaying = false;
    updatePlayBtn();
  } else if (e.data === YT_ENDED) {
    state.isPlaying = false;
    updatePlayBtn();
    if (state.truetvMode) {
      setTimeout(() => nextVideo(), 1500);
    }
  }
}

function onPlayerError(e) {
  // skip to next video on error
  setTimeout(() => nextVideo(), 800);
}

function updatePlayBtn() {
  el.iconPlay.style.display = state.isPlaying ? 'none' : 'block';
  el.iconPause.style.display = state.isPlaying ? 'block' : 'none';
  el.tbPlayLabel.textContent = state.isPlaying ? '暫停' : '播放';
}

/* ── Channel Loading ── */
async function loadChannel(idx, vidIdx = 0) {
  if (state.channels.length === 0) return;
  idx = ((idx % state.channels.length) + state.channels.length) % state.channels.length;
  state.currentChIdx = idx;
  state.currentVidIdx = vidIdx;

  const ch = state.channels[idx];
  showChannelFlash();
  showOsdCh(ch);
  updateHud(ch);

  // Show player, hide welcome
  el.welcomeScreen.style.display = 'none';
  el.ytContainer.style.display = 'block';

  // Load channel uploads playlist
  if (state.playerReady && state.player) {
    try {
      // Uploads playlist = replace UC with UU
      const playlistId = ch.chId.replace(/^UC/, 'UU');
      state.player.loadPlaylist({
        list: playlistId,
        listType: 'playlist',
        index: vidIdx,
        suggestedQuality: 'hd720',
      });
      state.isPlaying = true;
      updatePlayBtn();
    } catch(e) {
      console.warn('Playlist load failed:', e);
    }
  }

  renderGuideList();
}

function updateHud(ch) {
  el.hudChNum.textContent = String(ch.id).padStart(2,'0');
  el.hudChName.textContent = ch.name;
  el.hudVidTitle.textContent = '載入中...';
  showHud();
  showToolbar();
}

/* ── Navigation ── */
function nextChannel() {
  loadChannel(state.currentChIdx + 1);
}

function prevChannel() {
  loadChannel(state.currentChIdx - 1);
}

function nextVideo() {
  if (!state.playerReady || !state.player) return;
  try {
    state.player.nextVideo();
    state.currentVidIdx++;
    showHud();
    showToolbar();
  } catch(e) {}
}

function prevVideo() {
  if (!state.playerReady || !state.player) return;
  try {
    state.player.previousVideo();
    if (state.currentVidIdx > 0) state.currentVidIdx--;
    showHud();
    showToolbar();
  } catch(e) {}
}

function gotoChannel(num) {
  const idx = state.channels.findIndex(c => c.id === num);
  if (idx >= 0) {
    loadChannel(idx);
  } else {
    showToast(`頻道 ${num} 不存在`);
  }
}

function randomChannel() {
  if (state.channels.length === 0) return;
  let idx;
  do { idx = Math.floor(Math.random() * state.channels.length); }
  while (idx === state.currentChIdx && state.channels.length > 1);
  loadChannel(idx);
  showToast('🎲 隨機轉台');
}

/* ── Play/Pause ── */
function togglePlayPause() {
  if (!state.playerReady || !state.player) return;
  try {
    const s = state.player.getPlayerState();
    if (s === 1) { state.player.pauseVideo(); }
    else { state.player.playVideo(); }
  } catch(e) {}
  showHud();
  showToolbar();
}

/* ── Subtitles ── */
function toggleSubtitles() {
  if (!state.playerReady || !state.player) return;
  state.subtitlesOn = !state.subtitlesOn;
  try {
    if (state.subtitlesOn) {
      state.player.loadModule('captions');
      state.player.setOption('captions', 'track', { languageCode: 'zh-HK' });
    } else {
      state.player.unloadModule('captions');
    }
  } catch(e) {}
  showToast(state.subtitlesOn ? '字幕 開' : '字幕 關');
  el.btnSubtitle.classList.toggle('active', state.subtitlesOn);
}

/* ── CRT Effect ── */
function updateCrtEffect() {
  const intensity = state.crtEnabled ? state.crtIntensity / 100 : 0;
  document.documentElement.style.setProperty('--crt-opacity', intensity);
}

function toggleCrt() {
  state.crtEnabled = !state.crtEnabled;
  updateCrtEffect();
  showCrtOsd();
  el.btnCrt.classList.toggle('active', state.crtEnabled);
  showToast(state.crtEnabled ? `📺 CRT 特效 開 (${state.crtIntensity}%)` : 'CRT 特效 關');
}

function showCrtOsd() {
  el.osdCrt.classList.add('show');
  clearTimeout(state.crtOsdTimer);
  state.crtOsdTimer = setTimeout(() => el.osdCrt.classList.remove('show'), 3000);
}

/* ── True TV Mode ── */
function toggleTrueTv() {
  state.truetvMode = !state.truetvMode;
  showToast(state.truetvMode ? '📺 真電視模式 開（自動播下一段）' : '真電視模式 關');
}

/* ── Fullscreen ── */
function toggleFullscreen() {
  showToast('全螢幕：請按遙控器的全螢幕鍵');
}

/* ── HUD / Toolbar visibility ── */
function showHud(duration = 4000) {
  el.hudTop.classList.add('visible');
  clearTimeout(state.hudTimer);
  if (duration > 0) {
    state.hudTimer = setTimeout(() => el.hudTop.classList.remove('visible'), duration);
  }
}

function showToolbar(duration = 5000) {
  el.toolbar.classList.add('visible');
  clearTimeout(state.toolbarTimer);
  if (duration > 0) {
    state.toolbarTimer = setTimeout(() => el.toolbar.classList.remove('visible'), duration);
  }
}

/* ── OSD ── */
function showOsdCh(ch) {
  el.osdChNum.textContent = String(ch.id).padStart(2,'0');
  el.osdChName.textContent = ch.name;
  el.osdChBarFill.style.width = '0%';
  el.osdCh.classList.add('show');
  clearTimeout(state.osdChTimer);
  // animate bar
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.osdChBarFill.style.width = '100%';
    });
  });
  state.osdChTimer = setTimeout(() => el.osdCh.classList.remove('show'), 3000);
}

function showToast(msg, duration = 2500) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
}

/* ── Number dialing ── */
function handleNumInput(digit) {
  state.numBuffer += digit;
  el.osdNum.textContent = state.numBuffer;
  el.osdNum.classList.add('show');
  clearTimeout(state.numTimer);
  state.numTimer = setTimeout(() => {
    const num = parseInt(state.numBuffer, 10);
    state.numBuffer = '';
    el.osdNum.classList.remove('show');
    if (!isNaN(num) && num > 0) gotoChannel(num);
  }, 1800);
}

/* ── Channel Flash + Noise ── */
function showChannelFlash() {
  // noise overlay
  const noise = document.createElement('div');
  noise.className = 'static-noise';
  document.body.appendChild(noise);
  setTimeout(() => noise.remove(), 450);

  // flash
  const flash = document.createElement('div');
  flash.className = 'ch-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 380);
}

/* ── Guide ── */
function openGuide() {
  state.guideOpen = true;
  el.guideOverlay.classList.add('open');
  state.guideFocusIdx = state.currentChIdx;
  renderGuideList();
  // focus search or first item
  setTimeout(() => {
    const items = el.guideList.querySelectorAll('.ch-item');
    if (items[state.guideFocusIdx]) {
      items[state.guideFocusIdx].focus();
    } else {
      el.guideSearch.focus();
    }
  }, 200);
}

function closeGuide() {
  state.guideOpen = false;
  el.guideOverlay.classList.remove('open');
}

function renderGuideList() {
  const query = state.searchQuery.toLowerCase();
  let channels = state.channels;

  if (state.guideTab === 'fav') {
    channels = channels.filter(c => state.favorites.includes(c.id));
  }

  if (query) {
    channels = channels.filter(c =>
      c.name.toLowerCase().includes(query) ||
      String(c.id).includes(query) ||
      (c.category || '').toLowerCase().includes(query)
    );
  }

  if (channels.length === 0) {
    el.guideList.innerHTML = `
      <div class="guide-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        <p>${state.guideTab === 'fav' ? '尚未新增最愛頻道' : '找不到頻道'}</p>
        <p class="guide-empty-hint">${state.guideTab === 'fav' ? '按星號加入最愛' : '試試其他關鍵字'}</p>
      </div>`;
    return;
  }

  const activeCh = state.channels[state.currentChIdx];
  el.guideList.innerHTML = channels.map((ch, i) => {
    const isActive = activeCh && ch.id === activeCh.id;
    const isFav = state.favorites.includes(ch.id);
    return `
      <div class="ch-item${isActive ? ' active' : ''}" 
           role="option" 
           aria-selected="${isActive}" 
           tabindex="0" 
           data-id="${ch.id}"
           data-idx="${state.channels.indexOf(ch)}">
        <span class="ch-num">${String(ch.id).padStart(2,'0')}</span>
        <div class="ch-avatar">${ch.emoji || '📺'}</div>
        <div class="ch-info">
          <div class="ch-name">${ch.name}</div>
          <div class="ch-sub">${ch.category || 'YouTube'}</div>
        </div>
        ${isActive ? `<div class="ch-now-playing"><span></span><span></span><span></span></div>` : ''}
        <div class="ch-actions">
          <button class="ch-action-btn fav-btn${isFav ? ' is-fav' : ''}" data-ch-id="${ch.id}" title="${isFav ? '移除最愛' : '加入最愛'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
          </button>
          <button class="ch-action-btn del-btn" data-ch-id="${ch.id}" title="刪除頻道">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  // Events on items
  el.guideList.querySelectorAll('.ch-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.fav-btn')) {
        const id = parseInt(e.target.closest('.fav-btn').dataset.chId, 10);
        toggleFavorite(id);
        return;
      }
      if (e.target.closest('.del-btn')) {
        const id = parseInt(e.target.closest('.del-btn').dataset.chId, 10);
        deleteChannel(id);
        return;
      }
      const realIdx = parseInt(item.dataset.idx, 10);
      loadChannel(realIdx);
      closeGuide();
    });

    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = item.nextElementSibling;
        if (next && next.classList.contains('ch-item')) next.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = item.previousElementSibling;
        if (prev && prev.classList.contains('ch-item')) prev.focus();
      }
    });
  });
}

function toggleFavorite(id) {
  if (state.favorites.includes(id)) {
    state.favorites = state.favorites.filter(f => f !== id);
    showToast('移除最愛');
  } else {
    state.favorites.push(id);
    showToast('加入最愛 ⭐');
  }
  saveFavorites();
  renderGuideList();
}

function deleteChannel(id) {
  const idx = state.channels.findIndex(c => c.id === id);
  if (idx < 0) return;
  const ch = state.channels[idx];
  state.channels.splice(idx, 1);
  saveChannels();
  showToast(`已刪除：${ch.name}`);
  renderGuideList();
}

/* ── Add Channel Modal ── */
function openAddModal() {
  state.addModalOpen = true;
  el.addModal.classList.add('open');
  el.inputChName.value = '';
  el.inputChId.value = '';
  el.inputChNum.value = '';
  setTimeout(() => el.inputChName.focus(), 200);
}

function closeAddModal() {
  state.addModalOpen = false;
  el.addModal.classList.remove('open');
}

function confirmAddChannel() {
  const name = el.inputChName.value.trim();
  const chId = el.inputChId.value.trim();
  const numVal = el.inputChNum.value.trim();

  if (!name) { showToast('請輸入頻道名稱'); el.inputChName.focus(); return; }
  if (!chId || !chId.startsWith('UC')) { showToast('頻道 ID 格式錯誤（應以 UC 開頭）'); el.inputChId.focus(); return; }

  // Auto-assign number
  let id;
  if (numVal) {
    id = parseInt(numVal, 10);
    if (state.channels.some(c => c.id === id)) {
      showToast(`頻道號碼 ${id} 已被使用`);
      return;
    }
  } else {
    id = state.channels.length > 0 ? Math.max(...state.channels.map(c => c.id)) + 1 : 1;
  }

  state.channels.push({ id, name, chId, emoji: '📺', category: '自訂' });
  state.channels.sort((a, b) => a.id - b.id);
  saveChannels();
  closeAddModal();
  showToast(`已新增：${name} (${id})`);
  renderGuideList();
}

/* ── Google TV Keycode Map ── */
// https://developer.android.com/reference/android/view/KeyEvent
const KEY_MAP = {
  // D-Pad
  ArrowLeft:       () => { if (!state.guideOpen && !state.addModalOpen) { prevChannel(); showHud(); showToolbar(); } },
  ArrowRight:      () => { if (!state.guideOpen && !state.addModalOpen) { nextChannel(); showHud(); showToolbar(); } },
  ArrowUp:         () => { if (!state.guideOpen && !state.addModalOpen) { prevVideo(); } },
  ArrowDown:       () => { if (!state.guideOpen && !state.addModalOpen) { nextVideo(); } },

  // Play/Pause media key
  MediaPlayPause:  () => togglePlayPause(),
  MediaPlay:       () => { if (state.playerReady) state.player.playVideo(); },
  MediaPause:      () => { if (state.playerReady) state.player.pauseVideo(); },
  MediaStop:       () => { if (state.playerReady) state.player.stopVideo(); },

  // Channel keys
  ChannelUp:       () => { nextChannel(); showHud(); showToolbar(); },
  ChannelDown:     () => { prevChannel(); showHud(); showToolbar(); },

  // Fast fwd / Rewind
  MediaFastForward: () => nextChannel(),
  MediaRewind:      () => prevChannel(),
  MediaTrackNext:   () => nextVideo(),
  MediaTrackPrevious: () => prevVideo(),

  // Color keys (Google TV / Android TV)
  ColorF0Red:    () => randomChannel(),           // Red  = Random
  ColorF1Green:  () => toggleGuide(),             // Green = Guide
  ColorF2Yellow: () => toggleCrt(),               // Yellow = CRT
  ColorF3Blue:   () => toggleSubtitles(),         // Blue = Subtitles

  // Back
  Escape:        () => handleBack(),
  GoBack:        () => handleBack(),
  BrowserBack:   () => handleBack(),

  // OK/Enter is handled per context (guide vs default)
  Enter:         () => handleEnter(),

  // Fullscreen
  KeyF:          () => toggleFullscreen(),

  // True TV toggle (home hold - approximate with T key)
  KeyT:          () => toggleTrueTv(),
};

function toggleGuide() {
  if (state.guideOpen) closeGuide();
  else openGuide();
}

function handleBack() {
  if (state.addModalOpen) { closeAddModal(); return; }
  if (state.guideOpen) { closeGuide(); return; }
  if (el.osdCrt.classList.contains('show')) { el.osdCrt.classList.remove('show'); return; }
  // hide hud/toolbar
  el.hudTop.classList.remove('visible');
  el.toolbar.classList.remove('visible');
}

function handleEnter() {
  if (!state.guideOpen && !state.addModalOpen) {
    togglePlayPause();
  }
}

/* ── Keyboard listener ── */
document.addEventListener('keydown', e => {
  // Number keys
  if (/^Digit(\d)$/.test(e.code)) {
    const digit = e.code.replace('Digit', '');
    handleNumInput(digit);
    return;
  }
  if (/^Numpad(\d)$/.test(e.code)) {
    const digit = e.code.replace('Numpad', '');
    handleNumInput(digit);
    return;
  }

  // Mapped keys
  const fn = KEY_MAP[e.key] || KEY_MAP[e.code];
  if (fn) {
    e.preventDefault();
    fn();
  }

  // Space = play/pause (when not typing in an input)
  if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    togglePlayPause();
  }

  // Show toolbar on any key activity
  if (!state.guideOpen && !state.addModalOpen) {
    showToolbar();
    showHud();
  }
});

/* ── Touch/mouse activity → show toolbar ── */
document.addEventListener('mousemove', () => { showToolbar(4000); showHud(4000); });
document.addEventListener('touchstart', () => { showToolbar(5000); showHud(5000); });

/* ── Button events ── */
el.btnOpenGuide.addEventListener('click', openGuide);
el.btnGuide.addEventListener('click', openGuide);
el.btnCloseGuide.addEventListener('click', closeGuide);
el.btnRandom.addEventListener('click', randomChannel);
el.btnSubtitle.addEventListener('click', toggleSubtitles);
el.btnCrt.addEventListener('click', () => { toggleCrt(); });
el.btnFullscreen.addEventListener('click', toggleFullscreen);
el.btnPlayPause.addEventListener('click', togglePlayPause);
el.btnPrevCh.addEventListener('click', () => { prevChannel(); showToolbar(); });
el.btnNextCh.addEventListener('click', () => { nextChannel(); showToolbar(); });
el.btnPrevVid.addEventListener('click', () => { prevVideo(); showToolbar(); });
el.btnNextVid.addEventListener('click', () => { nextVideo(); showToolbar(); });

el.btnAddChannel.addEventListener('click', openAddModal);
el.btnCloseModal.addEventListener('click', closeAddModal);
el.btnCancelModal.addEventListener('click', closeAddModal);
el.btnConfirmAdd.addEventListener('click', confirmAddChannel);

// Guide tabs
el.tabAll.addEventListener('click', () => {
  state.guideTab = 'all';
  el.tabAll.classList.add('active');
  el.tabFav.classList.remove('active');
  renderGuideList();
});
el.tabFav.addEventListener('click', () => {
  state.guideTab = 'fav';
  el.tabFav.classList.add('active');
  el.tabAll.classList.remove('active');
  renderGuideList();
});

// Guide search
el.guideSearch.addEventListener('input', e => {
  state.searchQuery = e.target.value;
  renderGuideList();
});

// Close guide when clicking backdrop
el.guideOverlay.addEventListener('click', e => {
  if (e.target === el.guideOverlay) closeGuide();
});

// Close modal when clicking backdrop
el.addModal.addEventListener('click', e => {
  if (e.target === el.addModal) closeAddModal();
});

// Modal enter key
el.inputChId.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmAddChannel();
});
el.inputChName.addEventListener('keydown', e => {
  if (e.key === 'Enter') el.inputChId.focus();
});

// CRT slider
el.crtSlider.addEventListener('input', e => {
  state.crtIntensity = parseInt(e.target.value, 10);
  el.crtVal.textContent = `${state.crtIntensity}%`;
  if (state.crtEnabled) updateCrtEffect();
});

/* ── Init ── */
function init() {
  state.channels = loadChannels();
  state.favorites = loadFavorites();
  loadYTAPI();
  renderGuideList();

  // Initial welcome
  el.welcomeScreen.style.display = 'flex';
  el.ytContainer.style.display = 'none';
  el.btnOpenGuide.focus();
}

init();
