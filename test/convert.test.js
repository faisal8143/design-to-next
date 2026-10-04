'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const D = require('../src/design-to-next.js');

const DOMParser = new JSDOM('').window.DOMParser;
const html = (h) => D.fromHtml(h, { DOMParser });
const blocks = (email) => email.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
const types = (email) => blocks(email).map((b) => b.type);
const example = (f) => fs.readFileSync(path.join(__dirname, '..', 'examples', f), 'utf8');

// --- HTML -------------------------------------------------------------------------

test('sample newsletter converts to the expected structure', () => {
  const e = html(example('newsletter.html'));
  assert.equal(e.width, 600);
  assert.equal(e.background, '#eef1f0');
  assert.equal(e.preheader, 'New arrivals, members-only pricing and a free tote this week.');
  const header = e.sections.find((s) => s.background === '#123c3c');
  assert.equal(header.columns.length, 2);
  assert.equal(header.columns[0].blocks[0].type, 'image');
  const products = e.sections.filter((s) => s.columns.length === 2)[1];
  assert.deepEqual(products.columns.map((c) => c.blocks.map((b) => b.type)), [
    ['image', 'heading', 'paragraph', 'paragraph'],
    ['image', 'heading', 'paragraph', 'paragraph']
  ]);
  assert.ok(e.report.score >= 90, 'score ' + e.report.score);
  assert.equal(e.report.fallbacks.length, 2);
});

test('headings, paragraphs and inline formatting', () => {
  const e = html('<h2 style="color:#123456">Hello</h2><p>Some <b>bold</b>, <i>italic</i> and a <a href="https://x.com">link</a>.<br>Next line</p>');
  const [h, p] = blocks(e);
  assert.equal(h.type, 'heading');
  assert.equal(h.level, 2);
  assert.equal(h.color, '#123456');
  assert.equal(p.html, 'Some <strong>bold</strong>, <em>italic</em> and a <a href="https://x.com">link</a>.<br>Next line');
});

test('large bold text in a table cell becomes a heading', () => {
  const e = html('<table><tr><td style="font-size:26px;font-weight:bold">Big news</td></tr></table>');
  assert.equal(blocks(e)[0].type, 'heading');
  assert.equal(blocks(e)[0].level, 2);
});

test('table buttons and styled link buttons', () => {
  const e = html(
    '<table><tr><td bgcolor="#ff0066" style="border-radius:8px"><a href="https://a.com" style="color:#fff">Buy now</a></td></tr></table>' +
    '<p><a href="https://b.com" style="display:inline-block;background-color:#003366;color:#ffffff;padding:12px 20px">Read more</a></p>'
  );
  const [a, b] = blocks(e);
  assert.deepEqual([a.type, a.text, a.href, a.background, a.radius], ['button', 'Buy now', 'https://a.com', '#ff0066', 8]);
  assert.deepEqual([b.type, b.text, b.background], ['button', 'Read more', '#003366']);
});

test('images keep alt and link; spacer images are dropped', () => {
  const e = html('<a href="https://x.com"><img src="https://x.com/a.png" alt="Hero" width="600"></a><img src="https://x.com/spacer.gif" width="1" height="1">');
  const b = blocks(e);
  assert.equal(b.length, 1);
  assert.deepEqual([b[0].type, b[0].alt, b[0].href, b[0].width], ['image', 'Hero', 'https://x.com', 600]);
});

test('lists and dividers', () => {
  const e = html('<ul><li>One</li><li><b>Two</b></li></ul><hr style="border-top:2px solid #ccc"><table><tr><td height="1" bgcolor="#eeeeee"></td></tr></table>');
  const b = blocks(e);
  assert.equal(b[0].type, 'list');
  assert.deepEqual(b[0].items, ['One', '<strong>Two</strong>']);
  assert.equal(b[1].type, 'divider');
  assert.equal(b[2].type, 'divider');
  assert.equal(b[2].color, '#eeeeee');
});

test('three-column table row becomes a columns section with widths', () => {
  const e = html('<table width="600"><tr><td width="200"><p>A</p></td><td width="200"><p>B</p></td><td width="200"><p>C</p></td></tr></table>');
  assert.equal(e.sections.length, 1);
  assert.deepEqual(e.sections[0].columns.map((c) => Math.round(c.width)), [33, 33, 33]);
});

test('hybrid (inline-block div) columns are detected', () => {
  const e = html('<div><div style="display:inline-block;max-width:300px"><p>Left</p></div><div style="display:inline-block;max-width:300px"><p>Right</p></div></div>');
  assert.equal(e.sections[0].columns.length, 2);
});

