import { LightningElement, wire } from 'lwc';
import { getContent, updateContent } from 'experience/cmsEditorApi';
import core from 'c/designToNextCore';

const SOURCE_HINTS = {
    html: 'Paste the full HTML of an email. AMPscript, forms and anything without a builder equivalent are kept as HTML blocks.',
    figma: 'Paste Figma REST API JSON for the email frame (GET /v1/files/:key/nodes?ids=…). Use auto layout for the best result.',
    canva: 'Paste the design elements as JSON: { width, background, elements: [ … ] }.'
};

const LABELS = {
    heading: 'Heading', paragraph: 'Paragraph', image: 'Image', button: 'Button',
    divider: 'Divider', list: 'List', spacer: 'Spacer', html: 'HTML block'
};

export default class DesignToNext extends LightningElement {
    source = 'html';
    input = '';
    email = null;
    contentBody = null;
    errorMessage = '';
    successMessage = '';
    confirming = false;
    applying = false;
    copyLabel = 'Copy JSON';

    @wire(getContent, {})
    onContent({ data, error }) {
        if (data) {
            this.contentBody = data.contentBody;
        } else if (error) {
            this.errorMessage = 'Could not read this email: ' + this.describe(error);
        }
    }

    get sourceOptions() {
        return [
            { label: 'HTML email', value: 'html' },
            { label: 'Figma', value: 'figma' },
            { label: 'Canva', value: 'canva' }
        ];
    }

    get hint() {
        return SOURCE_HINTS[this.source];
    }

    get hasResult() {
        return !!this.email;
    }

    get report() {
        return this.email ? this.email.report : null;
    }

    get scoreLabel() {
        return this.report ? this.report.score + '% editable' : '';
    }

    get summary() {
        if (!this.email) return '';
        const blocks = this.email.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.blocks.length, 0), 0);
        return `${this.email.sections.length} sections, ${blocks} blocks`;
    }

    get notes() {
        if (!this.report) return [];
        const out = [];
        this.report.fallbacks.forEach((f, i) => out.push({ key: 'f' + i, cls: 'note note_fallback', label: 'HTML block', text: f.reason }));
        this.report.warnings.forEach((w, i) => out.push({ key: 'w' + i, cls: 'note note_warn', label: 'Check', text: w }));
        return out;
    }

    get sections() {
        if (!this.email) return [];
        return this.email.sections.map((s, si) => ({
            key: 's' + si,
            title: `Section ${si + 1}` + (s.columns.length > 1 ? ` · ${s.columns.length} columns` : '') + (s.background ? ` · ${s.background}` : ''),
            columns: s.columns.map((c, ci) => ({
                key: `s${si}c${ci}`,
                label: s.columns.length > 1 ? Math.round(c.width) + '%' : '',
                blocks: c.blocks.map((b, bi) => ({
                    key: `s${si}c${ci}b${bi}`,
                    cls: b.type === 'html' ? 'block block_fallback' : 'block',
                    type: LABELS[b.type] || b.type,
                    text: this.blockText(b)
                }))
            }))
        }));
    }

    get applyLabel() {
        return this.confirming ? 'Replace the email content' : 'Apply to this email';
    }

    get applyDisabled() {
        return !this.email || !this.contentBody || this.applying;
    }

    get inspectJson() {
        return this.contentBody ? JSON.stringify(this.contentBody, null, 2) : 'Loading the email content…';
    }

    blockText(b) {
        switch (b.type) {
            case 'heading': return 'H' + b.level + ' · ' + b.text;
            case 'paragraph': return b.text;
            case 'image': return b.alt || b.src;
            case 'button': return b.text + ' → ' + (b.href || 'no link');
            case 'list': return b.items.length + ' items';
            case 'html': return b.reason;
            case 'spacer': return b.height + 'px';
            default: return '';
        }
    }

    handleSource(event) {
        this.source = event.detail.value;
        this.reset();
    }

    handleInput(event) {
        this.input = event.target.value;
        this.reset();
    }

    reset() {
        this.email = null;
        this.errorMessage = '';
        this.successMessage = '';
        this.confirming = false;
    }

    handleConvert() {
        this.reset();
        try {
            if (this.source === 'html') {
                this.email = core.fromHtml(this.input);
            } else {
                const data = JSON.parse(this.input);
                this.email = this.source === 'figma' ? core.fromFigma(data) : core.fromCanva(data);
            }
        } catch (e) {
            this.errorMessage = (e instanceof SyntaxError ? 'That is not valid JSON. ' : '') + e.message;
        }
    }

    handleApply() {
        if (!this.confirming) {
            this.confirming = true;
            return;
        }
        this.applying = true;
        let result;
        try {
            result = core.toNextContent(this.email, this.contentBody);
        } catch (e) {
            this.applying = false;
            this.errorMessage = e.message;
            return;
        }
        updateContent({ contentBody: result.contentBody })
            .then(() => {
                this.successMessage = 'Imported. Check the email in the builder before saving.' +
                    (result.provisional.length ? ' Beta mapping used for: ' + result.provisional.join(', ') + '.' : '');
                this.confirming = false;
            })
            .catch((error) => {
                this.errorMessage = 'The builder rejected the content: ' + this.describe(error) +
                    ' Open the Inspect tab, copy the JSON of an email that contains these components, and share it so the mapping can be fixed.';
            })
            .finally(() => {
                this.applying = false;
            });
    }

    handleCancel() {
        this.confirming = false;
    }

    handleCopy() {
        const text = this.inspectJson;
        const done = (label) => {
            this.copyLabel = label;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => { this.copyLabel = 'Copy JSON'; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => done('Copied'), () => this.selectJson(done));
        } else {
            this.selectJson(done);
        }
    }

    selectJson(done) {
        const area = this.template.querySelector('.inspect-text');
        if (area) area.focus();
        done('Select all and copy');
    }

    describe(error) {
        if (!error) return 'unknown error';
        if (typeof error === 'string') return error;
        if (error.body && error.body.message) return error.body.message;
        return error.message || JSON.stringify(error);
    }
}
