/**
 * Unit tests for Task 2: Friends who liked locator and likers parser.
 */
const assert = require('assert');

function runFriendsLikedTests() {
  console.log('[Task 2 Test] Running Friends Who Liked unit tests...');

  // Mock Reel layout environment
  const mockWindow = {
    innerHeight: 900,
    innerWidth: 1400
  };

  const navRect = { left: 0, right: 72, top: 0, bottom: 900, width: 72, height: 900 };
  const videoRect = { left: 500, right: 900, top: 100, bottom: 800, width: 400, height: 700 };
  const authorRect = { left: 240, right: 460, top: 720, bottom: 755, width: 220, height: 35 };

  // 1. Test left-gutter coordinate bounds
  function isStrictlyInLeftGutter(r, vRect, navR) {
    if (!r || r.width <= 0 || r.height <= 0) return false;
    // Must be completely to the right of global navigation
    if (r.left < navR - 5) return false;
    // Must be on the left side of the Reel video (left gutter or bottom-left overlay)
    const maxAllowedLeft = vRect.left + (vRect.width * 0.25);
    if (r.left > maxAllowedLeft) return false;
    // Must be within vertical span of the active Reel
    if (r.bottom < vRect.top - 80 || r.top > vRect.bottom + 100) return false;
    return true;
  }

  assert(isStrictlyInLeftGutter(authorRect, videoRect, navRect.right), 'Author in left gutter must match');
  
  // Element in navigation sidebar must be rejected
  const sidebarProfileLink = { left: 12, right: 60, top: 500, bottom: 535, width: 48, height: 35 };
  assert(!isStrictlyInLeftGutter(sidebarProfileLink, videoRect, navRect.right), 'Sidebar link must NOT match');

  // Element on the right side of the video must be rejected
  const rightColumnButton = { left: 920, right: 960, top: 600, bottom: 640, width: 40, height: 40 };
  assert(!isStrictlyInLeftGutter(rightColumnButton, videoRect, navRect.right), 'Right action button must NOT match');

  // 2. Test positioning directly ABOVE author
  function calculateCardPosition(aRect, vRect, navR, winH) {
    const cardWidth = 240;
    let targetLeft = aRect ? aRect.left : Math.max(navR + 16, vRect.left - cardWidth - 20);
    targetLeft = Math.max(navR + 12, targetLeft);

    // If author found, anchor directly ABOVE author row (~12px gap)
    let bottomFromWindow;
    if (aRect) {
      bottomFromWindow = winH - aRect.top + 12;
    } else {
      bottomFromWindow = Math.max(70, winH - (vRect.bottom - 110));
    }

    return { left: Math.round(targetLeft), bottom: Math.round(bottomFromWindow) };
  }

  const posWithAuthor = calculateCardPosition(authorRect, videoRect, navRect.right, mockWindow.innerHeight);
  assert.strictEqual(posWithAuthor.left, 240, 'Card left must align with author element');
  // window.innerHeight (900) - authorRect.top (720) + 12 = 192
  assert.strictEqual(posWithAuthor.bottom, 192, 'Card bottom must anchor ~12px above author');

  // 3. Test multi-language "Liked by" text parser
  function parseLikedByString(text) {
    const lower = text.toLowerCase();
    const prefixes = ['liked by ', 'apreciat de ', 'gefällt ', 'aimé par '];
    for (const prefix of prefixes) {
      if (lower.includes(prefix)) {
        const parts = text.slice(lower.indexOf(prefix) + prefix.length).split(/\s+(?:and|și|und|et)\s+/i);
        return parts[0].trim().replace(/^@/, '');
      }
    }
    return null;
  }

  assert.strictEqual(parseLikedByString('Liked by 9sarba and 851 others'), '9sarba');
  assert.strictEqual(parseLikedByString('Apreciat de andrei_popescu și alți 42'), 'andrei_popescu');
  assert.strictEqual(parseLikedByString('Gefällt max_muster und 12 weiteren'), 'max_muster');

  // 4. Test strict isReelContext (Strictly restricted to Reels tab & reel viewers, NEVER home feed /)
  function testIsReelContext(pathname, activeVideo) {
    if (
      !pathname ||
      pathname === '/' ||
      pathname === '' ||
      pathname.startsWith('/direct') ||
      pathname.includes('/direct/') ||
      pathname.startsWith('/accounts') ||
      pathname.startsWith('/stories') ||
      pathname.includes('/stories/') ||
      (pathname.startsWith('/explore') && !pathname.includes('/reel'))
    ) {
      return false;
    }

    const isReelUrl =
      pathname.startsWith('/reels') ||
      pathname.startsWith('/reel') ||
      pathname.includes('/reel/') ||
      pathname.includes('/reels/');

    return isReelUrl;
  }

  assert(testIsReelContext('/reels/', null), 'Path /reels/ must match Reel context');
  assert(testIsReelContext('/reels', null), 'Path /reels must match Reel context');
  assert(testIsReelContext('/reel/DF123/', null), 'Path /reel/DF123/ must match Reel context');
  assert(testIsReelContext('/user123/reels/', null), 'Path /user123/reels/ must match Reel context');
  assert(testIsReelContext('/user123/reel/DF123/', null), 'Path /user123/reel/DF123/ must match Reel context');
  assert(!testIsReelContext('/', { width: 400, height: 720 }), 'Home feed MUST NOT match Reel context even with vertical video');
  assert(!testIsReelContext('/direct/inbox/', { width: 400, height: 720 }), 'Direct inbox must be excluded');
  assert(!testIsReelContext('/stories/user/', { width: 400, height: 720 }), 'Stories must be excluded');
  assert(!testIsReelContext('/explore/', null), 'Explore grid must be excluded');

  // 5. Test safe left sidebar measurement (guards against full-width container bug)
  function testGetLeftSidebarWidth(elements) {
    for (const el of elements) {
      if (el.left >= 0 && el.left <= 25 && el.width >= 40 && el.width <= 320 && el.height > 400) {
        return el.right;
      }
    }
    return 72;
  }

  const mockSidebarElements = [
    { left: 0, right: 1400, width: 1400, height: 60 }, // Top header (wide!)
    { left: 0, right: 72, width: 72, height: 900 }       // Left slim sidebar
  ];
  assert.strictEqual(testGetLeftSidebarWidth(mockSidebarElements), 72, 'Left sidebar must return 72, not 1400');

  console.log('[Task 2 Test] All Friends Who Liked unit checks PASSED!');
}

try {
  runFriendsLikedTests();
} catch (e) {
  console.error('[Task 2 Test] FAILED:', e.message);
  process.exit(1);
}
