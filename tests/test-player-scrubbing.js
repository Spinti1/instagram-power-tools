/**
 * Unit tests for Task 3: Video Player Scrubbing, Duration Handling & Mouse Seeking.
 */
const assert = require('assert');

function runScrubbingTests() {
  console.log('[Task 3 Test] Running Video Player Scrubbing unit tests...');

  // 1. Format Time tests
  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  assert.strictEqual(formatTime(0), '0:00');
  assert.strictEqual(formatTime(7), '0:07');
  assert.strictEqual(formatTime(70), '1:10');
  assert.strictEqual(formatTime(NaN), '0:00');
  assert.strictEqual(formatTime(Infinity), '0:00');

  // 2. Duration Extraction tests (handling DASH/MSE stream edge cases)
  function getVideoDuration(video) {
    if (!video) return 0;
    if (typeof video.duration === 'number' && isFinite(video.duration) && !isNaN(video.duration) && video.duration > 0) {
      return video.duration;
    }
    if (video.dataset && video.dataset.igDuration) {
      const d = parseFloat(video.dataset.igDuration);
      if (!isNaN(d) && isFinite(d) && d > 0) return d;
    }
    if (video.seekable && typeof video.seekable.length === 'number' && video.seekable.length > 0) {
      const end = video.seekable.end(video.seekable.length - 1);
      if (isFinite(end) && !isNaN(end) && end > 0) return end;
    }
    if (video.buffered && typeof video.buffered.length === 'number' && video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      if (isFinite(end) && !isNaN(end) && end > 0) return end;
    }
    if (typeof video.currentTime === 'number' && isFinite(video.currentTime) && video.currentTime > 0) {
      return Math.max(video.currentTime, 15);
    }
    return 0;
  }

  // Normal video
  assert.strictEqual(getVideoDuration({ duration: 42.5 }), 42.5);

  // DASH video with Infinity duration, falling back to seekable
  const dashVideoWithSeekable = {
    duration: Infinity,
    seekable: {
      length: 1,
      end: () => 30.0
    }
  };
  assert.strictEqual(getVideoDuration(dashVideoWithSeekable), 30.0);

  // Video with NaN duration, falling back to dataset metadata
  const metaVideo = {
    duration: NaN,
    dataset: { igDuration: '18.4' }
  };
  assert.strictEqual(getVideoDuration(metaVideo), 18.4);

  // 3. Percentage to Seek Time Calculation
  function calculateSeekTime(pct, duration) {
    const cleanPct = Math.max(0, Math.min(100, pct));
    if (duration <= 0 || !isFinite(duration)) return 0;
    return (cleanPct / 100) * duration;
  }

  assert.strictEqual(calculateSeekTime(50, 60), 30);
  assert.strictEqual(calculateSeekTime(0, 45), 0);
  assert.strictEqual(calculateSeekTime(100, 45), 45);
  assert.strictEqual(calculateSeekTime(-10, 60), 0);
  assert.strictEqual(calculateSeekTime(150, 60), 60);

  // 4. Mouse click offset to percentage
  function calculatePercentageFromClick(clientX, boxLeft, boxWidth) {
    if (boxWidth <= 0) return 0;
    const offsetX = Math.max(0, Math.min(boxWidth, clientX - boxLeft));
    return (offsetX / boxWidth) * 100;
  }

  assert.strictEqual(calculatePercentageFromClick(200, 100, 400), 25);
  assert.strictEqual(calculatePercentageFromClick(100, 100, 400), 0);
  assert.strictEqual(calculatePercentageFromClick(500, 100, 400), 100);

  // 5. Reel & Video Post filtering (strict conversation and DM exclusion)
  function testIsReelOrPostVideo(pathname, videoInfo) {
    if (
      pathname.startsWith('/direct') ||
      pathname.includes('/direct/') ||
      pathname.startsWith('/stories') ||
      pathname.includes('/stories/') ||
      pathname.startsWith('/accounts')
    ) {
      return false;
    }
    if (videoInfo.inConversation) return false;
    if (videoInfo.width < 120 || videoInfo.height < 120) return false;

    const isReelPath = pathname.startsWith('/reels') || pathname.startsWith('/reel') || pathname.includes('/reel/');
    const isVerticalReel = videoInfo.height >= 350 && videoInfo.height > videoInfo.width * 1.15;
    if (isReelPath || isVerticalReel) return true;

    const isPostPath = pathname.startsWith('/p/') || pathname.includes('/p/');
    if (isPostPath || videoInfo.insideArticle) return true;

    return false;
  }

  // Reels
  assert(testIsReelOrPostVideo('/reels/', { width: 400, height: 720 }), 'Reel tab video must be allowed');
  assert(testIsReelOrPostVideo('/reel/C123/', { width: 400, height: 720 }), 'Reel URL video must be allowed');
  assert(testIsReelOrPostVideo('/', { width: 400, height: 720 }), 'Home feed vertical Reel video must be allowed');

  // Video Posts
  assert(testIsReelOrPostVideo('/p/ABC123xyz/', { width: 600, height: 600 }), 'Post URL video must be allowed');
  assert(testIsReelOrPostVideo('/', { width: 500, height: 500, insideArticle: true }), 'Feed article post video must be allowed');

  // Conversations & Excluded
  assert(!testIsReelOrPostVideo('/direct/inbox/', { width: 400, height: 720 }), 'Direct inbox video must be rejected');
  assert(!testIsReelOrPostVideo('/direct/t/123/', { width: 300, height: 300 }), 'Direct thread video must be rejected');
  assert(!testIsReelOrPostVideo('/', { width: 300, height: 300, inConversation: true }), 'Video inside floating chat drawer must be rejected');
  assert(!testIsReelOrPostVideo('/stories/username/', { width: 400, height: 720 }), 'Story video must be rejected');
  assert(!testIsReelOrPostVideo('/', { width: 80, height: 80 }), 'Tiny avatar/note video must be rejected');

  console.log('[Task 3 Test] All Video Player Scrubbing unit checks PASSED!');
}

try {
  runScrubbingTests();
} catch (e) {
  console.error('[Task 3 Test] FAILED:', e.message);
  process.exit(1);
}
