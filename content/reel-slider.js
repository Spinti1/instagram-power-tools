/**
 * IG Tools - Interactive Reels Video Slider, Scrubber & Volume Controller
 * Body-anchored, zero-clipping, high z-index video controls that render
 * directly ON TOP of the active Reel video, with instant mouse seeking,
 * volume wheel control, and removal of Instagram's built-in audio button.
 */

window.IGTools = window.IGTools || {};

window.IGTools.reelSlider = (() => {
  const LOG_PREFIX = '[IG Tools] [ReelSlider]';

  if (window.self !== window.top) {
    return {
      init: () => {},
      scanAndAttachSliders: () => {}
    };
  }

  let isInitialized = false;
  let isEnabled = true;
  let volumeHudTimer = null;
  let activeVideo = null;
  let boundVideo = null;
  let timeupdateHandler = null;
  let playHandler = null;
  let pauseHandler = null;
  let volumeHandler = null;
  let isSeeking = false;
  let seekLockTimer = null;
  let currentPlaybackRate = 1;

  const SVG_PLAY = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
  `;

  const SVG_PAUSE = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"></rect>
      <rect x="14" y="4" width="4" height="16"></rect>
    </svg>
  `;

  const SVG_VOLUME_HIGH = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>
    </svg>
  `;

  const SVG_VOLUME_MUTED = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path>
    </svg>
  `;

  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getVideoDuration(video) {
    if (!video) return 0;
    if (typeof video.duration === 'number' && isFinite(video.duration) && !isNaN(video.duration) && video.duration > 0) {
      return video.duration;
    }
    if (video.dataset?.igDuration) {
      const d = parseFloat(video.dataset.igDuration);
      if (!isNaN(d) && isFinite(d) && d > 0) return d;
    }
    if (document.documentElement.dataset?.igToolsActiveDuration) {
      const d = parseFloat(document.documentElement.dataset.igToolsActiveDuration);
      if (!isNaN(d) && isFinite(d) && d > 0) return d;
    }
    try {
      if (video.seekable && video.seekable.length > 0) {
        const end = video.seekable.end(video.seekable.length - 1);
        if (isFinite(end) && !isNaN(end) && end > 0) return end;
      }
    } catch (e) {}
    try {
      if (video.buffered && video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        if (isFinite(end) && !isNaN(end) && end > 0) return end;
      }
    } catch (e) {}
    if (video.currentTime && isFinite(video.currentTime) && video.currentTime > 0) {
      return Math.max(video.currentTime, 15);
    }
    return 0;
  }

  function getSavedVolume() {
    try {
      const saved = localStorage.getItem('ig_tools_volume');
      if (saved !== null) {
        const v = parseFloat(saved);
        if (!isNaN(v) && v >= 0 && v <= 1) return v;
      }
    } catch (e) {}
    return null;
  }

  function getSavedMuted() {
    try {
      const saved = localStorage.getItem('ig_tools_muted');
      if (saved !== null) return saved === 'true';
    } catch (e) {}
    return null;
  }

  function enforceAudioState(video) {
    if (!video || !video.isConnected) return;
    const vol = getSavedVolume();
    const effectiveVol = (vol !== null && vol > 0) ? vol : 0.7;
    const isMuted = getSavedMuted();

    if (isMuted === false) {
      if (video.muted) {
        video.muted = false;
      }
      if (video.volume === 0) {
        video.volume = effectiveVol;
      }
    } else if (isMuted === true) {
      if (!video.muted) {
        video.muted = true;
      }
    } else if (vol !== null) {
      video.volume = vol;
      video.muted = (vol === 0);
    }
  }

  function applySavedVolume(video) {
    enforceAudioState(video);
  }

  function triggerNativeAudioButton(targetVideo) {
    if (!targetVideo) return;
    const vRect = targetVideo.getBoundingClientRect();
    const elements = document.querySelectorAll('button, div[role="button"], span[role="button"]');
    for (const el of elements) {
      if (el.closest('#ig-tools-active-reel-slider') || el.closest('#ig-tools-auto-friends-card')) continue;
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const isAudio =
        aria.includes('audio') || aria.includes('sound') || aria.includes('mute') ||
        aria.includes('sunet') || aria.includes('volum') || aria.includes('volume') ||
        aria.includes('piesă') || aria.includes('comut') ||
        title.includes('audio') || title.includes('sound') || title.includes('mute');

      const rect = el.getBoundingClientRect();
      const isNearVideo =
        (rect.width > 0 && rect.bottom >= vRect.top - 20 && rect.top <= vRect.bottom + 60 &&
         rect.right >= vRect.left - 20 && rect.left <= vRect.right + 60) ||
        el.getAttribute('data-ig-tools-hidden-audio') === 'true';

      if (isAudio && isNearVideo) {
        try {
          el.click();
          return;
        } catch (e) {}
      }
    }
  }

  function applySeek(video, targetTime) {
    if (!video || !isFinite(targetTime) || targetTime < 0) return;
    try {
      video.currentTime = targetTime;
    } catch (e) {
      try {
        if (typeof video.fastSeek === 'function') video.fastSeek(targetTime);
      } catch (err) {}
    }
  }

  function showVolumeHud(video, volume) {
    let hud = document.getElementById('ig-tools-global-volume-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'ig-tools-global-volume-hud';
      hud.className = 'ig-tools-volume-hud';
      document.body.appendChild(hud);
    }

    if (video && video.isConnected) {
      const rect = video.getBoundingClientRect();
      hud.style.position = 'fixed';
      hud.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
      hud.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      hud.style.transform = 'translate(-50%, -50%)';
      hud.style.zIndex = '2147483647';
    }

    const pct = Math.round(volume * 100);
    const icon = pct === 0 ? '🔇' : pct < 45 ? '🔉' : '🔊';

    hud.innerHTML = `
      <div class="ig-tools-volume-hud-content">
        <span class="ig-tools-volume-hud-icon">${icon}</span>
        <div class="ig-tools-volume-hud-bar-wrap">
          <div class="ig-tools-volume-hud-fill" style="width: ${pct}%;"></div>
        </div>
        <span class="ig-tools-volume-hud-text">${pct}%</span>
      </div>
    `;

    hud.classList.add('visible');

    if (volumeHudTimer) clearTimeout(volumeHudTimer);
    volumeHudTimer = setTimeout(() => {
      hud.classList.remove('visible');
    }, 1100);
  }

  function handleReelWheel(e, video) {
    if (!video || e.deltaY === 0) return;
    e.preventDefault();
    e.stopPropagation();

    const isUp = e.deltaY < 0;
    const curVol = video.volume;

    let step;
    if (isUp) {
      step = curVol < 0.05 ? 0.01 : 0.02;
    } else {
      step = curVol <= 0.05 ? 0.01 : 0.02;
    }

    let newVol = isUp ? curVol + step : curVol - step;
    newVol = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));

    video.volume = newVol;
    if (newVol > 0 && video.muted) {
      video.muted = false;
    } else if (newVol === 0) {
      video.muted = true;
    }

    try {
      localStorage.setItem('ig_tools_volume', String(newVol));
      localStorage.setItem('ig_tools_muted', newVol === 0 ? 'true' : 'false');
    } catch (err) {}

    showVolumeHud(video, newVol);
    syncSliderAudioState();
  }

  /**
   * Actively hides Instagram's built-in audio / mute controls across Reels.
   */
  function hideNativeAudioControls() {
    const isExcluded =
      location.pathname.startsWith('/direct') ||
      location.pathname.includes('/direct/') ||
      location.pathname.startsWith('/stories');
    if (isExcluded) return;

    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (!isReelOrPostVideo(video)) return;
      const vRect = video.getBoundingClientRect();
      if (vRect.width < 50 || vRect.height < 50) return;

      // Scan all buttons on page overlapping the video's bottom-right corner or container
      const elements = document.querySelectorAll('button, div[role="button"], span[role="button"]');
      elements.forEach((el) => {
        if (el.closest('#ig-tools-active-reel-slider') || el.closest('#ig-tools-auto-friends-card')) return;

        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const isAudioAria =
          aria.includes('audio') || aria.includes('sound') || aria.includes('mute') ||
          aria.includes('sunet') || aria.includes('volum') || aria.includes('volume') ||
          aria.includes('piesă') || aria.includes('comut') ||
          title.includes('audio') || title.includes('sound') || title.includes('mute');

        const rect = el.getBoundingClientRect();
        // Check if button is in bottom-right zone of video (within 90px of bottom and 90px of right of video)
        const isBottomRightZone =
          rect.width >= 16 && rect.width <= 75 &&
          rect.height >= 16 && rect.height <= 75 &&
          rect.bottom >= vRect.bottom - 85 && rect.bottom <= vRect.bottom + 25 &&
          rect.right >= vRect.right - 85 && rect.right <= vRect.right + 25;

        const hasSpeakerSvg = Boolean(el.querySelector('svg'));

        if (isAudioAria || (isBottomRightZone && hasSpeakerSvg)) {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.setAttribute('data-ig-tools-hidden-audio', 'true');
        }
      });
    });
  }

  /**
   * Retrieves or creates the single body-anchored persistent slider.
   */
  function getOrCreateActiveSlider() {
    let slider = document.getElementById('ig-tools-active-reel-slider');
    if (!slider) {
      if (!document.body) return null;
      slider = document.createElement('div');
      slider.id = 'ig-tools-active-reel-slider';
      slider.className = 'ig-tools-reel-slider-bar';
      slider.setAttribute('role', 'region');
      slider.setAttribute('aria-label', 'Reel Video Controls');

      slider.innerHTML = `
        <div class="ig-tools-slider-expanded-controls">
          <button class="ig-tools-slider-play-btn" title="Play / Pause (Space)">
            ${SVG_PLAY}
          </button>

          <button class="ig-tools-slider-step-btn" data-step="-5" title="Rewind 5s (←)">
            -5s
          </button>

          <div class="ig-tools-slider-range-box" title="Click or drag to seek">
            <div class="ig-tools-slider-track-bg"></div>
            <div class="ig-tools-slider-fill"></div>
            <input type="range" class="ig-tools-slider-input" min="0" max="100" step="0.05" value="0" />
          </div>

          <button class="ig-tools-slider-step-btn" data-step="5" title="Forward 5s (→)">
            +5s
          </button>

          <span class="ig-tools-slider-time-label">0:00 / 0:00</span>

          <button class="ig-tools-slider-speed-badge" title="Playback Speed">1x</button>

          <button class="ig-tools-slider-mute-btn" title="Mute / Unmute">
            ${SVG_VOLUME_HIGH}
          </button>
        </div>
      `;

      // Isolate events on slider so clicking controls NEVER triggers Instagram play/pause or navigation
      const stopEvents = [
        'mousedown', 'mouseup', 'click', 'dblclick',
        'pointerdown', 'pointerup', 'pointermove',
        'touchstart', 'touchend', 'touchmove'
      ];
      stopEvents.forEach((evtType) => {
        slider.addEventListener(evtType, (e) => {
          e.stopPropagation();
        }, false);
      });

      setupSliderInteraction(slider);
      document.body.appendChild(slider);
    }
    return slider;
  }

  let rateHandler = null;

  function syncSliderAudioState() {
    const slider = document.getElementById('ig-tools-active-reel-slider');
    if (!slider) return;
    const targetVideo = boundVideo || activeVideo;
    if (!targetVideo) return;
    const muteBtn = slider.querySelector('.ig-tools-slider-mute-btn');
    if (!muteBtn) return;
    const isMuted = Boolean(targetVideo.muted || targetVideo.volume === 0);
    const expectedSvg = isMuted ? SVG_VOLUME_MUTED : SVG_VOLUME_HIGH;
    const stateStr = isMuted ? 'muted' : 'unmuted';
    muteBtn.dataset.state = stateStr;
    muteBtn.innerHTML = expectedSvg;
    if (isMuted) {
      muteBtn.classList.remove('is-active');
      muteBtn.setAttribute('title', 'Sound: MUTED (Click to unmute and keep active)');
    } else {
      muteBtn.classList.add('is-active');
      muteBtn.setAttribute('title', 'Sound: ON (Active across scroll - click to mute)');
    }
  }

  function syncSpeedBadge() {
    const slider = document.getElementById('ig-tools-active-reel-slider');
    if (!slider) return;
    const speedBtn = slider.querySelector('.ig-tools-slider-speed-badge');
    if (!speedBtn) return;
    const text = `${currentPlaybackRate}x`;
    if (speedBtn.textContent !== text) {
      speedBtn.textContent = text;
    }
  }

  function setupSliderInteraction(slider) {
    const playBtn = slider.querySelector('.ig-tools-slider-play-btn');
    const rangeFill = slider.querySelector('.ig-tools-slider-fill');
    const rangeBox = slider.querySelector('.ig-tools-slider-range-box');
    const rangeInput = slider.querySelector('.ig-tools-slider-input');
    const timeLabel = slider.querySelector('.ig-tools-slider-time-label');
    const speedBtn = slider.querySelector('.ig-tools-slider-speed-badge');
    const stepBtns = slider.querySelectorAll('.ig-tools-slider-step-btn');
    const muteBtn = slider.querySelector('.ig-tools-slider-mute-btn');

    // 1. Play / Pause
    const togglePlay = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetVid = boundVideo || activeVideo;
      if (!targetVid) return;
      if (targetVid.paused) {
        targetVid.play().catch(() => {});
      } else {
        targetVid.pause();
      }
    };
    playBtn.addEventListener('click', togglePlay);
    playBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    playBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    // 2. Mouse & Touch Seeking (supports direct clicking + smooth continuous dragging)
    function seekToPercentage(pct) {
      const targetVid = boundVideo || activeVideo;
      if (!targetVid) return;
      const cleanPct = Math.max(0, Math.min(100, pct));
      rangeInput.value = cleanPct;
      rangeFill.style.width = `${cleanPct}%`;
      const duration = getVideoDuration(targetVid);
      if (duration > 0 && isFinite(duration)) {
        const targetTime = Math.max(0, Math.min(duration, (cleanPct / 100) * duration));
        applySeek(targetVid, targetTime);
        timeLabel.textContent = `${formatTime(targetTime)} / ${formatTime(duration)}`;
      }
    }

    function seekFromEvent(e) {
      const boxRect = rangeBox.getBoundingClientRect();
      if (boxRect.width <= 0) return;
      const clientX =
        e.clientX !== undefined
          ? e.clientX
          : e.touches && e.touches[0]
          ? e.touches[0].clientX
          : 0;
      const offsetX = Math.max(0, Math.min(boxRect.width, clientX - boxRect.left));
      const pct = (offsetX / boxRect.width) * 100;
      seekToPercentage(pct);
    }

    function onDragMove(e) {
      if (!isSeeking) return;
      e.preventDefault();
      e.stopPropagation();
      seekFromEvent(e);
    }

    function onDragEnd(e) {
      if (!isSeeking) return;
      e.preventDefault();
      e.stopPropagation();
      isSeeking = false;
      slider.classList.remove('is-seeking');
      window.removeEventListener('pointermove', onDragMove, true);
      window.removeEventListener('pointerup', onDragEnd, true);
      window.removeEventListener('pointercancel', onDragEnd, true);
      window.removeEventListener('mousemove', onDragMove, true);
      window.removeEventListener('mouseup', onDragEnd, true);

      if (seekLockTimer) clearTimeout(seekLockTimer);
      seekLockTimer = setTimeout(() => {
        seekLockTimer = null;
      }, 250);
    }

    function onDragStart(e) {
      e.preventDefault();
      e.stopPropagation();
      isSeeking = true;
      slider.classList.add('is-seeking');
      seekFromEvent(e);
      window.addEventListener('pointermove', onDragMove, true);
      window.addEventListener('pointerup', onDragEnd, true);
      window.addEventListener('pointercancel', onDragEnd, true);
      window.addEventListener('mousemove', onDragMove, true);
      window.addEventListener('mouseup', onDragEnd, true);
    }

    rangeBox.addEventListener('pointerdown', onDragStart);
    rangeBox.addEventListener('mousedown', onDragStart);

    rangeInput.addEventListener('input', (e) => {
      e.stopPropagation();
      isSeeking = true;
      seekToPercentage(parseFloat(rangeInput.value) || 0);
    });

    rangeInput.addEventListener('change', (e) => {
      e.stopPropagation();
      isSeeking = false;
      if (seekLockTimer) clearTimeout(seekLockTimer);
      seekLockTimer = setTimeout(() => { seekLockTimer = null; }, 250);
    });

    // 3. Quick Step (-5s / +5s)
    stepBtns.forEach((btn) => {
      const handleStep = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetVid = boundVideo || activeVideo;
        if (!targetVid) return;
        const delta = parseFloat(btn.dataset.step) || 0;
        const dur = getVideoDuration(targetVid) || 30;
        const newTime = Math.max(0, Math.min(dur, (targetVid.currentTime || 0) + delta));
        applySeek(targetVid, newTime);
      };
      btn.addEventListener('click', handleStep);
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
    });

    // 4. Playback Speed cycle
    const speeds = [1, 1.25, 1.5, 2, 0.5];
    const handleSpeed = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextIndex = (speeds.indexOf(currentPlaybackRate) + 1) % speeds.length;
      currentPlaybackRate = speeds[nextIndex];
      try {
        localStorage.setItem('ig_tools_speed', String(currentPlaybackRate));
      } catch (err) {}
      const targetVid = boundVideo || activeVideo;
      if (targetVid) {
        try { targetVid.playbackRate = currentPlaybackRate; } catch (err) {}
      }
      syncSpeedBadge();
      if (window.IGTools?.showToast) {
        window.IGTools.showToast(`⚡ Speed: ${currentPlaybackRate}x`);
      }
    };
    speedBtn.addEventListener('click', handleSpeed);
    speedBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    speedBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    // 5. Mute / Unmute (Sound button that stays active across scroll)
    const handleMute = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetVid = boundVideo || activeVideo;
      if (!targetVid) return;

      const currentlyMuted = Boolean(targetVid.muted || targetVid.volume === 0);
      if (currentlyMuted) {
        // UNMUTE: Turn sound ON, restore volume, and keep active on scroll
        targetVid.muted = false;
        const savedVol = getSavedVolume();
        const effectiveVol = (savedVol !== null && savedVol > 0) ? savedVol : 0.7;
        targetVid.volume = effectiveVol;

        try {
          localStorage.setItem('ig_tools_volume', String(effectiveVol));
          localStorage.setItem('ig_tools_muted', 'false');
        } catch (err) {}

        // Programmatically trigger native audio toggle to sync Instagram's internal React audio manager
        triggerNativeAudioButton(targetVid);

        // Tell MAIN world (ghost.js) to keep unmuted
        try {
          window.postMessage({ type: 'IG_TOOLS_SET_AUDIO_PREF', unmuted: true }, '*');
        } catch (err) {}

        if (window.IGTools?.showToast) {
          window.IGTools.showToast('🔊 Sound: ON (persists on scroll)');
        }
      } else {
        // MUTE
        targetVid.muted = true;
        try {
          localStorage.setItem('ig_tools_muted', 'true');
        } catch (err) {}

        triggerNativeAudioButton(targetVid);

        try {
          window.postMessage({ type: 'IG_TOOLS_SET_AUDIO_PREF', unmuted: false }, '*');
        } catch (err) {}

        if (window.IGTools?.showToast) {
          window.IGTools.showToast('🔇 Sound: MUTED');
        }
      }
      syncSliderAudioState();
    };
    muteBtn.addEventListener('click', handleMute);
    muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    muteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  function bindVideoEvents(video) {
    if (boundVideo === video) {
      syncSliderAudioState();
      syncSpeedBadge();
      return;
    }
    if (boundVideo) {
      if (timeupdateHandler) boundVideo.removeEventListener('timeupdate', timeupdateHandler);
      if (playHandler) boundVideo.removeEventListener('play', playHandler);
      if (playHandler) boundVideo.removeEventListener('playing', playHandler);
      if (pauseHandler) boundVideo.removeEventListener('pause', pauseHandler);
      if (volumeHandler) boundVideo.removeEventListener('volumechange', volumeHandler);
      if (rateHandler) boundVideo.removeEventListener('ratechange', rateHandler);
      if (playHandler) boundVideo.removeEventListener('loadedmetadata', playHandler);
    }

    boundVideo = video;
    if (!video) return;

    applySavedVolume(video);
    if (currentPlaybackRate !== 1) {
      try { video.playbackRate = currentPlaybackRate; } catch (e) {}
    }

    const slider = getOrCreateActiveSlider();
    if (!slider) return;

    const playBtn = slider.querySelector('.ig-tools-slider-play-btn');
    const rangeFill = slider.querySelector('.ig-tools-slider-fill');
    const rangeInput = slider.querySelector('.ig-tools-slider-input');
    const timeLabel = slider.querySelector('.ig-tools-slider-time-label');

    playBtn.innerHTML = video.paused ? SVG_PLAY : SVG_PAUSE;
    syncSliderAudioState();
    syncSpeedBadge();

    timeupdateHandler = () => {
      if (isSeeking || seekLockTimer) return;
      if (currentPlaybackRate !== 1 && Math.abs(video.playbackRate - currentPlaybackRate) > 0.05) {
        try { video.playbackRate = currentPlaybackRate; } catch (e) {}
      }
      // Keep sound unmuted if user set sound ON and video got muted by Instagram
      const isMutedPref = getSavedMuted();
      if (isMutedPref === false && video.muted) {
        video.muted = false;
        const v = getSavedVolume() || 0.7;
        if (video.volume === 0) video.volume = v;
        syncSliderAudioState();
      }
      const cur = video.currentTime || 0;
      const dur = getVideoDuration(video);
      const pct = (dur > 0 && isFinite(dur)) ? Math.max(0, Math.min(100, (cur / dur) * 100)) : 0;
      rangeInput.value = pct;
      rangeFill.style.width = `${pct}%`;
      timeLabel.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
      syncSliderAudioState();
      syncSpeedBadge();
    };

    playHandler = () => {
      playBtn.innerHTML = SVG_PAUSE;
      applySavedVolume(video);
      if (currentPlaybackRate !== 1 && video.playbackRate !== currentPlaybackRate) {
        try { video.playbackRate = currentPlaybackRate; } catch (e) {}
      }
      syncSliderAudioState();
      syncSpeedBadge();
    };

    pauseHandler = () => {
      playBtn.innerHTML = SVG_PLAY;
      syncSliderAudioState();
      syncSpeedBadge();
    };

    volumeHandler = () => {
      syncSliderAudioState();
    };

    rateHandler = () => {
      if (currentPlaybackRate !== 1 && video.playbackRate !== currentPlaybackRate) {
        try { video.playbackRate = currentPlaybackRate; } catch (e) {}
      }
      syncSpeedBadge();
    };

    video.addEventListener('timeupdate', timeupdateHandler);
    video.addEventListener('play', playHandler);
    video.addEventListener('playing', playHandler);
    video.addEventListener('pause', pauseHandler);
    video.addEventListener('volumechange', volumeHandler);
    video.addEventListener('ratechange', rateHandler);
    video.addEventListener('loadedmetadata', playHandler);

    timeupdateHandler();
  }

  /**
   * Strictly determines whether a video element belongs to a Reel or a video Post.
   * Completely excludes Direct Messages / conversations (including in-page floating chat drawers),
   * Stories, and Account settings.
   */
  function isReelOrPostVideo(video) {
    if (!video || !video.isConnected) return false;

    const path = location.pathname;
    // 1. Strict route exclusions
    if (
      path.startsWith('/direct') ||
      path.includes('/direct/') ||
      path.startsWith('/stories') ||
      path.includes('/stories/') ||
      path.startsWith('/accounts')
    ) {
      return false;
    }

    // 2. Strict conversation container detection (covers floating chat widgets & popovers)
    if (
      video.closest(
        '[aria-label*="Direct" i], [aria-label*="Messages" i], [aria-label*="Chat" i], ' +
        '[aria-label*="Mesaje" i], [aria-label*="Conversa" i], ' +
        'div[data-pagelet*="Direct" i], div[data-pagelet*="Chat" i], ' +
        'section[role="region"][aria-label*="Direct" i], ' +
        '[data-testid*="direct" i], [data-testid*="message" i]'
      )
    ) {
      return false;
    }

    const r = video.getBoundingClientRect();
    if (r.width < 180 || r.height < 180) {
      // Exclude tiny video notes, avatars, or previews
      return false;
    }

    // 3. Check if Reel URL
    const isReelPath = path.startsWith('/reels') || path.startsWith('/reel') || path.includes('/reel/') || path.includes('/reels/');
    if (isReelPath) {
      return true;
    }

    // 4. Check if Post video (inside <article> on feed or /p/ page)
    const isPostPath = path.startsWith('/p/') || path.includes('/p/');
    const insideArticle = Boolean(video.closest('article'));
    const insidePostDialog = Boolean(video.closest('div[role="dialog"] article'));

    if (isPostPath || insideArticle || insidePostDialog) {
      return true;
    }

    return false;
  }

  function updateSliderPosition(video) {
    const slider = getOrCreateActiveSlider();
    if (!slider) return;

    if (!isEnabled || !video || !video.isConnected || !isReelOrPostVideo(video)) {
      slider.style.display = 'none';
      return;
    }

    const rect = video.getBoundingClientRect();
    const windowH = window.innerHeight;

    // Ensure the video is substantially visible in the vertical viewport
    if (rect.height < 150 || rect.bottom < 150 || rect.top > windowH - 120) {
      slider.style.display = 'none';
      return;
    }

    const bottomOffset = windowH - rect.bottom + 8;
    // Prevent the slider from flying up into the upper viewport if the video is partially scrolled off
    if (bottomOffset < 8 || bottomOffset > windowH - 60) {
      slider.style.display = 'none';
      return;
    }

    slider.style.display = 'flex';
    slider.style.position = 'fixed';
    slider.style.left = `${Math.round(rect.left + 10)}px`;
    slider.style.width = `${Math.round(rect.width - 20)}px`;
    slider.style.bottom = `${Math.round(bottomOffset)}px`;
    slider.style.top = 'auto';
    slider.style.right = 'auto';
    slider.style.zIndex = '2147483647';
    slider.style.pointerEvents = 'auto';
  }

  function checkActiveReel() {
    if (!isEnabled) {
      const slider = document.getElementById('ig-tools-active-reel-slider');
      if (slider) slider.style.display = 'none';
      return;
    }

    hideNativeAudioControls();

    // Clean up any old in-container bars
    document.querySelectorAll('div[data-pressable-container="true"] > .ig-tools-reel-slider-bar').forEach(el => el.remove());

    const videos = Array.from(document.querySelectorAll('video'));
    const visibleVideos = videos.filter((v) => {
      if (!isReelOrPostVideo(v)) return false;
      const r = v.getBoundingClientRect();
      return r.height > 80 && r.bottom > 80 && r.top < window.innerHeight - 80;
    });

    if (visibleVideos.length === 0) {
      const slider = document.getElementById('ig-tools-active-reel-slider');
      if (slider) slider.style.display = 'none';
      return;
    }

    const windowCenter = window.innerHeight / 2;
    // Prefer playing visible videos, but ALWAYS select the one closest to the viewport center!
    const playingVisible = visibleVideos.filter((v) => !v.paused);
    const candidateList = playingVisible.length > 0 ? playingVisible : visibleVideos;
    let current = null;
    let minDistance = Infinity;
    for (const v of candidateList) {
      const rect = v.getBoundingClientRect();
      const vCenter = rect.top + rect.height / 2;
      const dist = Math.abs(vCenter - windowCenter);
      if (dist < minDistance) {
        minDistance = dist;
        current = v;
      }
    }

    if (!current && visibleVideos.length > 0) {
      current = visibleVideos[0];
    }

    activeVideo = current;
    bindVideoEvents(current);
    updateSliderPosition(current);
    syncSliderAudioState();
    syncSpeedBadge();
  }

  /**
   * Global wheel listener strictly scoped to when the cursor is directly on the Reel VIDEO.
   */
  function initGlobalWheelListener() {
    window.addEventListener(
      'wheel',
      (e) => {
        const targetVid = boundVideo || activeVideo;
        if (!targetVid || !targetVid.isConnected || !isReelOrPostVideo(targetVid)) return;

        const r = targetVid.getBoundingClientRect();
        const isOverVideo = (
          r.width > 50 &&
          r.height > 50 &&
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        );

        if (isOverVideo) {
          handleReelWheel(e, targetVid);
        }
      },
      { passive: false }
    );
  }

  /**
   * Keyboard shortcuts for active video seeking (Left/Right arrow +/-5s, Space play/pause).
   */
  function initKeyboardSeeking() {
    window.addEventListener('keydown', (e) => {
      if (e.target && ['input', 'textarea'].includes(e.target.tagName.toLowerCase())) return;
      if (e.target && e.target.isContentEditable) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const targetVid = boundVideo || activeVideo;
        if (!targetVid || !targetVid.isConnected || !isReelOrPostVideo(targetVid)) return;

        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -5 : 5;
        const dur = getVideoDuration(targetVid) || 30;
        const newTime = Math.max(0, Math.min(dur, (targetVid.currentTime || 0) + delta));
        applySeek(targetVid, newTime);

        if (window.IGTools?.showToast) {
          window.IGTools.showToast(`${delta > 0 ? '+5s ⏩' : '-5s ⏪'} (${formatTime(newTime)})`);
        }
      }
    });
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;
    console.log(`${LOG_PREFIX} Module initialized (Body-Anchored Persistent Video Controls).`);

    try {
      const savedSpeed = parseFloat(localStorage.getItem('ig_tools_speed'));
      if (!isNaN(savedSpeed) && savedSpeed > 0) {
        currentPlaybackRate = savedSpeed;
      }
    } catch (e) {}

    chrome.storage.local.get(['enableReelSlider'], (res) => {
      if (res && typeof res.enableReelSlider === 'boolean') {
        isEnabled = res.enableReelSlider;
      }
      checkActiveReel();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.enableReelSlider !== undefined) {
        isEnabled = Boolean(changes.enableReelSlider.newValue);
        const slider = document.getElementById('ig-tools-active-reel-slider');
        if (slider) slider.style.display = isEnabled ? 'flex' : 'none';
      }
    });

    const onReady = () => {
      getOrCreateActiveSlider();
      checkActiveReel();
      initKeyboardSeeking();
      initGlobalWheelListener();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
      onReady();
    }

    // Throttled 60fps updates for position & active Reel tracking
    let scrollRaf = null;
    function onScrollOrResize() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        if (activeVideo) updateSliderPosition(activeVideo);
        checkActiveReel();
      });
    }

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    window.addEventListener('play', checkActiveReel, true);
    setInterval(checkActiveReel, 500);
  }

  return {
    init,
    scanAndAttachSliders: checkActiveReel
  };
})();