test('more than 4 columns are merged into 4', () => {
  const cells = [1, 2, 3, 4, 5].map((n) => `<td><p>${n}</p></td>`).join('');
  const e = html(`<table><tr>${cells}</tr></table>`);
  assert.equal(e.sections[0].columns.length, 4);
  assert.match(e.report.warnings.join(' '), /up to 4/);
});

test('sections split on background colour changes', () => {
  const e = html('<table><tr><td bgcolor="#000000"><p>Dark</p></td></tr><tr><td bgcolor="#ffffff"><p>Light</p></td></tr></table>');
  assert.deepEqual(e.sections.map((s) => s.background), ['#000000', '#ffffff']);
});

test('AMPscript is kept as an HTML block, not lost', () => {
  const e = html('<table><tr><td>%%[ IF @a == 1 THEN ]%%Yes%%[ ENDIF ]%%</td></tr><tr><td><p>Normal text</p></td></tr></table>');
  assert.deepEqual(types(e), ['html', 'paragraph']);
  assert.match(blocks(e)[0].html, /%%\[ IF @a == 1 THEN \]%%/);
  assert.match(blocks(e)[0].reason, /AMPscript/);
});

test('personalisation strings stay in text and produce a warning', () => {
  const e = html('<p>Hi %%FirstName%%</p>');
  assert.equal(blocks(e)[0].type, 'paragraph');
  assert.match(e.report.warnings.join(' '), /merge fields/);
});

test('forms are kept as HTML with a reason', () => {
  const e = html('<form action="#"><input name="email"></form>');
  assert.equal(blocks(e)[0].type, 'html');
  assert.match(e.report.fallbacks[0].reason, /form/);
});

test('scripts, styles and hidden content are ignored', () => {
  const e = html('<style>p{}</style><script>alert(1)</script><div style="display:none">hidden</div><p>Shown</p>');
  assert.deepEqual(blocks(e).map((b) => b.text), ['Shown']);
});

test('relative image paths are flagged', () => {
  const e = html('<img src="images/hero.jpg" alt="x" width="600">');
  assert.match(e.report.warnings.join(' '), /relative/);
});

// --- Figma ------------------------------------------------------------------------

const figma = JSON.parse(example('figma-email.json'));

test('Figma: frames become sections, horizontal auto layout becomes columns', () => {
  const e = D.fromFigma(figma);
  assert.equal(e.source, 'figma');
  assert.equal(e.width, 600);
  const header = e.sections[0];
  assert.equal(header.background, '#123c3c');
  assert.equal(header.columns.length, 2);
  const products = e.sections.find((s) => s.columns.length === 2 && s.columns[0].blocks.length === 3);
  assert.deepEqual(products.columns[1].blocks.map((b) => b.type), ['image', 'heading', 'paragraph']);
  assert.deepEqual(e.sections.find((s) => s.background === '#f4f6f6').padding, [24, 32, 24, 32]);
});

test('Figma: buttons, links, rich text and images', () => {
  const e = D.fromFigma(figma);
  const all = blocks(e);
  const btn = all.find((b) => b.type === 'button');
  assert.deepEqual([btn.text, btn.href, btn.background, btn.radius], ['Book a fitting', 'https://example.com/fitting', '#0f6e6e', 6]);
  assert.match(all.find((b) => b.type === 'paragraph' && /membership/.test(b.text)).html, /<strong>free alterations<\/strong>/);
  assert.equal(all.find((b) => b.type === 'paragraph' && b.text === 'Unsubscribe').html, '<a href="https://example.com/unsubscribe">Unsubscribe</a>');
  const hero = all.find((b) => b.type === 'image' && /rain/.test(b.alt));
  assert.equal(hero.figmaNodeId, '3:1');
  assert.equal(e.imageRefs.length, 4);
});

test('Figma: frame picked by name, error when none', () => {
  assert.equal(D.fromFigma(figma, { frameName: 'Email / Member update' }).frameName, 'Email / Member update');
  assert.throws(() => D.fromFigma({ document: { type: 'DOCUMENT', children: [] } }), /No email frame/);
});

test('Figma: frames without auto layout fall back to position inference', () => {
  const frame = {
    type: 'FRAME', name: 'Email', absoluteBoundingBox: { x: 100, y: 100, width: 600, height: 400 }, fills: [],
    children: [
      { id: 'a', type: 'TEXT', name: 'Title', characters: 'Hello world', style: { fontSize: 30, fontWeight: 700 }, absoluteBoundingBox: { x: 140, y: 120, width: 520, height: 40 }, fills: [] },
      { id: 'b', type: 'TEXT', name: 'Left', characters: 'Left column', style: { fontSize: 14 }, absoluteBoundingBox: { x: 140, y: 200, width: 240, height: 20 }, fills: [] },
      { id: 'c', type: 'TEXT', name: 'Right', characters: 'Right column', style: { fontSize: 14 }, absoluteBoundingBox: { x: 420, y: 200, width: 240, height: 20 }, fills: [] }
    ]
  };
  const e = D.fromFigma(frame);
  assert.equal(blocks(e)[0].type, 'heading');
  assert.equal(e.sections[1].columns.length, 2);
  assert.match(e.report.warnings.join(' '), /auto layout/);
});

