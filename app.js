/* ============================================================
   盲轉TV — Google TV Edition  |  app.js
   Uses YouTube Data API v3 to fetch video IDs, then plays
   individual videos via IFrame API (avoids playlist autoplay block)
   ============================================================ */

'use strict';

const YT_API_KEY = 'AIzaSyDgLq9sKuA6MbFIumNqTXnpIwXwNob--hU';
const MAX_RESULTS = 20; // videos to fetch per channel

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
  videoCache: {},       // chId -> [{ videoId, title }]
  player: null,
  playerReady: false,
  isPlaying: false,
  crtEnabled: false,
  crtIntensity: 40,
  truetvMode: false,
  subtitlesOn: false,
  guideOpen: false,
  addModalOpen: false,
  guideTab: 'all',
  searchQuery: '',
  favorites: [],
  numBuffer: '',
  numTimer: null,
  osdChTimer: null,
  hudTimer: null,
  toolbarTimer: null,
  crtOsdTimer: null,
  toastTimer: null,
};

/* ── In-memory store ── */
const _mem = {};
const store = {
  getItem(k)    { return _mem[k] || null; },
  setItem(k, v) { _mem[k] = v; }
};

const STORAGE_KEY = 'blindtv_channels_v2';
const FAV_KEY     = 'blindtv_favorites_v2';

function loadChannels() {
  try { const r = store.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch(e) {}
  return DEFAULT_CHANNELS.map(c => ({ ...c }));
}
function saveChannels()   { store.setItem(STORAGE_KEY, JSON.stringify(state.channels)); }
function loadFavorites()  { try { const r = store.getItem(FAV_KEY); if (r) return JSON.parse(r); } catch(e) {} return []; }
function saveFavorites()  { store.setItem(FAV_KEY, JSON.stringify(state.favorites)); }

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
  const n = new Date();
  el.hudTime.textContent = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}
setInterval(updateClock, 10000);
updateClock();

/* ── YouTube Data API v3 ── */
async function fetchChannelVideos(chId) {
  if (state.videoCache[chId]) return state.videoCache[chId];

  // UC... → UU... uploads playlist
  const uploadsId = chId.replace(/^UC/, 'UU');
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=${MAX_RESULTS}&key=${YT_API_KEY}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      console.warn('YT API error:', data.error?.message);
      return [];
    }
    const videos = (data.items || [])
      .filter(i => i.snippet?.resourceId?.videoId)
      .map(i => ({
        videoId: i.snippet.resourceId.videoId,
        title:   i.snippet.title,
      }));
    state.videoCache[chId] = videos;
    return videos;
  } catch(e) {
    console.warn('fetch error:', e);
    return [];
  }
}

/* ── YouTube IFrame API ── */
window.onYouTubeIframeAPIReady = function() {
  state.player = new YT.Player('ytPlayer', {
    height: '100%',
    width:  '100%',
    playerVars: {
      autoplay:        1,
      controls:        0,
      rel:             0,
      modestbranding:  1,
      iv_load_policy:  3,
      cc_load_policy:  0,
      fs:              0,
      playsinline:     1,
      enablejsapi:     1,
      origin:          window.location.origin || 'https://yuenchun94.github.io',
    },
    events: {
      onReady:       onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError:       onPlayerError,
    }
  });
};

function loadYTAPI() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

function onPlayerReady() {
  state.playerReady = true;
  // auto-load first channel
  if (state.channels.length > 0) loadChannel(0);
}

function onPlayerStateChange(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    state.isPlaying = true;
    updatePlayBtn();
    try {
      const d = state.player.getVideoData();
      if (d?.title) el.hudVidTitle.textContent = d.title;
    } catch(_) {}
  } else if (e.data === S.PAUSED) {
    state.isPlaying = false;
    updatePlayBtn();
  } else if (e.data === S.ENDED) {
    state.isPlaying = false;
    updatePlayBtn();
    setTimeout(() => nextVideo(), 1200);
  }
}

function onPlayerError() {
  // skip broken video
  setTimeout(() => nextVideo(), 800);
}

