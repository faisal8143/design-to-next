// Copies the converter into the Salesforce project as an LWC module (c/designToNextCore).
// Run after changing src/design-to-next.js:  node scripts/build-lwc.js
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'design-to-next.js'), 'utf8');
const out = [
  '// GENERATED from src/design-to-next.js by scripts/build-lwc.js. Do not edit by hand.',
  '/* eslint-disable */',
  'const module = { exports: {} };',
  src,
  'export default module.exports;',
  ''
].join('\n');
const dir = path.join(__dirname, '..', 'salesforce', 'force-app', 'main', 'default', 'lwc', 'designToNextCore');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'designToNextCore.js'), out);
console.log('Wrote', path.relative(process.cwd(), path.join(dir, 'designToNextCore.js')));
