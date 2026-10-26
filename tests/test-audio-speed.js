/**
 * Unit tests for Task 4: Volume Stepping, Audio State Sync, Speed Persistence & Cursor Detection.
 */
const assert = require('assert');

function runAudioSpeedTests() {
  console.log('[Task 4 Test] Running Audio & Speed unit tests...');

  // 1. Volume stepping math
  function calculateNewVolume(currentVol, isUp) {
    let step;
    if (isUp) {
      step = currentVol < 0.05 ? 0.01 : 0.02;
    } else {
      step = currentVol <= 0.05 ? 0.01 : 0.02;
    }

    let newVol = isUp ? currentVol + step : currentVol - step;
    newVol = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
    return newVol;
  }

  // <= 5% steps by 1%
  assert.strictEqual(calculateNewVolume(0.01, true), 0.02);
  assert.strictEqual(calculateNewVolume(0.04, true), 0.05);
  assert.strictEqual(calculateNewVolume(0.05, false), 0.04);
  assert.strictEqual(calculateNewVolume(0.02, false), 0.01);
  assert.strictEqual(calculateNewVolume(0.00, false), 0.00);

  // > 5% steps by 2%
  assert.strictEqual(calculateNewVolume(0.06, true), 0.08);
  assert.strictEqual(calculateNewVolume(0.50, true), 0.52);
  assert.strictEqual(calculateNewVolume(0.50, false), 0.48);
  assert.strictEqual(calculateNewVolume(0.07, false), 0.05);
  assert.strictEqual(calculateNewVolume(1.00, true), 1.00);

  // 2. Cursor inside active video bounding box
  function isCursorDirectlyOverVideo(clientX, clientY, vRect) {
    if (!vRect || vRect.width <= 50 || vRect.height <= 50) return false;
    return (
      clientX >= vRect.left &&
      clientX <= vRect.right &&
      clientY >= vRect.top &&
      clientY <= vRect.bottom
    );
  }

  const mockVideoRect = { left: 400, right: 800, top: 100, bottom: 700, width: 400, height: 600 };
  assert(isCursorDirectlyOverVideo(500, 300, mockVideoRect), 'Cursor inside video bounds must return true');
  assert(!isCursorDirectlyOverVideo(200, 300, mockVideoRect), 'Cursor in left gutter must return false');
  assert(!isCursorDirectlyOverVideo(900, 300, mockVideoRect), 'Cursor in right column must return false');
  assert(!isCursorDirectlyOverVideo(500, 800, mockVideoRect), 'Cursor below video must return false');

  // 3. Audio state evaluation
  function evaluateAudioState(video) {
    if (!video) return 'muted';
    const isMuted = Boolean(video.muted || video.volume === 0);
    return isMuted ? 'muted' : 'unmuted';
  }

  assert.strictEqual(evaluateAudioState({ muted: false, volume: 0.8 }), 'unmuted');
  assert.strictEqual(evaluateAudioState({ muted: true, volume: 0.8 }), 'muted');
  assert.strictEqual(evaluateAudioState({ muted: false, volume: 0 }), 'muted');

  // 4. Playback speed cycling & persistence
  const speeds = [1, 1.25, 1.5, 2, 0.5];
  function getNextSpeed(currentSpeed) {
    const idx = speeds.indexOf(currentSpeed);
    return speeds[(idx + 1) % speeds.length];
  }

  assert.strictEqual(getNextSpeed(1), 1.25);
  assert.strictEqual(getNextSpeed(1.25), 1.5);
  assert.strictEqual(getNextSpeed(1.5), 2);
  assert.strictEqual(getNextSpeed(2), 0.5);
  assert.strictEqual(getNextSpeed(0.5), 1);

  // Enforce speed persistence onto new video element
  function enforcePlaybackRate(newVideo, desiredRate) {
    if (desiredRate && desiredRate > 0) {
      newVideo.playbackRate = desiredRate;
    }
  }

  const freshReelVideo = { playbackRate: 1 };
  enforcePlaybackRate(freshReelVideo, 2);
  assert.strictEqual(freshReelVideo.playbackRate, 2, 'fresh Reel video must inherit user selected 2x speed');

  // 5. Audio state enforcement across Reel scrolling
  function enforceAudioStateTest(video, isMutedPref, savedVol) {
    const effectiveVol = (savedVol !== null && savedVol > 0) ? savedVol : 0.7;
    if (isMutedPref === false) {
      video.muted = false;
      if (video.volume === 0) video.volume = effectiveVol;
    } else if (isMutedPref === true) {
      video.muted = true;
    }
  }

  // When user previously unmuted, newly mounted Reel must automatically unmute
  const scrolledVideo1 = { muted: true, volume: 0.5 };
  enforceAudioStateTest(scrolledVideo1, false, 0.65);
  assert.strictEqual(scrolledVideo1.muted, false, 'New Reel must be unmuted when user preference is unmuted');
  assert.strictEqual(scrolledVideo1.volume, 0.5, 'Existing volume must be retained');

  // When user preference is muted, new Reel must stay muted
  const scrolledVideo2 = { muted: false, volume: 0.5 };
  enforceAudioStateTest(scrolledVideo2, true, 0.5);
  assert.strictEqual(scrolledVideo2.muted, true, 'New Reel must be muted when user preference is muted');

  console.log('[Task 4 Test] All Audio & Speed unit checks PASSED!');
}

try {
  runAudioSpeedTests();
} catch (e) {
  console.error('[Task 4 Test] FAILED:', e.message);
  process.exit(1);
}