function updatePlayBtn() {
  el.iconPlay.style.display  = state.isPlaying ? 'none'  : 'block';
  el.iconPause.style.display = state.isPlaying ? 'block' : 'none';
  el.tbPlayLabel.textContent = state.isPlaying ? '暫停' : '播放';
}

/* ── Load Channel ── */
async function loadChannel(idx, vidIdx) {
  if (!state.channels.length) return;
  idx = ((idx % state.channels.length) + state.channels.length) % state.channels.length;
  state.currentChIdx = idx;

  const ch = state.channels[idx];
  showChannelFlash();
  showOsdCh(ch);
  updateHud(ch, '載入中...');
  el.welcomeScreen.style.display = 'none';
  el.ytContainer.style.display   = 'block';

  // Fetch video list
  showToast(`${ch.emoji || '📺'} ${ch.name} 載入中...`, 2000);
  const videos = await fetchChannelVideos(ch.chId);

  if (!videos.length) {
    showToast('此頻道暫時無影片可播');
    return;
  }

  // pick video index
  if (vidIdx === undefined) vidIdx = 0;
  vidIdx = ((vidIdx % videos.length) + videos.length) % videos.length;
  state.currentVidIdx = vidIdx;

  const vid = videos[vidIdx];
  playVideoId(vid.videoId, vid.title, ch);
  renderGuideList();
}

function playVideoId(videoId, title, ch) {
  if (!state.playerReady || !state.player) return;
  try {
    state.player.loadVideoById({ videoId, suggestedQuality: 'hd720' });
    state.isPlaying = true;
    updatePlayBtn();
    if (title) updateHud(ch || state.channels[state.currentChIdx], title);
  } catch(e) {
    console.warn('playVideoId error:', e);
  }
}

function updateHud(ch, vidTitle) {
  el.hudChNum.textContent  = String(ch.id).padStart(2,'0');
  el.hudChName.textContent = ch.name;
  if (vidTitle) el.hudVidTitle.textContent = vidTitle;
  showHud();
  showToolbar();
}

/* ── Navigation ── */
function nextChannel() { loadChannel(state.currentChIdx + 1); }
function prevChannel() { loadChannel(state.currentChIdx - 1); }

async function nextVideo() {
  const ch     = state.channels[state.currentChIdx];
  const videos = await fetchChannelVideos(ch.chId);
  if (!videos.length) return;
  const idx = (state.currentVidIdx + 1) % videos.length;
  state.currentVidIdx = idx;
  const vid = videos[idx];
  playVideoId(vid.videoId, vid.title, ch);
  showHud(); showToolbar();
}

async function prevVideo() {
  const ch     = state.channels[state.currentChIdx];
  const videos = await fetchChannelVideos(ch.chId);
  if (!videos.length) return;
  const idx = (state.currentVidIdx - 1 + videos.length) % videos.length;
  state.currentVidIdx = idx;
  const vid = videos[idx];
  playVideoId(vid.videoId, vid.title, ch);
  showHud(); showToolbar();
}

function gotoChannel(num) {
  const idx = state.channels.findIndex(c => c.id === num);
  if (idx >= 0) loadChannel(idx);
  else showToast(`頻道 ${num} 不存在`);
}

function randomChannel() {
  if (!state.channels.length) return;
  let idx;
  do { idx = Math.floor(Math.random() * state.channels.length); }
  while (idx === state.currentChIdx && state.channels.length > 1);
  loadChannel(idx);
  showToast('🎲 隨機轉台');
}

/* ── Play / Pause ── */
function togglePlayPause() {
  if (!state.playerReady || !state.player) return;
  try {
    const s = state.player.getPlayerState();
    if (s === 1) state.player.pauseVideo();
    else          state.player.playVideo();
  } catch(e) {}
  showHud(); showToolbar();
}

