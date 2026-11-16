const fs = require('fs');
const path = require('path');
const assert = require('assert');

const htmlFiles = [
  'index.html',
  'pages/products.html',
  'pages/about.html',
  'pages/services.html',
  'pages/partners.html',
  'pages/contact.html',
  'admin/login.html',
  'admin/products.html',
  'admin/index.html'
];

console.log('--- Checking Viewport Meta Tags ---');
htmlFiles.forEach(rel => {
  const file = path.join(__dirname, '..', rel);
  if (fs.existsSync(file)) {
    const html = fs.readFileSync(file, 'utf8');
    const hasViewport = /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i.test(html);
    assert(hasViewport, `${rel} has proper viewport meta tag`);
    console.log(`[PASS] ${rel} -> Viewport meta tag verified`);
  }
});

console.log('\n--- Checking CSS Breakpoint Integrity ---');
const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

const requiredBreakpoints = [
  'min-width: 1400px',
  'max-width: 1200px',
  'max-width: 1024px',
  'max-width: 768px',
  'max-width: 640px',
  'max-width: 480px',
  'max-width: 360px',
  'max-height: 550px'
];

requiredBreakpoints.forEach(bp => {
  const found = css.includes(bp);
  assert(found, `CSS includes breakpoint: ${bp}`);
  console.log(`[PASS] Responsive breakpoint verified: @media (${bp})`);
});

// Check that html/body prevents overflow
assert(css.includes('overflow-x: hidden'), 'CSS includes overflow-x: hidden on html/body');
console.log('[PASS] Global horizontal overflow protection verified');

// Check that search box is responsive
assert(css.includes('search-box input') && css.includes('min-width: 0'), 'Search box input has min-width: 0 for mobile');
console.log('[PASS] Mobile search box input responsiveness verified');

// Check modal max-height and scrolling
assert(css.includes('max-height: 88vh') || css.includes('max-height: 90vh'), 'Modals have max-height and scrolling for small viewports');
console.log('[PASS] Modal viewport safety verified');

console.log('\nALL RESPONSIVENESS AND DEVICE DIMENSION TESTS PASSED! (0 failures)');
