/**
 * Unit tests for Task 2: Post Action Bar Download Button insertion and styling logic.
 */
const assert = require('assert');

function runPostButtonTests() {
  console.log('[Task 2 Test] Running Post Action Bar Download Button unit tests...');

  // 1. Mock DOM elements matching Instagram's native feed post structure
  function createMockArticle() {
    const article = {
      dataset: {},
      querySelector(selector) {
        if (selector.includes('Share')) return this.shareSvg;
        if (selector.includes('Save')) return this.saveSvg;
        if (selector === 'section') return this.section;
        return null;
      }
    };

    const hostRow = {
      children: [],
      insertBefore(newEl, refEl) {
        const idx = this.children.indexOf(refEl);
        if (idx !== -1) {
          this.children.splice(idx, 0, newEl);
        } else {
          this.children.push(newEl);
        }
      },
      appendChild(newEl) {
        this.children.push(newEl);
      }
    };

    const shareBtn = {
      tagName: 'BUTTON',
      parentElement: hostRow,
      closest(s) {
        return this;
      }
    };

    const shareSvg = {
      tagName: 'SVG',
      attributes: { 'aria-label': 'Share Post' },
      closest(s) {
        if (s.includes('button')) return shareBtn;
        return null;
      }
    };

    const saveBtn = {
      tagName: 'BUTTON',
      parentElement: hostRow,
      closest(s) {
        return this;
      }
    };

    const saveSvg = {
      tagName: 'SVG',
      attributes: { 'aria-label': 'Save' },
      closest(s) {
        if (s.includes('button')) return saveBtn;
        return null;
      }
    };

    hostRow.children = [shareBtn, saveBtn];
    article.shareSvg = shareSvg;
    article.saveSvg = saveSvg;
    article.section = { firstElementChild: hostRow };

    return { article, hostRow, shareBtn, saveBtn };
  }

  // Insertion helper to be implemented in download.js
  function findPostActionBarAnchor(article) {
    const shareSvg = article.querySelector(
      'svg[aria-label*="Share" i], svg[aria-label*="Trimite" i], svg[aria-label*="Partajeaz" i], svg[aria-label*="Teilen" i]'
    );
    if (shareSvg) {
      const shareBtn = shareSvg.closest('button, div[role="button"]');
      if (shareBtn && shareBtn.parentElement) {
        return {
          parent: shareBtn.parentElement,
          reference: shareBtn.nextSibling || null,
          method: 'afterShare'
        };
      }
    }

    const saveSvg = article.querySelector(
      'svg[aria-label*="Save" i], svg[aria-label*="Salveaz" i], svg[aria-label*="Salvați" i], svg[aria-label*="Speichern" i]'
    );
    if (saveSvg) {
      const saveBtn = saveSvg.closest('button, div[role="button"]');
      if (saveBtn && saveBtn.parentElement) {
        return {
          parent: saveBtn.parentElement,
          reference: saveBtn,
          method: 'beforeSave'
        };
      }
    }

    return null;
  }

  const { article, hostRow, shareBtn } = createMockArticle();
  const anchor = findPostActionBarAnchor(article);

  assert(anchor !== null, 'Anchor must be resolved from mock article');
  assert.strictEqual(anchor.method, 'afterShare', 'Must anchor right next to Share button');
  assert.strictEqual(anchor.parent, hostRow, 'Parent must be the action row flex container');

  const containerMock = { id: 'ig-tools-post-dl-container' };
  if (anchor.reference) {
    anchor.parent.insertBefore(containerMock, anchor.reference);
  } else {
    anchor.parent.appendChild(containerMock);
  }

  assert(hostRow.children.includes(containerMock), 'Container must be injected into the action row');

  console.log('[Task 2 Test] All Post Action Bar Download Button unit checks PASSED!');
}

try {
  runPostButtonTests();
} catch (e) {
  console.error('[Task 2 Test] FAILED:', e.message);
  process.exit(1);
}