/* ── Subtitles ── */
function toggleSubtitles() {
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

/* ── CRT ── */
function updateCrtEffect() {
  const v = state.crtEnabled ? state.crtIntensity / 100 : 0;
  document.documentElement.style.setProperty('--crt-opacity', v);
}
function toggleCrt() {
  state.crtEnabled = !state.crtEnabled;
  updateCrtEffect();
  showCrtOsd();
  el.btnCrt.classList.toggle('active', state.crtEnabled);
  showToast(state.crtEnabled ? `📺 CRT ${state.crtIntensity}%` : 'CRT 關');
}
function showCrtOsd() {
  el.osdCrt.classList.add('show');
  clearTimeout(state.crtOsdTimer);
  state.crtOsdTimer = setTimeout(() => el.osdCrt.classList.remove('show'), 3000);
}

/* ── True TV ── */
function toggleTrueTv() {
  state.truetvMode = !state.truetvMode;
  showToast(state.truetvMode ? '📺 真電視模式 開' : '真電視模式 關');
}

/* ── Fullscreen ── */
function toggleFullscreen() {
  showToast('全螢幕：請按遙控器全螢幕鍵');
}

/* ── HUD / Toolbar ── */
function showHud(dur = 4000) {
  el.hudTop.classList.add('visible');
  clearTimeout(state.hudTimer);
  if (dur > 0) state.hudTimer = setTimeout(() => el.hudTop.classList.remove('visible'), dur);
}
function showToolbar(dur = 5000) {
  el.toolbar.classList.add('visible');
  clearTimeout(state.toolbarTimer);
  if (dur > 0) state.toolbarTimer = setTimeout(() => el.toolbar.classList.remove('visible'), dur);
}

/* ── OSD ── */
function showOsdCh(ch) {
  el.osdChNum.textContent = String(ch.id).padStart(2,'0');
  el.osdChName.textContent = ch.name;
  el.osdChBarFill.style.width = '0%';
  el.osdCh.classList.add('show');
  clearTimeout(state.osdChTimer);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.osdChBarFill.style.width = '100%';
  }));
  state.osdChTimer = setTimeout(() => el.osdCh.classList.remove('show'), 3000);
}

function showToast(msg, dur = 2500) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), dur);
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

/* ── Channel Flash ── */
function showChannelFlash() {
  const noise = document.createElement('div');
  noise.className = 'static-noise';
  document.body.appendChild(noise);
  setTimeout(() => noise.remove(), 450);

  const flash = document.createElement('div');
  flash.className = 'ch-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 380);
}

/* ── Guide ── */
function openGuide() {
  state.guideOpen = true;
  el.guideOverlay.classList.add('open');
  renderGuideList();
  setTimeout(() => {
    const items = el.guideList.querySelectorAll('.ch-item');
    const target = items[state.currentChIdx] || items[0];
    if (target) target.focus();
  }, 200);
}
function closeGuide() {
  state.guideOpen = false;
  el.guideOverlay.classList.remove('open');
}
function toggleGuide() { state.guideOpen ? closeGuide() : openGuide(); }

