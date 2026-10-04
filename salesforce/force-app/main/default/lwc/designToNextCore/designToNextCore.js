// GENERATED from src/design-to-next.js by scripts/build-lwc.js. Do not edit by hand.
/* eslint-disable */
const module = { exports: {} };
/*!
 * Design to Next
 * Converts HTML emails, Figma designs and Canva (freeform) designs into one editable
 * "email block model" that maps to the out-of-the-box drag-and-drop components of the
 * Salesforce Marketing Cloud Next email builder: section, columns, heading, paragraph,
 * image, button, divider, list and HTML.
 *
 * Works in browsers and Node.js (pass a DOMParser, e.g. from jsdom, for HTML in Node).
 * MIT License (c) Faisal Irfan
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DesignToNext = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.1.0';

  // ===========================================================================
  // Block model
  // ===========================================================================
  //
  // email   = { width, background, preheader, sections: [section], source, report }
  // section = { type: 'section', background, padding: [t, r, b, l], columns: [column] }
  // column  = { width (percent), blocks: [block] }
  // block   = heading | paragraph | image | button | divider | list | spacer | html
  //
  //   heading   { type, level, html, text, align, color, fontSize, fontWeight, fontFamily }
  //   paragraph { type, html, text, align, color, fontSize, lineHeight, fontFamily }
  //   image     { type, src, alt, href, width, align }
  //   button    { type, text, href, background, color, radius, align, fontSize, fullWidth }
  //   divider   { type, color, thickness }
  //   list      { type, ordered, items: [html] }
  //   spacer    { type, height }
  //   html      { type, html, reason }        <- kept as code: nothing is lost

  function section(background, padding) {
    return { type: 'section', background: background || null, padding: padding || [0, 0, 0, 0], columns: [{ width: 100, blocks: [] }] };
  }

  // ===========================================================================
  // Small helpers
  // ===========================================================================

  function parseStyle(str) {
    var out = {};
    String(str || '').split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var k = decl.slice(0, i).trim().toLowerCase();
      var v = decl.slice(i + 1).trim().replace(/\s*!important$/i, '');
      if (k) out[k] = v;
    });
    return out;
  }

  function px(v) {
    if (v === null || v === undefined || v === '') return null;
    var m = /^(-?\d+(?:\.\d+)?)(px)?$/i.exec(String(v).trim());
    return m ? parseFloat(m[1]) : null;
  }

  function normColor(c) {
    if (!c) return null;
    c = String(c).trim().toLowerCase();
    if (c === 'transparent' || c === 'none' || c === 'inherit' || c === 'initial') return null;
    var m = /^#([0-9a-f]{3})$/.exec(c);
    if (m) return '#' + m[1].split('').map(function (x) { return x + x; }).join('');
    if (/^#[0-9a-f]{6}$/.test(c)) return c;
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(c);
    if (m) {
      if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
      return '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + (+n).toString(16)).slice(-2); }).join('');
    }
    var named = { white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff', green: '#008000', gray: '#808080', grey: '#808080' };
    return named[c] || c;
  }

  function hexFromFigma(color, opacity) {
    if (!color) return null;
    var a = (color.a === undefined ? 1 : color.a) * (opacity === undefined ? 1 : opacity);
    if (a === 0) return null;
    return '#' + [color.r, color.g, color.b].map(function (v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); }).join('');
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function textWeight(t) { return Math.max(1, Math.ceil(String(t || '').trim().length / 40)); }

  function headingLevel(size) { return size >= 28 ? 1 : size >= 22 ? 2 : 3; }

  var MERGE_RE = /%%[A-Za-z_][\w ]*%%|\{\{[^}]+\}\}/;
  var AMPSCRIPT_RE = /%%\[|%%=|<script[^>]+runat\s*=\s*["']?server/i;

  // ===========================================================================
  // HTML → blocks
  // ===========================================================================

  var INLINE_TAGS = { A: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, SPAN: 1, BR: 1, FONT: 1, SUP: 1, SUB: 1, SMALL: 1, BIG: 1, S: 1, STRIKE: 1, CODE: 1, ABBR: 1, WBR: 1 };
  var SKIP_TAGS = { STYLE: 1, SCRIPT: 1, HEAD: 1, META: 1, TITLE: 1, LINK: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1 };
  var KEEP_INLINE = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', SUP: 'sup', SUB: 'sub', BR: 'br', S: 's', STRIKE: 's' };

  function fromHtml(html, options) {
    options = options || {};
    var doc;
    if (html && typeof html === 'object' && html.nodeType === 9) {
      doc = html;
    } else {
      var Parser = options.DOMParser || (typeof DOMParser !== 'undefined' ? DOMParser : null);
      if (!Parser) throw new Error('fromHtml needs a DOMParser. In Node.js pass { DOMParser } from jsdom.');
      doc = new Parser().parseFromString(String(html || ''), 'text/html');
    }

    var report = newReport('html');
    var body = doc.body || doc.documentElement;
    var bodyStyle = parseStyle(body.getAttribute && body.getAttribute('style'));
    var emailBg = normColor(body.getAttribute && body.getAttribute('bgcolor')) || normColor(bodyStyle['background-color']) || bgFromShorthand(bodyStyle.background) || null;
    if (!emailBg && body.querySelector) {
      var outer = body.querySelector('table');
      if (outer && /^100%$/.test(outer.getAttribute('width') || parseStyle(outer.getAttribute('style')).width || '')) {
        emailBg = normColor(outer.getAttribute('bgcolor')) || normColor(parseStyle(outer.getAttribute('style'))['background-color']) || bgFromShorthand(parseStyle(outer.getAttribute('style')).background);
      }
    }

    var email = { width: 600, background: emailBg, preheader: '', sections: [], source: 'html', report: report };

    // Detect width and outer background from the main container
    var container = findContainer(body);
    if (container) {
      var cw = px(container.getAttribute('width')) || px(parseStyle(container.getAttribute('style'))['max-width']) || px(parseStyle(container.getAttribute('style')).width);
      if (cw && cw >= 320 && cw <= 900) email.width = cw;
    }

    var ctx = { color: null, fontSize: null, fontFamily: null, align: null, bg: emailBg, lineHeight: null, bold: false, depth: 0 };
    var items = [];
    walkChildren(body, ctx, items, report, email);

    // Wrapper backgrounds that cover everything are the email background
    var bgs = {};
    items.forEach(function (it) { bgs[it.bg || ''] = (bgs[it.bg || ''] || 0) + 1; });

    // Group items into sections by background
    var current = null;
    items.forEach(function (it) {
      if (it.kind === 'row') {
        var s = section(it.bg, [0, 0, 0, 0]);
        s.columns = it.columns;
        email.sections.push(s);
        current = null;
        return;
      }
      if (!current || current.background !== (it.bg || null)) {
        current = section(it.bg || null);
        email.sections.push(current);
      }
      current.columns[0].blocks.push(it.block);
    });

    // An outer wrapper colour applied to all sections is really the email background
    if (!email.background && email.sections.length > 1) {
      var first = email.sections[0].background;
      if (first && email.sections.every(function (s) { return s.background === first; })) {
        email.background = first;
      }
    }

    finishReport(email);
    return email;
  }

  function findContainer(body) {
    var tables = body.getElementsByTagName ? body.getElementsByTagName('table') : [];
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      var w = px(t.getAttribute('width')) || px(parseStyle(t.getAttribute('style'))['max-width']);
      if (w && w >= 320 && w <= 900) return t;
    }
    return null;
  }

  function newReport(source) {
    return { source: source, score: 0, counts: {}, fallbacks: [], warnings: [], editableWeight: 0, totalWeight: 0 };
  }

  function addWarning(report, msg) {
    if (report.warnings.indexOf(msg) === -1) report.warnings.push(msg);
  }

  function elStyle(el) { return parseStyle(el.getAttribute && el.getAttribute('style')); }

  function isHidden(el) {
    var st = elStyle(el);
    if (/none/i.test(st.display || '') || /hidden/i.test(st.visibility || '')) return true;
    if (st['max-height'] === '0' || st['max-height'] === '0px') return /hidden/i.test(st.overflow || '');
    return el.hasAttribute && el.hasAttribute('hidden');
  }

  function childCtx(el, ctx) {
    var st = elStyle(el);
    var c = {
      color: normColor(st.color) || normColor(el.getAttribute && el.getAttribute('color')) || ctx.color,
      fontSize: px(st['font-size']) || ctx.fontSize,
      fontFamily: st['font-family'] || (el.getAttribute && el.getAttribute('face')) || ctx.fontFamily,
      align: (st['text-align'] || (el.getAttribute && el.getAttribute('align')) || ctx.align || '').toLowerCase() || null,
      lineHeight: st['line-height'] || ctx.lineHeight,
      bold: /^(bold|[6-9]00)$/.test(st['font-weight'] || '') || ctx.bold,
      bg: normColor(el.getAttribute && el.getAttribute('bgcolor')) || normColor(st['background-color']) || bgFromShorthand(st.background) || ctx.bg,
      depth: ctx.depth + 1
    };
    if (c.align && ['left', 'center', 'right', 'justify'].indexOf(c.align) === -1) c.align = ctx.align;
    if (/url\(/i.test(st.background || '') || /url\(/i.test(st['background-image'] || '') || (el.getAttribute && el.getAttribute('background'))) {
      c.bgImage = true;
    }
    return c;
  }

  function bgFromShorthand(v) {
    if (!v) return null;
    var m = /(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/i.exec(v);
    return m ? normColor(m[1]) : null;
  }

  function hasMeaningfulText(el) { return (el.textContent || '').replace(/[\s ‌​͏]+/g, '').length > 0; }

  function onlyInlineContent(el) {
    var kids = el.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 1) {
        if (!INLINE_TAGS[n.tagName]) return false;
        if (!onlyInlineContent(n)) return false;
      }
    }
    return true;
  }

  function containsTag(el, tag) { return el.getElementsByTagName && el.getElementsByTagName(tag).length > 0; }

  function inlineHtml(el, report) {
    var out = '';
    var kids = el.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) { out += escapeHtml(n.nodeValue.replace(/\s+/g, ' ')); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName;
      if (tag === 'A') {
        var href = n.getAttribute('href') || '';
        out += '<a href="' + escapeHtml(href) + '">' + inlineHtml(n, report) + '</a>';
      } else if (tag === 'BR') {
        out += '<br>';
      } else if (KEEP_INLINE[tag]) {
        out += '<' + KEEP_INLINE[tag] + '>' + inlineHtml(n, report) + '</' + KEEP_INLINE[tag] + '>';
      } else if (tag === 'SPAN' || tag === 'FONT') {
        var st = elStyle(n);
        var inner = inlineHtml(n, report);
        if (/^(bold|[6-9]00)$/.test(st['font-weight'] || '')) inner = '<strong>' + inner + '</strong>';
        if (/italic/.test(st['font-style'] || '')) inner = '<em>' + inner + '</em>';
        var col = normColor(st.color) || normColor(n.getAttribute('color'));
        out += col ? '<span style="color:' + col + '">' + inner + '</span>' : inner;
      } else {
        out += inlineHtml(n, report);
      }
    }
    return out;
  }

  function cleanHtml(h) {
    return h.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').replace(/^(<br>\s*)+|(\s*<br>)+$/g, '');
  }

  function pushBlock(items, block, ctx) { items.push({ kind: 'block', block: block, bg: ctx.bg }); }

  function walkChildren(el, ctx, items, report, email) {
    var kids = el.childNodes;
    var textBuf = [];
    function flushText() {
      if (!textBuf.length) return;
      var html = cleanHtml(textBuf.join(''));
      textBuf = [];
      if (AMPSCRIPT_RE.test(html.replace(/&lt;/g, '<'))) {
        var code = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        report.fallbacks.push({ reason: 'AMPscript code block', preview: code.slice(0, 80) });
        items.push({ kind: 'block', block: { type: 'html', html: code, reason: 'AMPscript code block' }, bg: ctx.bg });
        return;
      }
      if (html.replace(/<[^>]+>|&nbsp;|\s/g, '')) pushBlock(items, textBlock(html, ctx), ctx);
    }
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) {
        if (n.nodeValue.trim()) textBuf.push(escapeHtml(n.nodeValue));
        continue;
      }
      if (n.nodeType === 8) {
        if (/\[if\s+(gte\s+)?mso/i.test(n.nodeValue) && /v:(roundrect|rect|image|fill)/i.test(n.nodeValue)) {
          addWarning(report, 'Outlook-only VML (bulletproof buttons or background images) was dropped; the builder generates its own Outlook code.');
        }
        continue;
      }
      if (n.nodeType !== 1) continue;
      if (INLINE_TAGS[n.tagName] && n.tagName !== 'A') { textBuf.push(inlineHtml({ childNodes: [n] }, report)); continue; }
      if (n.tagName === 'A' && !isButtonLink(n) && !containsTag(n, 'img')) { textBuf.push(inlineHtml({ childNodes: [n] }, report)); continue; }
      flushText();
      walk(n, ctx, items, report, email);
    }
    flushText();
  }

  function walk(el, ctx, items, report, email) {
    var tag = el.tagName;
    if (SKIP_TAGS[tag]) return;

    if (isHidden(el)) {
      if (!email.preheader && hasMeaningfulText(el) && (el.textContent || '').trim().length < 300 && !items.some(function (it) { return it.kind === 'row' || it.block.type !== 'html'; })) {
        email.preheader = (el.textContent || '').replace(/[\s ‌​͏]+/g, ' ').trim();
      }
      return;
    }

    var c = childCtx(el, ctx);
    if (c.bgImage && !ctx.bgImage) {
      addWarning(report, 'A background image was found. Builder sections use a background colour, so set the image again in the builder if needed.');
    }

    // AMPscript or server-side script inside a leaf element: keep it as code
    if (!/^(TABLE|TBODY|TR)$/.test(tag) && isLeafBlock(el) && AMPSCRIPT_RE.test(el.innerHTML || '')) {
      return pushFallback(items, el, c, report, 'Contains AMPscript logic');
    }

    switch (tag) {
      case 'IMG':
        var img = imageBlock(el, c, null);
        if (img) pushBlock(items, img, c);
        return;
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
        pushBlock(items, headingBlock(el, c, parseInt(tag.charAt(1), 10), report), c);
        return;
      case 'P':
        if (!hasMeaningfulText(el) && containsTag(el, 'img')) return walkChildren(el, c, items, report, email);
        if (!hasMeaningfulText(el)) return;
        if (onlyInlineContent(el)) {
          var only = soleButtonLink(el);
          if (only) { pushBlock(items, buttonFromLink(only, c, null), c); return; }
          pushBlock(items, textBlock(cleanHtml(inlineHtml(el, report)), c), c);
          return;
        }
        return walkChildren(el, c, items, report, email);
      case 'UL': case 'OL':
        var lis = [];
        Array.prototype.forEach.call(el.children, function (li) {
          if (li.tagName === 'LI') lis.push(cleanHtml(inlineHtml(li, report)));
        });
        if (lis.length) pushBlock(items, { type: 'list', ordered: tag === 'OL', items: lis, color: c.color, fontSize: c.fontSize, fontFamily: c.fontFamily }, c);
        return;
      case 'HR':
        var hst = elStyle(el);
        pushBlock(items, { type: 'divider', color: normColor(hst['border-top-color']) || bgFromShorthand(hst['border-top']) || bgFromShorthand(hst.border) || '#dddddd', thickness: px((hst['border-top'] || '').split(' ')[0]) || 1 }, c);
        return;
      case 'A':
        if (isButtonLink(el)) { pushBlock(items, buttonFromLink(el, c, null), c); return; }
        if (containsTag(el, 'img')) {
          var im = el.getElementsByTagName('img')[0];
          var ib = imageBlock(im, c, el.getAttribute('href'));
          if (ib) pushBlock(items, ib, c);
          return;
        }
        pushBlock(items, textBlock(cleanHtml(inlineHtml({ childNodes: [el] }, report)), c), c);
        return;
      case 'FORM': case 'IFRAME': case 'VIDEO': case 'OBJECT': case 'EMBED': case 'INPUT': case 'SELECT': case 'TEXTAREA': case 'BUTTON':
        return pushFallback(items, el, c, report, tag.toLowerCase() + ' elements are not available as drag-and-drop components');
      case 'TABLE':
        return walkTable(el, c, items, report, email);
    }

    // Generic containers: td, div, center, section, span, etc.
    if (isDivider(el)) {
      var dst = elStyle(el);
      pushBlock(items, { type: 'divider', color: bgFromShorthand(dst['border-top'] || dst['border-bottom']) || normColor(el.getAttribute('bgcolor')) || normColor(dst['background-color']) || '#dddddd', thickness: px((dst['border-top'] || dst['border-bottom'] || '').match(/\d+px/) ? (dst['border-top'] || dst['border-bottom']).match(/(\d+)px/)[1] : null) || px(el.getAttribute('height')) || px(dst.height) || 1 }, ctx);
      return;
    }
    if (isSpacer(el)) {
      var h = px(el.getAttribute('height')) || px(elStyle(el).height) || px(elStyle(el)['line-height']) || px(elStyle(el)['font-size']) || 16;
      if (h >= 8) pushBlock(items, { type: 'spacer', height: h }, c);
      return;
    }

    var hybrid = hybridColumns(el);
    if (hybrid) return pushRow(items, hybrid.map(function (d) { return { el: d, width: hybridWidth(d) }; }), c, report, email);

    if (hasMeaningfulText(el) && onlyInlineContent(el)) {
      var btn = soleButtonLink(el);
      if (btn) { pushBlock(items, buttonFromLink(btn, c, buttonBg(el)), c); return; }
      pushBlock(items, textBlock(cleanHtml(inlineHtml(el, report)), c), c);
      return;
    }
    walkChildren(el, c, items, report, email);
  }

  function isLeafBlock(el) {
    return !el.querySelector('table,tr,td,th,div,p,h1,h2,h3,h4,h5,h6,ul,ol,section,center,article');
  }

  function pushFallback(items, el, ctx, report, reason) {
    var html = /^(TD|TH)$/.test(el.tagName)
      ? '<div' + (el.getAttribute('style') ? ' style="' + escapeHtml(el.getAttribute('style')) + '"' : '') + '>' + el.innerHTML.trim() + '</div>'
      : el.outerHTML;
    var block = { type: 'html', html: html, reason: reason };
    report.fallbacks.push({ reason: reason, preview: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
    pushBlock(items, block, ctx);
  }

  function walkTable(table, ctx, items, report, email) {
    var btn = buttonTable(table);
    if (btn) { pushBlock(items, buttonFromLink(btn.link, ctx, btn.bg, btn.radius), ctx); return; }

    var rows = directRows(table);
    rows.forEach(function (tr) {
      var rctx = childCtx(tr, ctx);
      var cells = Array.prototype.filter.call(tr.children, function (c) { return c.tagName === 'TD' || c.tagName === 'TH'; });
      var content = cells.filter(function (c) { return !isHidden(c) && (hasMeaningfulText(c) || containsTag(c, 'img') || containsTag(c, 'hr')); });
      if (content.length >= 2) {
        var total = 0;
        var cols = content.map(function (cell) {
          var w = px(cell.getAttribute('width')) || px(elStyle(cell).width);
          var pct = /%$/.test(cell.getAttribute('width') || '') ? parseFloat(cell.getAttribute('width')) : null;
          var val = pct ? pct / 100 * email.width : w;
          total += val || 0;
          return { el: cell, width: val };
        });
        if (total) cols.forEach(function (col) { col.width = col.width ? col.width / total * 100 : 100 / cols.length; });
        else cols.forEach(function (col) { col.width = 100 / cols.length; });
        pushRow(items, cols, rctx, report, email);
      } else {
        cells.forEach(function (cell) { walk(cell, rctx, items, report, email); });
      }
    });
  }

  function directRows(table) {
    var rows = [];
    Array.prototype.forEach.call(table.children, function (ch) {
      if (ch.tagName === 'TR') rows.push(ch);
      else if (/^(TBODY|THEAD|TFOOT)$/.test(ch.tagName)) {
        Array.prototype.forEach.call(ch.children, function (tr) { if (tr.tagName === 'TR') rows.push(tr); });
      }
    });
    return rows;
  }

  function pushRow(items, cols, ctx, report, email) {
    var columns = cols.map(function (col) {
      var sub = [];
      var cctx = childCtx(col.el, ctx);
      if (col.el.tagName === 'TD' || col.el.tagName === 'TH' || col.el.tagName === 'DIV') walkChildren(col.el, cctx, sub, report, email);
      else walk(col.el, ctx, sub, report, email);
      var blocks = [];
      sub.forEach(function (it) {
        if (it.kind === 'block') blocks.push(it.block);
        else it.columns.forEach(function (c) { blocks = blocks.concat(c.blocks); }); // nested columns are flattened
      });
      return { width: Math.round(col.width * 10) / 10, blocks: blocks };
    }).filter(function (c) { return c.blocks.length; });
    if (columns.length === 1) {
      columns[0].blocks.forEach(function (b) { pushBlock(items, b, ctx); });
      return;
    }
    if (!columns.length) return;
    if (columns.length > 4) {
      addWarning(report, 'A row with ' + columns.length + ' columns was found. The builder supports up to 4, so extra columns were merged into the last one.');
      var keep = columns.slice(0, 3);
      var rest = columns.slice(3);
      keep.push({ width: rest.reduce(function (s, c) { return s + c.width; }, 0), blocks: rest.reduce(function (a, c) { return a.concat(c.blocks); }, []) });
      columns = keep;
    }
    items.push({ kind: 'row', columns: columns, bg: ctx.bg });
  }

  function hybridColumns(el) {
    var divs = Array.prototype.filter.call(el.children || [], function (c) {
      var st = elStyle(c);
      return /inline-block/.test(st.display || '') && (px(st['max-width']) || px(st.width) || /%$/.test(st.width || '')) && (hasMeaningfulText(c) || containsTag(c, 'img'));
    });
    return divs.length >= 2 ? divs : null;
  }

  function hybridWidth(d) {
    var st = elStyle(d);
    if (/%$/.test(st.width || '')) return parseFloat(st.width) * 6;
    return px(st['max-width']) || px(st.width) || 100;
  }

  function isDivider(el) {
    if (hasMeaningfulText(el) || containsTag(el, 'img')) return false;
    var st = elStyle(el);
    var border = st['border-top'] || st['border-bottom'];
    if (border && /\d+px/.test(border) && !/none/.test(border) && el.children.length === 0) return true;
    var h = px(el.getAttribute && el.getAttribute('height')) || px(st.height) || px(st['line-height']);
    var bg = normColor(el.getAttribute && el.getAttribute('bgcolor')) || normColor(st['background-color']);
    return !!(h && h <= 4 && bg && el.children.length === 0);
  }

  function isSpacer(el) {
    if (hasMeaningfulText(el) || containsTag(el, 'img') || containsTag(el, 'table') || containsTag(el, 'hr')) return false;
    return /^(TD|DIV|P|SPAN)$/.test(el.tagName);
  }

  function imageBlock(el, ctx, href) {
    var src = el.getAttribute('src') || '';
    var st = elStyle(el);
    var w = px(el.getAttribute('width')) || px(st.width) || px(st['max-width']);
    var h = px(el.getAttribute('height')) || px(st.height);
    if ((w !== null && w <= 2) || (h !== null && h <= 2) || /spacer|pixel|blank\.gif|trans(parent)?\.gif|open\.gif/i.test(src)) return null;
    if (!href) {
      var p = el.parentNode;
      if (p && p.tagName === 'A') href = p.getAttribute('href');
    }
    return { type: 'image', src: src, alt: el.getAttribute('alt') || '', href: href || null, width: w, align: ctx.align || null };
  }

  function headingBlock(el, ctx, level, report) {
    var st = elStyle(el);
    var c = childCtx(el, ctx);
    return {
      type: 'heading', level: level, html: cleanHtml(inlineHtml(el, report)), text: (el.textContent || '').trim(),
      align: c.align, color: c.color, fontSize: px(st['font-size']) || c.fontSize, fontWeight: st['font-weight'] || 'bold', fontFamily: c.fontFamily
    };
  }

  function textBlock(html, ctx) {
    var text = html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
    var size = ctx.fontSize || 0;
    if (text.length <= 120 && (size >= 22 || (ctx.bold && size >= 18))) {
      return { type: 'heading', level: headingLevel(size), html: html, text: text, align: ctx.align, color: ctx.color, fontSize: size, fontWeight: 'bold', fontFamily: ctx.fontFamily };
    }
    return { type: 'paragraph', html: html, text: text, align: ctx.align, color: ctx.color, fontSize: ctx.fontSize, lineHeight: ctx.lineHeight, fontFamily: ctx.fontFamily };
  }

  function isButtonLink(a) {
    if (!a || a.tagName !== 'A') return false;
    var st = elStyle(a);
    var bg = normColor(st['background-color']) || bgFromShorthand(st.background);
    var hasBox = /inline-block|block/.test(st.display || '') || px((st.padding || '').split(' ')[0]) >= 6 || /\d/.test(st['padding-top'] || '') || /\d/.test(st.border || '');
    return !!(bg && hasBox) || /\b(btn|button|cta)\b/i.test(a.getAttribute('class') || '');
  }

  function soleButtonLink(el) {
    var links = el.getElementsByTagName('a');
    if (links.length !== 1) return null;
    var a = links[0];
    var outside = (el.textContent || '').replace((a.textContent || ''), '').trim();
    return !outside && isButtonLink(a) ? a : null;
  }

  function buttonTable(table) {
    var rows = directRows(table);
    if (rows.length !== 1) return null;
    var cells = Array.prototype.filter.call(rows[0].children, function (c) { return /^T[DH]$/.test(c.tagName); });
    if (cells.length !== 1) return null;
    var td = cells[0];
    var links = td.getElementsByTagName('a');
    if (links.length !== 1 || containsTag(td, 'img') || containsTag(td, 'table')) return null;
    var text = (td.textContent || '').trim();
    if (!text || text.length > 50 || text !== (links[0].textContent || '').trim()) return null;
    var bg = buttonBg(td) || buttonBg(table);
    if (!bg && !isButtonLink(links[0])) return null;
    var st = elStyle(td);
    return { link: links[0], bg: bg, radius: px(st['border-radius']) || px(elStyle(links[0])['border-radius']) || px(elStyle(table)['border-radius']) };
  }

  function buttonBg(el) {
    var st = elStyle(el);
    return normColor(el.getAttribute && el.getAttribute('bgcolor')) || normColor(st['background-color']) || bgFromShorthand(st.background);
  }

  function buttonFromLink(a, ctx, bg, radius) {
    var st = elStyle(a);
    var c = childCtx(a, ctx);
    return {
      type: 'button',
      text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
      href: a.getAttribute('href') || '',
      background: normColor(st['background-color']) || bgFromShorthand(st.background) || bg || '#0f6e6e',
      color: normColor(st.color) || c.color || '#ffffff',
      radius: radius || px(st['border-radius']) || 0,
      align: ctx.align || 'left',
      fontSize: px(st['font-size']) || c.fontSize || 16,
      fullWidth: /^100%$/.test(st.width || '') || /block/.test(st.display || '') && !/inline/.test(st.display || '')
    };
  }

  // ===========================================================================
  // Figma → blocks
  // ===========================================================================
  //
  // Input: a Figma REST API file response (GET /v1/files/:key), a nodes response
  // (GET /v1/files/:key/nodes?ids=...), or a single FRAME node.
  // Best results with auto-layout frames: each top-level child frame becomes a
  // section, horizontal auto-layout becomes columns.

  function fromFigma(input, options) {
    options = options || {};
    var report = newReport('figma');
    var frame = pickFigmaFrame(input, options.frameName);
    if (!frame) throw new Error('No email frame found. Select a top-level frame (around 600px wide) in Figma.');

    var bbox = frame.absoluteBoundingBox || { x: 0, y: 0, width: 600, height: 0 };
    var email = {
      width: Math.round(bbox.width) || 600,
      background: figmaFill(frame),
      preheader: '',
      sections: [],
      source: 'figma',
      frameName: frame.name,
      report: report
    };
    var imageRefs = {};

    var children = (frame.children || []).filter(visible);
    if (frame.layoutMode === 'NONE' || !frame.layoutMode) {
      // Not auto-layout: infer rows from positions
      var els = [];
      flattenFigma(children, els, bbox, report, imageRefs);
      var inferred = fromPositioned({ width: bbox.width, background: email.background, elements: els }, { source: 'figma' });
      email.sections = inferred.sections;
      if (children.length) addWarning(report, 'The frame does not use auto layout, so rows and columns were inferred from positions. Auto layout gives more exact results.');
    } else {
      var defaultSection = null;
      children.forEach(function (child) {
        if (isFigmaContainer(child) && !figmaButton(child)) {
          email.sections.push(figmaSection(child, email, report, imageRefs));
          defaultSection = null;
        } else {
          if (!defaultSection) { defaultSection = section(null, [0, 0, 0, 0]); email.sections.push(defaultSection); }
          figmaBlocks(child, defaultSection.columns[0].blocks, report, imageRefs, email);
        }
      });
    }
    email.imageRefs = Object.keys(imageRefs);
    if (email.imageRefs.length) {
      addWarning(report, email.imageRefs.length + ' image(s) come from Figma. They are exported through the Figma Images API and uploaded to Salesforce CMS during import.');
    }
    finishReport(email);
    return email;
  }

  function visible(n) { return n && n.visible !== false; }

  function pickFigmaFrame(input, name) {
    if (!input) return null;
    if (input.type === 'FRAME' || input.type === 'COMPONENT' || input.type === 'INSTANCE') return input;
    if (input.nodes) {
      var keys = Object.keys(input.nodes);
      for (var i = 0; i < keys.length; i++) {
        var doc = input.nodes[keys[i]] && input.nodes[keys[i]].document;
        if (doc) return pickFigmaFrame(doc, name);
      }
    }
    var root = input.document || input;
    var frames = [];
    (function collect(n, depth) {
      if (!n || depth > 3) return;
      if ((n.type === 'FRAME' || n.type === 'COMPONENT') && depth >= 1) frames.push(n);
      if (n.type === 'DOCUMENT' || n.type === 'CANVAS') (n.children || []).forEach(function (c) { collect(c, depth + 1); });
    })(root, 0);
    if (name) {
      var named = frames.filter(function (f) { return f.name === name; })[0];
      if (named) return named;
    }
    var emailish = frames.filter(function (f) { return /email|newsletter|edm/i.test(f.name); })[0];
    if (emailish) return emailish;
    return frames.filter(function (f) {
      var w = f.absoluteBoundingBox && f.absoluteBoundingBox.width;
      return w >= 320 && w <= 900;
    })[0] || frames[0] || null;
  }

  function figmaFill(node) {
    var fills = (node.fills || []).filter(function (f) { return f.visible !== false; });
    for (var i = fills.length - 1; i >= 0; i--) {
      if (fills[i].type === 'SOLID') return hexFromFigma(fills[i].color, fills[i].opacity);
    }
    return null;
  }

  function figmaImageFill(node) {
    var fills = (node.fills || []).filter(function (f) { return f.visible !== false && f.type === 'IMAGE'; });
    return fills.length ? fills[0].imageRef || 'unknown' : null;
  }

  function isFigmaContainer(n) { return n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'COMPONENT' || n.type === 'INSTANCE' || n.type === 'SECTION'; }

  function figmaSection(node, email, report, imageRefs) {
    var s = section(figmaFill(node), [node.paddingTop || 0, node.paddingRight || 0, node.paddingBottom || 0, node.paddingLeft || 0]);
    if (figmaImageFill(node)) addWarning(report, 'Section "' + node.name + '" has a background image. Builder sections use a background colour, so set the image again in the builder if needed.');
    var kids = (node.children || []).filter(visible);
    var columnKids = kids.filter(function (k) { return isFigmaContainer(k) && !figmaButton(k); });
    if (node.layoutMode === 'HORIZONTAL' && kids.length >= 2 && !figmaButton(node)) {
      var total = kids.reduce(function (sum, k) { return sum + ((k.absoluteBoundingBox && k.absoluteBoundingBox.width) || 1); }, 0);
      s.columns = kids.slice(0, 4).map(function (k) {
        var blocks = [];
        figmaBlocks(k, blocks, report, imageRefs, email);
        return { width: Math.round(((k.absoluteBoundingBox && k.absoluteBoundingBox.width) || 1) / total * 1000) / 10, blocks: blocks };
      });
      if (kids.length > 4) addWarning(report, 'Frame "' + node.name + '" has more than 4 columns; the builder supports up to 4.');
      return s;
    }
    if (kids.length === 1 && columnKids.length === 1 && columnKids[0].layoutMode === 'HORIZONTAL') {
      var inner = figmaSection(columnKids[0], email, report, imageRefs);
      inner.background = inner.background || s.background;
      inner.padding = s.padding;
      return inner;
    }
    kids.forEach(function (k) { figmaBlocks(k, s.columns[0].blocks, report, imageRefs, email); });
    return s;
  }

  function figmaButton(n) {
    if (!isFigmaContainer(n)) return null;
    var texts = [];
    (function find(x) { if (x.type === 'TEXT') texts.push(x); (x.children || []).forEach(find); })(n);
    var named = /\b(button|btn|cta)\b/i.test(n.name || '');
    var fill = figmaFill(n) || findChildFill(n);
    var bb = n.absoluteBoundingBox || {};
    var small = bb.height && bb.height <= 80;
    var hasImage = false;
    (function scan(x) { if (x !== n && figmaImageFill(x)) hasImage = true; (x.children || []).forEach(scan); })(n);
    var simple = (n.children || []).every(function (k) { return /^(TEXT|RECTANGLE|VECTOR|ELLIPSE|BOOLEAN_OPERATION)$/.test(k.type); });
    if (hasImage || !simple) return null;
    if (texts.length === 1 && (named || (fill && small && (texts[0].characters || '').length <= 40))) {
      return { text: texts[0], fill: fill };
    }
    return null;
  }

  function findChildFill(n) {
    var kids = n.children || [];
    for (var i = 0; i < kids.length; i++) if (kids[i].type === 'RECTANGLE') return figmaFill(kids[i]);
    return null;
  }

  function figmaLink(node) {
    if (node.style && node.style.hyperlink && node.style.hyperlink.url) return node.style.hyperlink.url;
    var m = /(https?:\/\/\S+)/.exec(node.name || '');
    return m ? m[1] : null;
  }

  function figmaBlocks(node, blocks, report, imageRefs, email) {
    if (!visible(node)) return;
    var bb = node.absoluteBoundingBox || {};
    var btn = figmaButton(node);
    if (btn) {
      var t = btn.text;
      var ts = t.style || {};
      blocks.push({
        type: 'button', text: (t.characters || '').trim(), href: figmaLink(t) || figmaLink(node) || '',
        background: btn.fill || '#0f6e6e', color: figmaFill(t) || '#ffffff',
        radius: node.cornerRadius || (node.rectangleCornerRadii ? node.rectangleCornerRadii[0] : 0) || 0,
        align: alignFromParent(node, email), fontSize: ts.fontSize || 16,
        fullWidth: bb.width >= email.width * 0.9
      });
      if (!figmaLink(t) && !figmaLink(node)) addWarning(report, 'Button "' + (t.characters || '').trim() + '" has no link. Add a hyperlink to the text in Figma, or put the URL in the layer name.');
      return;
    }
    var imageRef = figmaImageFill(node);
    if (imageRef && node.type !== 'TEXT') {
      imageRefs[imageRef] = true;
      blocks.push({ type: 'image', src: 'figma-image:' + node.id, imageRef: imageRef, figmaNodeId: node.id, alt: node.name && !/^(image|rectangle|frame)\s*\d*$/i.test(node.name) ? node.name : '', href: figmaLink(node), width: Math.round(bb.width) || null, align: 'center' });
      if (!node.name || /^(image|rectangle|frame)\s*\d*$/i.test(node.name)) addWarning(report, 'Some images have no alt text. Rename the image layers in Figma to describe them.');
      return;
    }
    switch (node.type) {
      case 'TEXT':
        blocks.push(figmaText(node));
        return;
      case 'LINE':
        blocks.push({ type: 'divider', color: strokeColor(node) || '#dddddd', thickness: node.strokeWeight || 1 });
        return;
      case 'RECTANGLE':
        if (bb.height && bb.height <= 4) { blocks.push({ type: 'divider', color: figmaFill(node) || '#dddddd', thickness: Math.max(1, Math.round(bb.height)) }); return; }
        if (!figmaFill(node)) { if (bb.height >= 8) blocks.push({ type: 'spacer', height: Math.round(bb.height) }); return; }
        break;
      case 'VECTOR': case 'BOOLEAN_OPERATION': case 'STAR': case 'ELLIPSE': case 'POLYGON':
        blocks.push({ type: 'image', src: 'figma-image:' + node.id, figmaNodeId: node.id, rasterize: true, alt: node.name || '', width: Math.round(bb.width) || null, align: 'center' });
        addWarning(report, 'Vector shapes and icons are exported as images.');
        return;
    }
    if (isFigmaContainer(node)) {
      var kids = (node.children || []).filter(visible);
      if (node.layoutMode === 'HORIZONTAL' && kids.length >= 2) {
        addWarning(report, 'Frame "' + node.name + '" is a row inside a column. Nested columns are stacked vertically in the builder.');
      }
      if (/\b(icon|logo|illustration|graphic)\b/i.test(node.name || '') && !kids.some(function (k) { return k.type === 'TEXT'; })) {
        blocks.push({ type: 'image', src: 'figma-image:' + node.id, figmaNodeId: node.id, rasterize: true, alt: node.name, width: Math.round(bb.width) || null, align: 'center' });
        return;
      }
      kids.forEach(function (k) { figmaBlocks(k, blocks, report, imageRefs, email); });
    }
  }

  function strokeColor(node) {
    var s = (node.strokes || [])[0];
    return s && s.type === 'SOLID' ? hexFromFigma(s.color, s.opacity) : null;
  }

  function alignFromParent(node, email) {
    var bb = node.absoluteBoundingBox;
    if (!bb) return 'left';
    return 'center';
  }

  function figmaText(node) {
    var st = node.style || {};
    var text = node.characters || '';
    var html = figmaRichText(node);
    var size = st.fontSize || 16;
    var align = (st.textAlignHorizontal || 'LEFT').toLowerCase();
    var isHeading = /\b(heading|title|headline|h[1-6])\b/i.test(node.name || '') || (size >= 22 && text.length <= 120) || (st.fontWeight >= 700 && size >= 18 && text.length <= 80);
    var common = { html: html, text: text, align: align === 'justified' ? 'justify' : align, color: figmaFill(node), fontSize: size, fontFamily: st.fontFamily ? '\'' + st.fontFamily + '\', Arial, sans-serif' : null };
    if (isHeading) {
      var m = /\bh([1-6])\b/i.exec(node.name || '');
      return assign({ type: 'heading', level: m ? +m[1] : headingLevel(size), fontWeight: String(st.fontWeight || 700) }, common);
    }
    if (/^\s*([•\-–*]|\d+[.)])\s+/m.test(text) && text.split('\n').length > 1) {
      var lines = text.split('\n').filter(function (l) { return l.trim(); });
      if (lines.every(function (l) { return /^\s*([•\-–*]|\d+[.)])\s+/.test(l); })) {
        return { type: 'list', ordered: /^\s*\d/.test(lines[0]), items: lines.map(function (l) { return escapeHtml(l.replace(/^\s*([•\-–*]|\d+[.)])\s+/, '')); }), color: common.color, fontSize: size, fontFamily: common.fontFamily };
      }
    }
    return assign({ type: 'paragraph', lineHeight: st.lineHeightPx ? Math.round(st.lineHeightPx) + 'px' : null }, common);
  }

  function figmaRichText(node) {
    var chars = node.characters || '';
    var overrides = node.characterStyleOverrides || [];
    var table = node.styleOverrideTable || {};
    var base = node.style || {};
    if (!overrides.length) return linkWrap(escapeHtml(chars).replace(/\n/g, '<br>'), base);
    var out = '', run = '', runId = overrides[0] || 0;
    function flush(id) {
      if (!run) return;
      var st = id ? assign({}, base, table[id] || {}) : base;
      var h = escapeHtml(run).replace(/\n/g, '<br>');
      if ((st.fontWeight || 400) >= 600 && (base.fontWeight || 400) < 600) h = '<strong>' + h + '</strong>';
      if (st.italic && !base.italic) h = '<em>' + h + '</em>';
      if (table[id] && table[id].hyperlink && table[id].hyperlink.url) h = '<a href="' + escapeHtml(table[id].hyperlink.url) + '">' + h + '</a>';
      out += h;
    }
    for (var i = 0; i < chars.length; i++) {
      var id = overrides[i] || 0;
      if (id !== runId) { flush(runId); run = ''; runId = id; }
      run += chars[i];
    }
    flush(runId);
    return linkWrap(out, base);
  }

  function linkWrap(html, style) {
    return style && style.hyperlink && style.hyperlink.url ? '<a href="' + escapeHtml(style.hyperlink.url) + '">' + html + '</a>' : html;
  }

  function flattenFigma(nodes, out, origin, report, imageRefs) {
    nodes.forEach(function (n) {
      if (!visible(n)) return;
      var bb = n.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };
      var base = { x: bb.x - origin.x, y: bb.y - origin.y, width: bb.width, height: bb.height, name: n.name };
      var btn = figmaButton(n);
      if (btn) {
        var bstyle = btn.text.style || {};
        out.push(assign(base, { type: 'button', text: (btn.text.characters || '').trim(), fill: btn.fill, color: figmaFill(btn.text), href: figmaLink(btn.text) || figmaLink(n), radius: n.cornerRadius || 0, fontSize: bstyle.fontSize }));
        return;
      }
      var ref = figmaImageFill(n);
      if (ref && n.type !== 'TEXT') { imageRefs[ref] = true; out.push(assign(base, { type: 'image', src: 'figma-image:' + n.id, alt: n.name, href: figmaLink(n) })); return; }
      if (n.type === 'TEXT') {
        var t = figmaText(n);
        out.push(assign(base, { type: 'text', text: n.characters, html: t.html, fontSize: (n.style || {}).fontSize, fontWeight: (n.style || {}).fontWeight, color: figmaFill(n), align: t.align, href: figmaLink(n) }));
        return;
      }
      if (n.type === 'LINE') { out.push(assign(base, { type: 'line', fill: strokeColor(n) })); return; }
      if (n.type === 'RECTANGLE') { out.push(assign(base, { type: 'shape', fill: figmaFill(n), radius: n.cornerRadius || 0 })); return; }
      if (/^(VECTOR|BOOLEAN_OPERATION|STAR|ELLIPSE|POLYGON)$/.test(n.type)) { out.push(assign(base, { type: 'image', src: 'figma-image:' + n.id, alt: n.name, rasterize: true })); return; }
      if (isFigmaContainer(n)) {
        if (figmaFill(n)) out.push(assign(base, { type: 'shape', fill: figmaFill(n), radius: n.cornerRadius || 0 }));
        flattenFigma((n.children || []), out, origin, report, imageRefs);
      }
    });
  }

  // ===========================================================================
  // Freeform / Canva → blocks
  // ===========================================================================
  //
  // Input: { width, background, elements: [ { type: 'text'|'image'|'shape'|'line'|'button',
  //          x, y, width, height, text, html, fontSize, fontWeight, color, align, src, alt,
  //          href, fill, radius } ] }
  // Used for Canva designs (elements read by a Canva app) and for Figma frames without
  // auto layout. Rows and columns are inferred from positions.

  function fromPositioned(design, options) {
    options = options || {};
    var report = newReport(options.source || 'canva');
    var W = design.width || 600;
    var els = (design.elements || []).map(function (e, i) { return assign({ _i: i }, e); });

    // 1. Coloured bands that span the width become section backgrounds
    var bands = [];
    var rest = [];
    els.forEach(function (e) {
      if (e.type === 'shape' && e.fill && e.width >= W * 0.8 && e.height > 8) bands.push(e);
      else rest.push(e);
    });

    // 2. Shapes holding one short text become buttons; thin shapes become dividers
    var used = {};
    var items = [];
    rest.forEach(function (e) {
      if (e.type === 'shape') {
        if (e.height <= 4 && e.fill) { items.push(assign({}, e, { type: 'line' })); used[e._i] = true; return; }
        var inside = rest.filter(function (t) { return t.type === 'text' && contains(e, t); });
        if (inside.length === 1 && (inside[0].text || '').length <= 40 && e.height <= 90 && e.width < W * 0.9) {
          items.push(assign({}, e, { type: 'button', text: inside[0].text, color: inside[0].color, fontSize: inside[0].fontSize, href: inside[0].href || e.href }));
          used[e._i] = true;
          used[inside[0]._i] = true;
          return;
        }
        if (inside.length) used[e._i] = true; // a decorative box behind content
        if (!inside.length && e.fill) { used[e._i] = true; }
      }
    });
    rest.forEach(function (e) { if (!used[e._i]) items.push(e); });

    // 3. Rows by vertical overlap
    items.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var rows = [];
    items.forEach(function (e) {
      var row = rows[rows.length - 1];
      if (row && e.y < row.bottom - Math.min(8, e.height / 3)) { row.items.push(e); row.bottom = Math.max(row.bottom, e.y + e.height); }
      else rows.push({ top: e.y, bottom: e.y + e.height, items: [e] });
    });

    // 4. Sections by band; side-by-side rows become column sections, and a row that lines up
    //    with the columns above it (e.g. product titles under product images) joins them
    var email = { width: W, background: normColor(design.background) || null, preheader: '', sections: [], source: options.source || 'canva', report: report };
    var pending = null;
    var lastMulti = null;
    rows.forEach(function (row) {
      var mid = (row.top + row.bottom) / 2;
      var band = bands.filter(function (b) { return mid >= b.y && mid <= b.y + b.height; })[0] || null;
      var bg = band ? normColor(band.fill) : null;
      var cols = clusterColumns(row.items);
      if (cols.length === 1) {
        lastMulti = null;
        if (!pending || pending.background !== bg) { pending = section(bg, [0, 0, 0, 0]); email.sections.push(pending); }
        cols[0].sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { pending.columns[0].blocks.push(positionedBlock(e, W, report)); });
        return;
      }
      pending = null;
      if (cols.length > 4) {
        addWarning(report, 'A row with ' + cols.length + ' side-by-side items was found. The builder supports up to 4 columns.');
        cols = cols.slice(0, 3).concat([cols.slice(3).reduce(function (a, c) { return a.concat(c); }, [])]);
      }
      var ranges = cols.map(function (c) { return colRange(c); });
      var sameShape = lastMulti && lastMulti.section.background === bg && lastMulti.ranges.length === ranges.length &&
        ranges.every(function (r, i) { return r[0] < lastMulti.ranges[i][1] - 4 && r[1] > lastMulti.ranges[i][0] + 4; });
      if (sameShape) {
        cols.forEach(function (c, i) {
          c.sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { lastMulti.section.columns[i].blocks.push(positionedBlock(e, W, report)); });
        });
        return;
      }
      var s = section(bg, [0, 0, 0, 0]);
      var total = cols.reduce(function (sum, c) { return sum + colWidth(c); }, 0);
      s.columns = cols.map(function (c) {
        return { width: Math.round(colWidth(c) / total * 1000) / 10, blocks: c.sort(function (a, b) { return a.y - b.y; }).map(function (e) { return positionedBlock(e, W, report); }) };
      });
      email.sections.push(s);
      lastMulti = { section: s, ranges: ranges };
    });

    if (els.some(function (e) { return e.rotation; })) addWarning(report, 'Rotated elements are placed straight in email.');
    finishReport(email);
    return email;
  }

  function contains(outer, inner) {
    return inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
  }

  function clusterColumns(items) {
    var cols = [];
    items.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (e) {
      var col = cols.filter(function (c) {
        var l = Math.min.apply(null, c.map(function (x) { return x.x; }));
        var r = Math.max.apply(null, c.map(function (x) { return x.x + x.width; }));
        return e.x < r - 4 && e.x + e.width > l + 4;
      })[0];
      if (col) col.push(e); else cols.push([e]);
    });
    return cols;
  }

  function colRange(c) {
    return [Math.min.apply(null, c.map(function (x) { return x.x; })), Math.max.apply(null, c.map(function (x) { return x.x + x.width; }))];
  }

  function colWidth(c) {
    var l = Math.min.apply(null, c.map(function (x) { return x.x; }));
    var r = Math.max.apply(null, c.map(function (x) { return x.x + x.width; }));
    return Math.max(1, r - l);
  }

  function positionedBlock(e, W, report) {
    var align = e.align || (Math.abs((e.x + e.width / 2) - W / 2) < W * 0.08 ? 'center' : (e.x > W / 2 ? 'right' : 'left'));
    switch (e.type) {
      case 'text':
        var size = e.fontSize || 16;
        var html = e.html || escapeHtml(e.text || '').replace(/\n/g, '<br>');
        if (e.href) html = '<a href="' + escapeHtml(e.href) + '">' + html + '</a>';
        if ((size >= 22 && (e.text || '').length <= 120) || ((e.fontWeight || 400) >= 700 && size >= 18 && (e.text || '').length <= 80)) {
          return { type: 'heading', level: headingLevel(size), html: html, text: e.text || '', align: align, color: normColor(e.color), fontSize: size, fontWeight: String(e.fontWeight || 700), fontFamily: e.fontFamily || null };
        }
        return { type: 'paragraph', html: html, text: e.text || '', align: align, color: normColor(e.color), fontSize: size, lineHeight: e.lineHeight || null, fontFamily: e.fontFamily || null };
      case 'image':
        if (!e.alt) addWarning(report, 'Some images have no alt text. Add a description for screen readers.');
        return { type: 'image', src: e.src || '', alt: e.alt || '', href: e.href || null, width: Math.round(e.width) || null, align: align, rasterize: e.rasterize || undefined };
      case 'button':
        if (!e.href) addWarning(report, 'Button "' + (e.text || '') + '" has no link yet.');
        return { type: 'button', text: e.text || '', href: e.href || '', background: normColor(e.fill) || '#0f6e6e', color: normColor(e.color) || '#ffffff', radius: e.radius || 0, align: align, fontSize: e.fontSize || 16, fullWidth: e.width >= W * 0.9 };
      case 'line':
        return { type: 'divider', color: normColor(e.fill) || '#dddddd', thickness: Math.max(1, Math.round(Math.min(e.height || 1, 4))) };
      case 'shape':
        return { type: 'spacer', height: Math.round(e.height || 16) };
    }
    report.fallbacks.push({ reason: 'Unknown element type "' + e.type + '"', preview: e.text || '' });
    return { type: 'html', html: escapeHtml(e.text || ''), reason: 'Unknown element type' };
  }

  // ===========================================================================
  // Report
  // ===========================================================================

  function finishReport(email) {
    var r = email.report;
    var editable = 0, total = 0;
    r.counts = {};
    function count(type) { r.counts[type] = (r.counts[type] || 0) + 1; }
    email.sections.forEach(function (s) {
      count('section');
      if (s.columns.length > 1) count('columns');
      s.columns.forEach(function (c) {
        c.blocks.forEach(function (b) {
          count(b.type);
          var visibleText = b.type === 'html' ? (b.html || '').replace(/%%\[[\s\S]*?\]%%/g, '').replace(/<[^>]+>/g, '').trim() : '';
          var w = b.type === 'html' ? (visibleText ? textWeight(visibleText) : 0) :
            b.type === 'paragraph' || b.type === 'heading' ? textWeight(b.text) :
            b.type === 'list' ? b.items.length :
            b.type === 'spacer' || b.type === 'divider' ? 0 : 1;
          total += w;
          if (b.type !== 'html') editable += w;
          if ((b.type === 'paragraph' || b.type === 'heading') && MERGE_RE.test(b.html)) {
            addWarning(r, 'Personalisation strings (like %%FirstName%%) were kept in the text. Map them to merge fields in the builder.');
          }
          if (b.type === 'image' && b.src && !/^(https?:|figma-image:|data:)/.test(b.src)) {
            addWarning(r, 'Some image paths are relative (' + b.src.slice(0, 40) + '). Upload images or use full https:// URLs.');
          }
        });
      });
    });
    r.editableWeight = editable;
    r.totalWeight = total;
    r.score = total ? Math.round(editable / total * 100) : 100;
    return r;
  }

  // ===========================================================================
  // Preview renderer: block model → email HTML (for side-by-side checks)
  // ===========================================================================

  function renderPreview(email) {
    var W = email.width || 600;
    var out = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + (email.background || '#f4f4f4') + ';">' +
      '<tr><td align="center" style="padding:16px 0;"><table role="presentation" width="' + W + '" cellpadding="0" cellspacing="0" style="width:100%;max-width:' + W + 'px;background:#ffffff;">';
    email.sections.forEach(function (s, si) {
      var pad = (s.padding || [0, 0, 0, 0]).map(function (p) { return (p || 0) + 'px'; }).join(' ');
      out += '<tr><td data-section="' + si + '" style="background:' + (s.background || 'transparent') + ';padding:' + pad + ';">';
      if (s.columns.length > 1) {
        out += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>';
        s.columns.forEach(function (c) {
          out += '<td valign="top" width="' + c.width + '%" style="padding:8px;">' + c.blocks.map(renderBlock).join('') + '</td>';
        });
        out += '</tr></table>';
      } else {
        out += s.columns[0].blocks.map(renderBlock).join('');
      }
      out += '</td></tr>';
    });
    out += '</table></td></tr></table>';
    return out;
  }

  function renderBlock(b) {
    var font = 'font-family:' + (b.fontFamily || 'Arial, Helvetica, sans-serif') + ';';
    var align = b.align ? 'text-align:' + b.align + ';' : '';
    switch (b.type) {
      case 'heading':
        var hs = b.fontSize || (b.level === 1 ? 28 : b.level === 2 ? 22 : 18);
        return '<h' + b.level + ' style="margin:0;padding:12px 24px;' + font + 'font-size:' + hs + 'px;line-height:1.25;' + align + (b.color ? 'color:' + b.color + ';' : '') + '">' + b.html + '</h' + b.level + '>';
      case 'paragraph':
        return '<p style="margin:0;padding:8px 24px;' + font + 'font-size:' + (b.fontSize || 16) + 'px;line-height:' + (b.lineHeight || '1.5') + ';' + align + (b.color ? 'color:' + b.color + ';' : '') + '">' + b.html + '</p>';
      case 'image':
        var src = /^figma-image:/.test(b.src) ? 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + (b.width || 300) + '" height="120"><rect width="100%" height="100%" fill="#e3e8e7"/><text x="50%" y="50%" font-family="Arial" font-size="13" fill="#5b6b69" text-anchor="middle" dominant-baseline="middle">Figma image: ' + escapeHtml(b.alt || 'image') + '</text></svg>') : b.src;
        var img = '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(b.alt) + '" width="' + (b.width || '') + '" style="display:inline-block;max-width:100%;height:auto;border:0;">';
        if (b.href) img = '<a href="' + escapeHtml(b.href) + '">' + img + '</a>';
        return '<div style="padding:8px 24px;text-align:' + (b.align || 'center') + ';">' + img + '</div>';
      case 'button':
        return '<div style="padding:12px 24px;text-align:' + (b.align || 'left') + ';"><a href="' + escapeHtml(b.href) + '" style="display:' + (b.fullWidth ? 'block' : 'inline-block') + ';background:' + b.background + ';color:' + b.color + ';border-radius:' + (b.radius || 0) + 'px;padding:12px 24px;font-family:Arial,sans-serif;font-size:' + (b.fontSize || 16) + 'px;font-weight:bold;text-decoration:none;text-align:center;">' + escapeHtml(b.text) + '</a></div>';
      case 'divider':
        return '<div style="padding:8px 24px;"><div style="border-top:' + (b.thickness || 1) + 'px solid ' + (b.color || '#dddddd') + ';"></div></div>';
      case 'list':
        var tag = b.ordered ? 'ol' : 'ul';
        return '<' + tag + ' style="margin:0;padding:8px 24px 8px 48px;' + font + 'font-size:' + (b.fontSize || 16) + 'px;line-height:1.5;' + (b.color ? 'color:' + b.color + ';' : '') + '">' + b.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</' + tag + '>';
      case 'spacer':
        return '<div style="height:' + (b.height || 16) + 'px;line-height:' + (b.height || 16) + 'px;font-size:1px;">&nbsp;</div>';
      case 'html':
        return '<div data-fallback="true" style="outline:2px dashed #e0a100;outline-offset:-2px;">' + b.html + '</div>';
    }
    return '';
  }


  // ===========================================================================
  // Block model → Marketing Cloud Next email content (sfdc_cms__email)
  // ===========================================================================
  //
  // Verified against Salesforce's documented example: the contentBody holds a tree under
  // "sfdc_cms:block" of { type: 'block', definition, attributes, children }, with
  // lightning/section → lightning/column → lightning/heading | lightning/paragraph.
  //
  // PROVISIONAL: definitions and attribute names for image, button, divider, list and
  // html blocks, and section background colour, are not in the public example. They live
  // in NEXT_MAP below so they can be corrected in one place once checked with the
  // Inspect tab of the editor extension.

  var NEXT_MAP = {
    verified: { section: true, column: true, heading: true, paragraph: true },
    definitions: {
      section: 'lightning/section', column: 'lightning/column', heading: 'lightning/heading', paragraph: 'lightning/paragraph',
      image: 'lightning/image', button: 'lightning/button', divider: 'lightning/divider', list: 'lightning/list', html: 'lightning/html'
    }
  };

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  function size(v) { return v ? { unit: 'px', value: Number(v) } : undefined; }

  function clean(obj) {
    Object.keys(obj).forEach(function (k) {
      if (obj[k] === undefined || obj[k] === null) delete obj[k];
      else if (typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
        clean(obj[k]);
        if (!Object.keys(obj[k]).length) delete obj[k];
      }
    });
    return obj;
  }

  function nextBlock(b) {
    var d = NEXT_MAP.definitions;
    var color = b.color ? { textColor: b.color } : undefined;
    switch (b.type) {
      case 'heading':
        return { type: 'block', definition: d.heading, attributes: clean({
          text: b.html, level: 'h' + Math.min(Math.max(b.level || 2, 1), 6), align: b.align || undefined,
          'lightning:typography': { fontSize: size(b.fontSize), fontWeight: '{!$brand.fontWeight.bold}' },
          'lightning:colorGroup': color
        }) };
      case 'paragraph':
        return { type: 'block', definition: d.paragraph, attributes: clean({
          text: b.html, align: b.align || undefined,
          'lightning:typography': { fontSize: size(b.fontSize) },
          'lightning:colorGroup': color
        }) };
      case 'image':
        return { type: 'block', definition: d.image, attributes: clean({ imageUrl: b.src, altText: b.alt, linkUrl: b.href || undefined, width: size(b.width), align: b.align || undefined }) };
      case 'button':
        return { type: 'block', definition: d.button, attributes: clean({
          text: b.text, url: b.href, align: b.align || undefined,
          'lightning:colorGroup': { backgroundColor: b.background, textColor: b.color },
          'lightning:border': b.radius ? { radius: size(b.radius) } : undefined
        }) };
      case 'divider':
        return { type: 'block', definition: d.divider, attributes: clean({ color: b.color, thickness: size(b.thickness) }) };
      case 'list':
        return { type: 'block', definition: d.list, attributes: clean({ text: '<' + (b.ordered ? 'ol' : 'ul') + '>' + b.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</' + (b.ordered ? 'ol' : 'ul') + '>', listType: b.ordered ? 'ordered' : 'unordered' }) };
      case 'spacer':
        return { type: 'block', definition: d.paragraph, attributes: { text: '&nbsp;', 'lightning:padding': { top: size(Math.max(0, (b.height || 16) - 16)) } } };
      case 'html':
        return { type: 'block', definition: d.html, attributes: { html: b.html } };
    }
    return null;
  }

  function toNextContent(email, baseContentBody, options) {
    options = options || {};
    var base = baseContentBody ? JSON.parse(JSON.stringify(baseContentBody)) : { 'sfdc_cms:block': { id: newId(), type: 'block', definition: NEXT_MAP.definitions.section, children: [] } };
    var root = base['sfdc_cms:block'];
    if (!root) throw new Error('The email content has no "sfdc_cms:block" root.');

    // Reuse the first existing section and column as templates so required attributes are kept
    var tplSection = root.children && root.children[0] ? stripChildren(root.children[0]) : { type: 'block', definition: NEXT_MAP.definitions.section, attributes: {} };
    var tplColumn = root.children && root.children[0] && root.children[0].children && root.children[0].children[0] ? stripChildren(root.children[0].children[0]) : { type: 'block', definition: NEXT_MAP.definitions.column, attributes: {} };
    var provisional = {};

    var sections = email.sections.map(function (s) {
      var sec = JSON.parse(JSON.stringify(tplSection));
      sec.id = newId();
      sec.attributes = sec.attributes || {};
      if (s.background) {
        sec.attributes['lightning:colorGroup'] = assign({}, sec.attributes['lightning:colorGroup'], { backgroundColor: s.background });
        provisional['section background'] = true;
      }
      sec.children = s.columns.map(function (c) {
        var col = JSON.parse(JSON.stringify(tplColumn));
        col.id = newId();
        col.attributes = assign({}, col.attributes, s.columns.length > 1 ? { width: { unit: '%', value: c.width } } : {});
        col.children = c.blocks.map(function (b) {
          if (!NEXT_MAP.verified[b.type]) provisional[b.type] = true;
          return nextBlock(b);
        }).filter(Boolean);
        return col;
      });
      return sec;
    });

    root.children = options.append ? (root.children || []).concat(sections) : sections;
    if (email.subject) base.subjectLine = email.subject;
    if (email.preheader && options.setPreheader !== false) base.preheader = email.preheader;
    return { contentBody: base, provisional: Object.keys(provisional) };
  }

  function stripChildren(node) {
    var c = JSON.parse(JSON.stringify(node));
    c.children = [];
    return c;
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) Object.keys(s).forEach(function (k) { target[k] = s[k]; });
    }
    return target;
  }

  return {
    version: VERSION,
    fromHtml: fromHtml,
    fromFigma: fromFigma,
    fromPositioned: fromPositioned,
    fromCanva: function (design, options) { return fromPositioned(design, assign({ source: 'canva' }, options)); },
    renderPreview: renderPreview,
    toNextContent: toNextContent,
    NEXT_MAP: NEXT_MAP
  };
});

export default module.exports;
