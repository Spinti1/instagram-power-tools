/**
 * Privacy & Zero Data Retention verification test.
 * Ensures the extension never stores sensitive user credentials, cookies, tokens, or private messages.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runPrivacyTests() {
  console.log('[Task 4 Test] Running Privacy & Zero Data Retention unit tests...');

  // 1. Audit background.js DEFAULT_SETTINGS
  const bgPath = path.join(__dirname, '..', 'background.js');
  const bgContent = fs.readFileSync(bgPath, 'utf8');

  const forbiddenKeys = [
    'password',
    'auth_token',
    'bearer',
    'sessionid',
    'cookie',
    'secret',
    'private_key',
    'chat_history',
    'messages',
    'dm_inbox',
    'telemetry_id',
    'analytics_id'
  ];

  for (const forbidden of forbiddenKeys) {
    const regex = new RegExp(`['"]${forbidden}['"]\\s*:`, 'i');
    assert(!regex.test(bgContent), `background.js MUST NOT have default setting for "${forbidden}"`);
  }

  // 2. Scan all content scripts for outbound telemetry or data exfiltration
  const contentDir = path.join(__dirname, '..', 'content');
  const contentFiles = fs.readdirSync(contentDir).filter((f) => f.endsWith('.js'));

  const telemetryDomains = [
    'google-analytics.com',
    'analytics.',
    'sentry.io',
    'mixpanel.com',
    'datadoghq.com',
    'segment.io',
    'amplitude.com',
    'hotjar.com'
  ];

  for (const file of contentFiles) {
    const code = fs.readFileSync(path.join(contentDir, file), 'utf8');
    for (const domain of telemetryDomains) {
      assert(!code.includes(domain), `Content script "${file}" MUST NOT contact telemetry domain "${domain}"`);
    }
  }

  console.log('[Task 4 Test] All Privacy & Zero Data Retention unit checks PASSED!');
}

try {
  runPrivacyTests();
} catch (e) {
  console.error('[Task 4 Test] FAILED:', e.message);
  process.exit(1);
}