function renderGuideList() {
  const q = state.searchQuery.toLowerCase();
  let chs = state.channels;
  if (state.guideTab === 'fav') chs = chs.filter(c => state.favorites.includes(c.id));
  if (q) chs = chs.filter(c => c.name.toLowerCase().includes(q) || String(c.id).includes(q) || (c.category||'').toLowerCase().includes(q));

  if (!chs.length) {
    el.guideList.innerHTML = `
      <div class="guide-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        <p>${state.guideTab === 'fav' ? '尚未加入最愛' : '找不到頻道'}</p>
        <p class="guide-empty-hint">${state.guideTab === 'fav' ? '按星號加入' : '試試其他關鍵字'}</p>
      </div>`;
    return;
  }

  const activeCh = state.channels[state.currentChIdx];
  el.guideList.innerHTML = chs.map(ch => {
    const isActive = activeCh?.id === ch.id;
    const isFav    = state.favorites.includes(ch.id);
    const realIdx  = state.channels.indexOf(ch);
    return `
      <div class="ch-item${isActive ? ' active' : ''}" role="option" aria-selected="${isActive}" tabindex="0" data-id="${ch.id}" data-idx="${realIdx}">
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

  el.guideList.querySelectorAll('.ch-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.fav-btn')) { toggleFavorite(parseInt(e.target.closest('.fav-btn').dataset.chId, 10)); return; }
      if (e.target.closest('.del-btn')) { deleteChannel(parseInt(e.target.closest('.del-btn').dataset.chId, 10)); return; }
      loadChannel(parseInt(item.dataset.idx, 10));
      closeGuide();
    });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); item.nextElementSibling?.focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); item.previousElementSibling?.focus(); }
    });
  });
}

function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter(f => f !== id)
    : [...state.favorites, id];
  saveFavorites();
  showToast(state.favorites.includes(id) ? '加入最愛 ⭐' : '移除最愛');
  renderGuideList();
}

function deleteChannel(id) {
  const ch = state.channels.find(c => c.id === id);
  if (!ch) return;
  state.channels = state.channels.filter(c => c.id !== id);
  saveChannels();
  showToast(`已刪除：${ch.name}`);
  renderGuideList();
}

/* ── Add Channel Modal ── */
function openAddModal()  { state.addModalOpen = true;  el.addModal.classList.add('open');    el.inputChName.value = el.inputChId.value = el.inputChNum.value = ''; setTimeout(() => el.inputChName.focus(), 200); }
function closeAddModal() { state.addModalOpen = false; el.addModal.classList.remove('open'); }

function confirmAddChannel() {
  const name  = el.inputChName.value.trim();
  const chId  = el.inputChId.value.trim();
  const numV  = el.inputChNum.value.trim();
  if (!name)                           { showToast('請輸入頻道名稱'); el.inputChName.focus(); return; }
  if (!chId || !chId.startsWith('UC')) { showToast('頻道 ID 需以 UC 開頭'); el.inputChId.focus(); return; }
  let id = numV ? parseInt(numV, 10) : Math.max(0, ...state.channels.map(c => c.id)) + 1;
  if (state.channels.some(c => c.id === id)) { showToast(`號碼 ${id} 已被使用`); return; }
  state.channels.push({ id, name, chId, emoji: '📺', category: '自訂' });
  state.channels.sort((a, b) => a.id - b.id);
  saveChannels();
  closeAddModal();
  showToast(`已新增：${name} (${id})`);
  renderGuideList();
}

/* ── Keyboard ── */
const KEY_MAP = {
  ArrowLeft:          () => { if (!state.guideOpen && !state.addModalOpen) { prevChannel(); showHud(); showToolbar(); } },
  ArrowRight:         () => { if (!state.guideOpen && !state.addModalOpen) { nextChannel(); showHud(); showToolbar(); } },
  ArrowUp:            () => { if (!state.guideOpen && !state.addModalOpen) prevVideo(); },
  ArrowDown:          () => { if (!state.guideOpen && !state.addModalOpen) nextVideo(); },
  MediaPlayPause:     () => togglePlayPause(),
  MediaPlay:          () => state.playerReady && state.player.playVideo(),
  MediaPause:         () => state.playerReady && state.player.pauseVideo(),
  MediaStop:          () => state.playerReady && state.player.stopVideo(),
  ChannelUp:          () => { nextChannel(); showHud(); showToolbar(); },
  ChannelDown:        () => { prevChannel(); showHud(); showToolbar(); },
  MediaFastForward:   () => nextChannel(),
  MediaRewind:        () => prevChannel(),
  MediaTrackNext:     () => nextVideo(),
  MediaTrackPrevious: () => prevVideo(),
  ColorF0Red:         () => randomChannel(),
  ColorF1Green:       () => toggleGuide(),
  ColorF2Yellow:      () => toggleCrt(),
  ColorF3Blue:        () => toggleSubtitles(),
  Escape:             () => handleBack(),
  GoBack:             () => handleBack(),
  BrowserBack:        () => handleBack(),
  Enter:              () => { if (!state.guideOpen && !state.addModalOpen) togglePlayPause(); },
  KeyF:               () => toggleFullscreen(),
  KeyT:               () => toggleTrueTv(),
  KeyR:               () => { if (!state.guideOpen && !state.addModalOpen) randomChannel(); },
  KeyC:               () => { if (!state.guideOpen && !state.addModalOpen) toggleGuide(); },
};

function handleBack() {
  if (state.addModalOpen) { closeAddModal(); return; }
  if (state.guideOpen)    { closeGuide(); return; }
  if (el.osdCrt.classList.contains('show')) { el.osdCrt.classList.remove('show'); return; }
  el.hudTop.classList.remove('visible');
  el.toolbar.classList.remove('visible');
}

document.addEventListener('keydown', e => {
  if (/^Digit(\d)$/.test(e.code) && document.activeElement.tagName !== 'INPUT') {
    handleNumInput(e.code.replace('Digit',''));
    return;
  }
  if (/^Numpad(\d)$/.test(e.code) && document.activeElement.tagName !== 'INPUT') {
    handleNumInput(e.code.replace('Numpad',''));
    return;
  }
  const fn = KEY_MAP[e.key] || KEY_MAP[e.code];
  if (fn) { e.preventDefault(); fn(); return; }
  if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); togglePlayPause(); }
  if (!state.guideOpen && !state.addModalOpen) { showToolbar(); showHud(); }
});

document.addEventListener('mousemove',  () => { showToolbar(4000); showHud(4000); });
document.addEventListener('touchstart', () => { showToolbar(5000); showHud(5000); });

/* ── Button Events ── */
el.btnOpenGuide.addEventListener('click',  openGuide);
el.btnGuide.addEventListener('click',      openGuide);
el.btnCloseGuide.addEventListener('click', closeGuide);
el.btnRandom.addEventListener('click',     randomChannel);
el.btnSubtitle.addEventListener('click',   toggleSubtitles);
el.btnCrt.addEventListener('click',        toggleCrt);
el.btnFullscreen.addEventListener('click', toggleFullscreen);
el.btnPlayPause.addEventListener('click',  togglePlayPause);
el.btnPrevCh.addEventListener('click',  () => { prevChannel(); showToolbar(); });
el.btnNextCh.addEventListener('click',  () => { nextChannel(); showToolbar(); });
el.btnPrevVid.addEventListener('click', () => { prevVideo();   showToolbar(); });
el.btnNextVid.addEventListener('click', () => { nextVideo();   showToolbar(); });

el.btnAddChannel.addEventListener('click',  openAddModal);
el.btnCloseModal.addEventListener('click',  closeAddModal);
el.btnCancelModal.addEventListener('click', closeAddModal);
el.btnConfirmAdd.addEventListener('click',  confirmAddChannel);

el.tabAll.addEventListener('click', () => { state.guideTab = 'all'; el.tabAll.classList.add('active'); el.tabFav.classList.remove('active'); renderGuideList(); });
el.tabFav.addEventListener('click', () => { state.guideTab = 'fav'; el.tabFav.classList.add('active'); el.tabAll.classList.remove('active'); renderGuideList(); });

el.guideSearch.addEventListener('input', e => { state.searchQuery = e.target.value; renderGuideList(); });
el.guideOverlay.addEventListener('click', e => { if (e.target === el.guideOverlay) closeGuide(); });
el.addModal.addEventListener('click', e => { if (e.target === el.addModal) closeAddModal(); });
el.inputChId.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddChannel(); });
el.inputChName.addEventListener('keydown', e => { if (e.key === 'Enter') el.inputChId.focus(); });

el.crtSlider.addEventListener('input', e => {
  state.crtIntensity = parseInt(e.target.value, 10);
  el.crtVal.textContent = `${state.crtIntensity}%`;
  if (state.crtEnabled) updateCrtEffect();
});

/* ── Init ── */
function init() {
  state.channels  = loadChannels();
  state.favorites = loadFavorites();
  loadYTAPI();
  renderGuideList();
  el.welcomeScreen.style.display = 'flex';
  el.ytContainer.style.display   = 'none';
  el.btnOpenGuide.focus();
}

init();
