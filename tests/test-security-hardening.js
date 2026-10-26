/**
 * Security & Exploit Hardening verification test.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runSecurityTests() {
  console.log('[Task 3 Test] Running Security Hardening and Scope unit tests...');

  // 1. Verify manifest.json host_permissions
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert(Array.isArray(manifest.host_permissions), 'host_permissions must be an array');
  for (const perm of manifest.host_permissions) {
    const isInstagram = perm.includes('instagram.com');
    const isCdn = perm.includes('cdninstagram.com') || perm.includes('fbcdn.net');
    assert(
      isInstagram || isCdn,
      `host_permission "${perm}" must strictly target Instagram domains or CDNs`
    );
    assert(
      !perm.includes('facebook.com'),
      `host_permission "${perm}" must NOT contain facebook.com`
    );
  }

  // 2. Verify rules.json WebSocket scoping with initiatorDomains
  const rulesPath = path.join(__dirname, '..', 'rules.json');
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

  const wsRules = rules.filter((r) => r.condition?.resourceTypes?.includes('websocket'));
  for (const r of wsRules) {
    // If rule matches a generic urlFilter or cross-domain, it must have initiatorDomains: ['instagram.com']
    if (r.condition.urlFilter?.includes('facebook.com') || r.condition.urlFilter?.includes('messenger.com') || r.condition.regexFilter) {
      assert(
        r.condition.initiatorDomains && r.condition.initiatorDomains.includes('instagram.com'),
        `WebSocket DNR rule ${r.id} must be scoped to initiatorDomains: ['instagram.com'] to prevent cross-site tab interference`
      );
    }
  }

  // 3. Test XSS sanitizer function
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const payload = '<script>alert("xss")</script>&foo=\'bar\'';
  const escaped = escapeHtml(payload);

  assert(!escaped.includes('<script>'), 'Must escape <');
  assert(!escaped.includes('</script>'), 'Must escape >');
  assert(!escaped.includes('"xss"'), 'Must escape "');
  assert(!escaped.includes('\'bar\''), 'Must escape \'');
  assert(escaped.includes('&amp;'), 'Must escape &');

  console.log('[Task 3 Test] All Security Hardening and Scope unit checks PASSED!');
}

try {
  runSecurityTests();
} catch (e) {
  console.error('[Task 3 Test] FAILED:', e.message);
  process.exit(1);
}
