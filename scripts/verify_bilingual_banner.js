const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mock a lightweight DOM environment
class Element {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = attrs;
    this.textContent = '';
    this.innerHTML = '';
  }
  getAttribute(name) { return this.attributes[name]; }
  setAttribute(name, val) { this.attributes[name] = val; if (name === 'src') this.src = val; }
  get src() { return this.attributes['src']; }
  set src(v) { this.attributes['src'] = v; }
}

const elements = [
  new Element('img', {
    id: 'heroBannerImg',
    'data-i18n-src-ar': 'images/hero-banner-ar.jpg',
    'data-i18n-src-en': 'images/hero-banner-en.jpg',
    src: 'images/hero-banner-ar.jpg'
  }),
  new Element('img', {
    id: 'aboutBannerImg',
    'data-i18n-src-ar': 'images/hero-banner-ar.jpg',
    'data-i18n-src-en': 'images/hero-banner-en.jpg',
    src: 'images/hero-banner-ar.jpg'
  })
];

global.window = {};
global.document = {
  documentElement: { lang: 'ar', dir: 'rtl' },
  querySelectorAll: (selector) => {
    if (selector.includes('data-i18n-src-ar')) {
      return elements.filter(el => el.getAttribute('data-i18n-src-ar') !== undefined);
    }
    return [];
  }
};

const code = fs.readFileSync(path.join(__dirname, '../js/translations.js'), 'utf8');
eval(code);

console.log('--- Testing Bilingual Banner Switching ---');

// Test 1: Arabic mode
applyTranslations('ar');
elements.forEach(el => {
  assert(el.src.includes('hero-banner-ar.jpg'), `Expected AR banner, got: ${el.src}`);
  console.log(`[PASS] AR Mode -> ${el.attributes.id} src: ${el.src}`);
});

// Test 2: English mode
applyTranslations('en');
elements.forEach(el => {
  assert(el.src.includes('hero-banner-en.jpg'), `Expected EN banner, got: ${el.src}`);
  console.log(`[PASS] EN Mode -> ${el.attributes.id} src: ${el.src}`);
});

// Test 3: Switch back to Arabic
applyTranslations('ar');
elements.forEach(el => {
  assert(el.src.includes('hero-banner-ar.jpg'), `Expected AR banner, got: ${el.src}`);
  console.log(`[PASS] Switch back to AR Mode -> ${el.attributes.id} src: ${el.src}`);
});

console.log('\nALL BILINGUAL BANNER TESTS PASSED! (0 failures)');
