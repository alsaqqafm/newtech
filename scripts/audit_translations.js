const fs = require('fs');

const path = require('path');
global.window = {};
const code = fs.readFileSync(path.join(__dirname, '../js/translations.js'), 'utf8');
eval(code);
const { ar, en } = window.translations;

const files = [
  path.join(__dirname, '../index.html'),
  path.join(__dirname, '../pages/products.html'),
  path.join(__dirname, '../pages/partners.html'),
  path.join(__dirname, '../pages/services.html'),
  path.join(__dirname, '../pages/about.html'),
  path.join(__dirname, '../pages/contact.html')
];

let totalKeys = 0;
let missingInAr = 0;
let missingInEn = 0;

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const matches = content.matchAll(/data-i18n(?:-placeholder|-title|-html)?=["']([^"']+)["']/g);
  let fileKeys = 0;
  for (const m of matches) {
    const key = m[1];
    fileKeys++;
    totalKeys++;
    if (!ar[key]) {
      console.log(`[MISSING AR] in ${f}: "${key}"`);
      missingInAr++;
    }
    if (!en[key]) {
      console.log(`[MISSING EN] in ${f}: "${key}"`);
      missingInEn++;
    }
  }
  console.log(`${f}: checked ${fileKeys} i18n attributes`);
});

console.log(`\nAudit Complete: ${totalKeys} keys checked.`);
console.log(`Missing in AR: ${missingInAr}, Missing in EN: ${missingInEn}`);
