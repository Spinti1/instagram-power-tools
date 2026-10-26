/**
 * IG Tools - Comments Enhancer Module
 * Clean, lightweight, zero-intrusion enhancements for comment media attachments.
 * Completely removed any intrusive toolbars, search boxes, or extra buttons.
 */

window.IGTools = window.IGTools || {};

window.IGTools.comments = (() => {
  const LOG_PREFIX = '[IG Tools] [Comments]';

  if (window.self !== window.top) {
    return {
      init: () => {},
      scanAndEnhanceComments: () => {}
    };
  }

  let isInitialized = false;

  function init() {
    if (isInitialized) return;
    isInitialized = true;
    console.log(`${LOG_PREFIX} Module initialized (zero-intrusion).`);
    scanAndEnhanceComments();
  }

  function scanAndEnhanceComments() {
    // Only enhance media attachments (click to zoom GIFs/stickers), no UI toolbars
    enhanceMediaAttachments();
  }

  function enhanceMediaAttachments() {
    const commentItems = document.querySelectorAll('ul li, div[role="listitem"]');

    commentItems.forEach((item) => {
      if (item.dataset.igToolsAttachmentEnhanced) return;

      const images = Array.from(item.querySelectorAll('img')).filter((img) => {
        const isAvatar =
          img.closest('header') ||
          img.getAttribute('alt')?.includes('profile picture') ||
          img.width <= 36 ||
          img.src.includes('avatar');

        return !isAvatar && (img.src.includes('giphy') || img.src.includes('cdninstagram') || img.getAttribute('alt')?.includes('GIF') || img.getAttribute('alt')?.includes('Sticker'));
      });

      if (images.length > 0) {
        item.dataset.igToolsAttachmentEnhanced = 'true';

        images.forEach((img) => {
          img.classList.add('ig-tools-comment-attachment');
          img.title = 'Click to zoom attachment';

          img.addEventListener('click', (e) => {
            e.stopPropagation();
            openAttachmentLightbox(img.src);
          });
        });
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function openAttachmentLightbox(src) {
    if (!document.body || !src) return;
    const existing = document.getElementById('ig-tools-comment-lightbox');
    if (existing) existing.remove();

    const safeSrc = escapeHtml(src);
    const lightbox = document.createElement('div');
    lightbox.id = 'ig-tools-comment-lightbox';
    lightbox.className = 'ig-tools-lightbox-backdrop';

    lightbox.innerHTML = `
      <div class="ig-tools-lightbox-content">
        <img src="${safeSrc}" alt="Comment media attachment" class="ig-tools-lightbox-img" />
        <button class="ig-tools-lightbox-close">&times;</button>
      </div>
    `;

    lightbox.addEventListener('click', () => lightbox.remove());
    document.body.appendChild(lightbox);
  }

  return {
    init,
    scanAndEnhanceComments
  };
})();
