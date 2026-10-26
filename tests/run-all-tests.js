/**
 * Master Test Runner for IG Tools extension.
 * Executes all test suites and validates all extension JS/JSON files.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log('   IG TOOLS EXTENSION - FULL VALIDATION SUITE       ');
console.log('====================================================\n');

let failedSuites = 0;

// 1. Run unit test suites
const testSuites = [
  'tests/test-extension-health.js',
  'tests/test-friends-liked.js',
  'tests/test-post-download-button.js',
  'tests/test-security-hardening.js',
  'tests/test-privacy-zero-retention.js',
  'tests/test-player-scrubbing.js',
  'tests/test-audio-speed.js'
];

for (const suite of testSuites) {
  const suitePath = path.resolve(__dirname, '..', suite);
  console.log(`[TEST SUITE] Executing ${suite}...`);
  try {
    const output = execSync(`node "${suitePath}"`, { encoding: 'utf8' });
    console.log(output.trim());
    console.log(`[PASS] ${suite}\n`);
  } catch (err) {
    console.error(`[FAIL] ${suite}:`, err.stdout || err.message);
    failedSuites++;
  }
}

// 2. Full compilation check on all project JS files
console.log('[COMPILER CHECK] Validating all extension JavaScript files...');
const jsFiles = [
  'background.js',
  'content/privacy.js',
  'content/account.js',
  'content/download.js',
  'content/friends-liked.js',
  'content/reel-slider.js',
  'content/comments.js',
  'content/content.js',
  'content/ghost.js',
  'popup/popup.js'
];

let compileErrors = 0;
for (const relPath of jsFiles) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  try {
    const code = fs.readFileSync(fullPath, 'utf8');
    new vm.Script(code, { filename: relPath });
    console.log(`  ✓ ${relPath}`);
  } catch (e) {
    console.error(`  ✗ ${relPath} Compilation Error:`, e.message);
    compileErrors++;
  }
}

// 3. JSON schema checks
console.log('\n[JSON SCHEMA CHECK] Validating manifest.json & rules.json...');
try {
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));
  console.log('  ✓ manifest.json is valid JSON');
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../rules.json'), 'utf8'));
  console.log('  ✓ rules.json is valid JSON');
} catch (e) {
  console.error('  ✗ JSON syntax error:', e.message);
  compileErrors++;
}

console.log('\n====================================================');
if (failedSuites === 0 && compileErrors === 0) {
  console.log('🎉 ALL TESTS PASSED! 0 Errors, 0 Warnings.');
  console.log('====================================================');
  process.exit(0);
} else {
  console.error(`❌ VALIDATION FAILED: ${failedSuites} suite failures, ${compileErrors} compilation errors.`);
  console.log('====================================================');
  process.exit(1);
}
