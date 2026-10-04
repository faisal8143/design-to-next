# Design to Next

[![Tests](https://github.com/faisal8143/design-to-next/actions/workflows/tests.yml/badge.svg)](https://github.com/faisal8143/design-to-next/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Turn **HTML emails, Figma designs and Canva designs** into **editable drag-and-drop emails** in the Salesforce **Marketing Cloud Next** email builder. Marketers keep working with the builder's out-of-the-box components and never touch code.

**[Try the converter →](https://faisal8143.github.io/design-to-next/)**

## Why

Marketing Cloud Next can turn a drag-and-drop email into HTML, but not the other way round. Pasted HTML stays code-only: no visual editing, no styling panel, no dynamic content. Teams with hand-coded templates, or designers working in Figma and Canva, have no way to hand marketers an email they can edit themselves.

Design to Next reads the design, works out its structure, and rebuilds it from the builder's own components:

| Builder component | Created from |
|---|---|
| Section (with background colour) | Coloured table rows, Figma frames, Canva colour bands |
| Columns (up to 4) | Multi-cell table rows, hybrid inline-block columns, horizontal auto layout, side-by-side elements |
| Heading | `h1`–`h6`, large or bold text |
| Paragraph | Text with bold, italic, links and line breaks kept |
| Image | Images with alt text and links; Figma image fills and icons |
| Button | Table buttons, styled links, Figma button frames, Canva shapes with a label |
| Divider | `hr`, thin rules, Figma lines |
| List | `ul` / `ol`, bulleted text |
| HTML block | Anything with no builder equivalent: AMPscript, forms, embeds. **Nothing is lost.** |

Every conversion comes with a **fidelity report**: the percentage of content that became editable blocks, what was kept as HTML and why, and what to check (missing alt text, buttons without links, relative image paths, background images).

## How it works

```
HTML email ──┐
Figma      ──┼──▶  Email block model  ──▶  Marketing Cloud Next email (sfdc_cms__email)
Canva      ──┘     + fidelity report       via the "Design to Next" builder extension
```

1. **Converter** (`src/design-to-next.js`) — one dependency-free file for browsers and Node.js.
   - `fromHtml(html)` — table-based and hybrid email HTML
   - `fromFigma(json)` — Figma REST API file or nodes response; auto layout frames map exactly, other frames are inferred from positions
   - `fromCanva(design)` — freeform designs as positioned elements; rows, columns, colour bands and buttons are inferred
   - `toNextContent(email, currentContentBody)` — builds the Marketing Cloud Next content tree
2. **Builder extension** (`salesforce/`) — a Lightning Web Component that runs inside the Marketing Cloud Next email builder:
   - **Import** tab: paste a design, review the blocks and report, apply it to the open email
   - **Inspect** tab: shows the builder's own JSON for the open email

## Status

| Part | Status |
|---|---|
| HTML → blocks | ✅ Working, tested |
| Figma JSON → blocks | ✅ Working, tested. Figma plugin with a one-click export: planned |
| Canva elements → blocks | ✅ Working, tested. Canva app that reads the design directly: planned |
| Section, column, heading, paragraph → Next | ✅ Based on Salesforce's documented content structure |
| Image, button, divider, list, HTML block → Next | 🧪 **Beta.** Field names are provisional until confirmed with the Inspect tab against a real org |
| Image upload to Salesforce CMS | Planned |

## Install the builder extension (Marketing Cloud Next org)

Use a **sandbox or test email first**.

1. Install the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli).
2. Log in to your org:
   ```bash
   sf org login web --alias next-org
   # for a sandbox add: --instance-url https://test.salesforce.com
   ```
3. Deploy:
   ```bash
   cd salesforce
   sf project deploy start --source-dir force-app --target-org next-org
   ```
4. Open an email in the Marketing Cloud Next builder and open the **Design to Next** extension.

After changing `src/design-to-next.js`, regenerate the copy inside the Salesforce project with `npm run build:lwc`.

### Help confirm the beta mapping

1. In the builder, create a test email containing one **image, button, divider, list and HTML** component.
2. Open **Design to Next → Inspect**, copy the JSON and attach it to a GitHub issue (remove anything confidential).
3. The `NEXT_MAP` table in `src/design-to-next.js` is updated so those components import natively.

## Design tips for the best result

**Figma:** put the email in one frame about 600px wide, use **auto layout**, make each band a frame (it becomes a section), use horizontal auto layout for columns, name button frames "Button", add hyperlinks to text, and give image layers descriptive names (they become alt text).

**Canva:** keep content in clear rows, use full-width coloured rectangles for section backgrounds, and put button labels on top of a shape.

**HTML:** standard table-based emails convert best. AMPscript is preserved in HTML blocks.

## Development

```bash
npm install        # installs jsdom for tests
npm test           # converter tests
npm run build:lwc  # copy the converter into the Salesforce project
```

## License

[MIT](LICENSE) © Faisal Irfan. Not affiliated with or endorsed by Salesforce, Figma or Canva. Salesforce and Marketing Cloud are trademarks of Salesforce, Inc.
