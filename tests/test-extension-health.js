/**
 * Tests extension health, MV3 manifest schema, and DeclarativeNetRequest static rules.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTests() {
  console.log('[Task 1 Test] Verifying extension health and DNR rules...');

  const manifestPath = path.resolve(__dirname, '../manifest.json');
  const rulesPath = path.resolve(__dirname, '../rules.json');
  const backgroundPath = path.resolve(__dirname, '../background.js');

  // 1. Verify manifest.json
  assert(fs.existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert(manifest.permissions.includes('declarativeNetRequest'), 'Must have declarativeNetRequest permission');

  // 2. Verify rules.json static rules
  assert(fs.existsSync(rulesPath), 'rules.json must exist');
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  assert(Array.isArray(rules), 'rules.json must be an array');
  assert(rules.length > 0, 'rules.json must have rules');

  const ruleIds = new Set();
  const validResourceTypes = new Set([
    'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
    'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
  ]);

  for (const rule of rules) {
    assert(typeof rule.id === 'number', `Rule id must be number: ${JSON.stringify(rule)}`);
    assert(!ruleIds.has(rule.id), `Duplicate rule id: ${rule.id}`);
    ruleIds.add(rule.id);

    assert(rule.action && rule.action.type, `Rule ${rule.id} must have action.type`);
    assert(rule.condition, `Rule ${rule.id} must have condition`);

    const cond = rule.condition;
    // urlFilter constraint: must NOT start with unanchored wildcard * (must start with ||, |, or plain token)
    if (cond.urlFilter) {
      assert(!cond.urlFilter.startsWith('*'), `Rule ${rule.id} urlFilter must not start with wildcard *: ${cond.urlFilter}`);
    }

    // resourceTypes validation
    if (cond.resourceTypes) {
      for (const rt of cond.resourceTypes) {
        assert(validResourceTypes.has(rt), `Rule ${rule.id} has invalid resourceType: ${rt}`);
      }
    }

    // regexFilter validation
    if (cond.regexFilter) {
      assert.doesNotThrow(() => new RegExp(cond.regexFilter), `Rule ${rule.id} has invalid regex: ${cond.regexFilter}`);
    }

    // requestMethods validation: in Chrome DNR RequestMethod enum, values MUST be lowercase
    const validMethods = new Set(['connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'other']);
    if (cond.requestMethods) {
      for (const m of cond.requestMethods) {
        assert(validMethods.has(m), `Rule ${rule.id} requestMethod must be a valid lowercase RequestMethod: ${m}`);
      }
    }
  }

  // 3. Verify background.js DNR update safety
  assert(fs.existsSync(backgroundPath), 'background.js must exist');
  const bgCode = fs.readFileSync(backgroundPath, 'utf8');

  // Ensure background checks getEnabledRulesets before toggling to prevent rejections
  assert(
    bgCode.includes('getEnabledRulesets') || bgCode.includes('try {'),
    'background.js must safely guard DNR updates'
  );

  console.log(`[Task 1 Test] All ${rules.length} rules and manifest checks PASSED!`);
}

try {
  runTests();
} catch (err) {
  console.error('[Task 1 Test] FAILED:', err.message);
  process.exit(1);
}