// --- Canva / freeform ---------------------------------------------------------------

const canva = JSON.parse(example('canva-design.json'));

test('Canva: bands become section backgrounds and shapes with text become buttons', () => {
  const e = D.fromCanva(canva);
  assert.equal(e.sections[0].background, '#2b1d3d');
  const btn = blocks(e).find((b) => b.type === 'button');
  assert.deepEqual([btn.text, btn.background, btn.radius, btn.href], ['Discover serums', '#c2457f', 24, 'https://example.com/serums']);
  assert.equal(e.sections[e.sections.length - 1].background, '#f5f0f8');
});

test('Canva: product grid keeps titles under their images', () => {
  const e = D.fromCanva(canva);
  const grid = e.sections.find((s) => s.columns.length === 3);
  assert.deepEqual(grid.columns.map((c) => c.blocks.map((b) => b.type)), [['image', 'paragraph'], ['image', 'paragraph'], ['image', 'paragraph']]);
  assert.equal(grid.columns[2].blocks[1].text, 'Hydrating mist');
});

test('Canva: no empty sections', () => {
  const e = D.fromCanva(canva);
  e.sections.forEach((s) => assert.ok(s.columns.some((c) => c.blocks.length), 'empty section'));
});

// --- Preview -------------------------------------------------------------------------

test('preview renders every block type', () => {
  const e = html(example('newsletter.html'));
  const out = D.renderPreview(e);
  ['<h1', '<img', 'Shop the edit', '<ul', 'data-fallback', 'border-top:1px'].forEach((s) => assert.ok(out.includes(s), 'missing ' + s));
  const f = D.renderPreview(D.fromFigma(figma));
  assert.ok(f.includes('data:image/svg+xml'), 'Figma images get a placeholder');
});

// --- Marketing Cloud Next content ---------------------------------------------------

const NEXT_BASE = {
  'sfdc_cms:block': {
    id: 'root', type: 'block', definition: 'lightning/section',
    children: [{
      id: 'sec-1', type: 'block', definition: 'lightning/section', attributes: { 'lightning:padding': { top: { unit: 'px', value: 0 } } },
      children: [{ id: 'col-1', type: 'block', definition: 'lightning/column', attributes: {}, children: [{ type: 'block', definition: 'lightning/paragraph', attributes: { text: 'old' } }] }]
    }]
  },
  subjectLine: 'Existing subject'
};

test('toNextContent builds the documented section → column → block tree', () => {
  const email = html('<table><tr><td bgcolor="#000000"><h1 style="font-size:30px">Hi</h1></td></tr><tr><td><p style="color:#333333">Body</p></td><td><p>Side</p></td></tr></table>');
  const { contentBody, provisional } = D.toNextContent(email, NEXT_BASE);
  const root = contentBody['sfdc_cms:block'];
  assert.equal(root.id, 'root');
  assert.equal(root.children.length, 2);
  const [s1, s2] = root.children;
  assert.equal(s1.definition, 'lightning/section');
  assert.notEqual(s1.id, 'sec-1', 'new sections get new ids');
  assert.deepEqual(s1.attributes['lightning:padding'], { top: { unit: 'px', value: 0 } }, 'template attributes are kept');
  const h = s1.children[0].children[0];
  assert.deepEqual([h.definition, h.attributes.text, h.attributes.level, h.attributes['lightning:typography'].fontSize], ['lightning/heading', 'Hi', 'h1', { unit: 'px', value: 30 }]);
  assert.equal(s2.children.length, 2);
  assert.equal(s2.children[0].children[0].attributes['lightning:colorGroup'].textColor, '#333333');
  assert.equal(contentBody.subjectLine, 'Existing subject');
  assert.deepEqual(provisional, ['section background']);
  assert.equal(NEXT_BASE['sfdc_cms:block'].children[0].children[0].children[0].attributes.text, 'old', 'input is not mutated');
});

test('toNextContent flags provisional components', () => {
  const { provisional } = D.toNextContent(html(example('newsletter.html')), NEXT_BASE);
  ['image', 'button', 'divider', 'list', 'html'].forEach((t) => assert.ok(provisional.includes(t), t));
});
