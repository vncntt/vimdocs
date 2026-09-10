const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'content.js'), 'utf8');

// This models an editor's native key/range contract, not Google's private DOM.
// Live Docs + OS clipboard checks are documented separately in TESTING.md.
function editor(initial, cursor = 0, platform = 'Mac') {
    const model = { text: initial, cursor, anchor: cursor, clipboard: 'untouched', copySucceeds: true, copyEventSucceeds: true, pasteSucceeds: true, hasCaret: true };
    const timers = [];
    const listeners = [];
    const events = [];
    const lineStart = p => model.text.lastIndexOf('\n', p - 1) + 1;
    const lineEnd = p => { const end = model.text.indexOf('\n', p); return end < 0 ? model.text.length : end; };
    const selected = () => model.text.slice(Math.min(model.anchor, model.cursor), Math.max(model.anchor, model.cursor));
    const replace = text => {
        const low = Math.min(model.anchor, model.cursor), high = Math.max(model.anchor, model.cursor);
        model.text = model.text.slice(0, low) + text + model.text.slice(high);
        model.cursor = model.anchor = low + text.length;
    };
    const move = (position, shift) => {
        model.cursor = Math.max(0, Math.min(model.text.length, position));
        if (!shift) model.anchor = model.cursor;
    };
    function native(event) {
        if (event.defaultPrevented) return;
        if (event.type === 'copy') {
            if (model.copyEventSucceeds) event.clipboardData.setData('text/plain', selected());
            const saved = { cursor: model.cursor, anchor: model.anchor };
            timers.push(() => Object.assign(model, saved));
            return;
        }
        if (event.type === 'paste') { replace(event.clipboardData.getData('text/plain')); return; }
        if (event.type === 'keypress') { replace(String.fromCharCode(event.charCode)); return; }
        const { key, shiftKey: shift, ctrlKey: ctrl, metaKey: meta } = event;
        const p = model.cursor;
        if (key === 'Home') move(ctrl ? 0 : lineStart(p), shift);
        else if (key === 'End') move(ctrl ? model.text.length : lineEnd(p), shift);
        else if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const right = key === 'ArrowRight';
            if (!shift && model.anchor !== p) move(right ? Math.max(p, model.anchor) : Math.min(p, model.anchor), false);
            else if (right && (event.altKey || ctrl)) {
                const tail = model.text.slice(p);
                const word = tail.match(/^[ \t]*[^\s]+/)?.[0] || tail.match(/^\s+/)?.[0] || '';
                const trailing = platform === 'Windows' ? tail.slice(word.length).match(/^[ \t]*/)[0].length : 0;
                move(p + word.length + trailing, shift);
            } else move(p + (right ? 1 : -1), shift);
        } else if (key === 'ArrowUp' || key === 'ArrowDown') {
            if (meta) { move(key === 'ArrowUp' ? 0 : model.text.length, shift); return; }
            const start = lineStart(p), col = p - start;
            if (key === 'ArrowUp') move(start === 0 ? 0 : Math.min(start - 1, lineStart(start - 1) + col), shift);
            else { const next = lineEnd(p); move(next === model.text.length ? next : Math.min(lineEnd(next + 1), next + 1 + col), shift); }
        } else if (key === 'Backspace') {
            // Docs smart deletion removes an adjacent space when a whole word
            // is selected. This is the original cw regression reproduced live.
            const high = Math.max(model.anchor, p);
            if (/^[\p{L}\p{N}_]+$/u.test(selected()) && model.text[high] === ' ') {
                if (model.cursor === high) model.cursor++;
                else model.anchor++;
            }
            if (model.anchor === p) model.anchor = Math.max(0, p - 1);
            replace('');
        } else if (key === 'Enter') replace('\n');
        else if (event.isTrusted && key.length === 1 && !meta && !ctrl && !event.altKey) replace(key);
    }
    class KeyboardEvent {
        constructor(type, data) { Object.assign(this, { type, defaultPrevented: false }, data); }
        preventDefault() { this.defaultPrevented = true; }
        stopPropagation() {}
    }
    const target = {
        isConnected: true,
        addEventListener(type, listener) { listeners.push({ type, listener }); },
        removeEventListener(type, listener) { const i = listeners.findIndex(x => x.type === type && x.listener === listener); if (i >= 0) listeners.splice(i, 1); },
        dispatchEvent(event) {
            events.push(event);
            for (const entry of [...listeners]) if (entry.type === event.type && listeners.includes(entry)) entry.listener(event);
            native(event);
        },
    };
    const indicator = { style: {} };
    const caret = {
        style: { height: '20px' },
        getBoundingClientRect() {
            return { left: (model.cursor - lineStart(model.cursor)) * 10, top: model.text.slice(0, model.cursor).split('\n').length * 20 };
        },
    };
    const innerDocument = {
        querySelector() { return target; },
        execCommand(command) {
            if (command === 'copy') {
                if (!model.copySucceeds) return false;
                model.clipboard = selected();
                const saved = { cursor: model.cursor, anchor: model.anchor };
                // Docs restores its selection after the copy event has completed.
                timers.push(() => Object.assign(model, saved));
                return true;
            }
            if (!model.pasteSucceeds) return false;
            replace(model.clipboard);
            return true;
        },
    };
    target.ownerDocument = innerDocument;
    const document = {
        querySelector(selector) {
            if (selector.includes('iframe')) return { contentDocument: innerDocument };
            if (selector === '.kix-appview-editor') return { scrollLeft: 0, scrollTop: 0 };
            return model.hasCaret ? caret : null;
        },
        createElement() { return indicator; },
        getElementById() { return indicator; },
        body: { appendChild() {} },
    };
    class DataTransfer {
        constructor() { this.data = {}; }
        setData(type, value) { this.data[type] = value; }
        getData(type) { return this.data[type] || ''; }
    }
    const navigator = { userAgent: platform, clipboard: { async readText() {
        if (!model.pasteSucceeds) throw new Error('Clipboard denied');
        return model.clipboard;
    } } };
    const ctx = vm.createContext({ document, navigator, KeyboardEvent, ClipboardEvent: KeyboardEvent, DataTransfer, console, setInterval() { return 1; }, clearInterval() {}, setTimeout(callback) { timers.push(callback); } });
    vm.runInContext(source + '\nattachKeyListener(textTarget);', ctx);
    const key = (key, modifiers = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, isTrusted: true, ...modifiers }));
    const keys = (...sequence) => sequence.forEach(k => key(k));
    const flush = () => { while (timers.length) timers.shift()(); };
    const settle = async () => { await new Promise(setImmediate); flush(); };
    return { model, key, keys, flush, settle, selected, events, indicator, mode: () => vm.runInContext('modeProxy.currentMode', ctx) };
}

for (const platform of ['Mac', 'Windows']) {
    const make = (text, cursor = 0) => editor(text, cursor, platform);

    for (const [text, cursor, expected] of [
        ['first\nsecond\nthird', 2, 'first'],
        ['first\nsecond\nthird', 8, 'second'],
        ['first\nsecond\nthird', 15, 'third'],
        ['café 世界 👋', 2, 'café 世界 👋'],
    ]) test(`${platform}: yy copies displayed line at ${cursor} without edits`, () => {
        const e = make(text, cursor); e.keys('y', 'y'); e.flush();
        assert.equal(e.model.clipboard, expected); assert.equal(e.model.text, text);
        assert.equal(e.mode(), 'NORMAL'); assert.equal(e.selected(), '');
    });
    test(`${platform}: yy on an empty line leaves clipboard unchanged`, () => {
        const e = make('first\n\nlast', 6); e.keys('y', 'y'); e.flush();
        assert.equal(e.model.clipboard, 'untouched'); assert.equal(e.mode(), 'NORMAL');
        assert.equal(e.model.text, 'first\n\nlast');
    });
    test(`${platform}: yy prefix cancels on Escape and unrelated keys`, () => {
        const e = make('alpha'); e.keys('y', 'Escape', 'y'); e.flush();
        assert.equal(e.model.clipboard, 'untouched');
        e.keys('l', 'y'); e.flush(); assert.equal(e.model.clipboard, 'untouched');
        e.key('y'); e.flush(); assert.equal(e.model.clipboard, 'alpha');
    });
    test(`${platform}: link shortcut exits Visual without changing its native selection`, () => {
        for (const mode of ['v', 'V']) {
            const e = make('alpha'); e.key(mode); const selection = e.selected();
            e.key('k', platform === 'Mac' ? { metaKey: true } : { ctrlKey: true });
            assert.equal(e.mode(), 'NORMAL'); assert.equal(e.selected(), selection);
            assert.equal(e.events.at(-1).defaultPrevented, false);
        }
    });
    test(`${platform}: canceled link selection collapses before the next Vim command`, () => {
        const e = make('alpha beta'); e.keys('v', 'l', 'l');
        e.key('k', { metaKey: true }); e.key('d');
        assert.equal(e.selected(), ''); assert.equal(e.model.text, 'alpha beta');
        assert.equal(e.mode(), 'NORMAL');
    });
    test(`${platform}: formatting shortcuts keep Visual active`, () => {
        const e = make('alpha'); e.key('v');
        for (const key of ['b', 'i', 'u']) {
            e.key(key, { metaKey: true }); assert.equal(e.mode(), 'VISUAL');
            assert.equal(e.selected(), 'a'); assert.equal(e.events.at(-1).defaultPrevented, false);
        }
    });
    test(`${platform}: repeated e advances to subsequent word ends`, () => {
        const e = make('alpha beta gamma'); e.key('e'); assert.equal(e.model.cursor, 4);
        e.key('e'); assert.equal(e.model.cursor, 9);
    });
    for (const [text, cursor, expected] of [
        ['alpha\nbeta', 5, 'alph\nbeta'],
        ['alpha', 5, 'alph'],
        ['alpha\n\nbeta', 6, 'alpha\n\nbeta'],
        ['', 0, ''],
        ['alpha\nbeta', 2, 'alha\nbeta'],
    ]) test(`${platform}: x respects line boundary at ${cursor} in ${JSON.stringify(text)}`, () => {
        const e = make(text, cursor); e.key('x'); assert.equal(e.model.text, expected);
    });
    for (const [name, text, cursor, expected] of [
        ['one space', 'alpha beta', 0, 'X beta'],
        ['multiple spaces', 'alpha   beta', 0, 'X   beta'],
        ['middle of word', 'alpha beta', 2, 'alX beta'],
        ['last character of word', 'alpha beta', 4, 'alphX beta'],
        ['single-letter word', 'a beta', 0, 'X beta'],
        ['line-final word', 'alpha\nbeta', 0, 'X\nbeta'],
        ['document-final word', 'alpha', 0, 'X'],
        ['empty document', '', 0, 'X'],
        ['end of document', 'alpha', 5, 'alphaX'],
        ['empty middle line', 'alpha\n\nbeta', 6, 'alpha\nX\nbeta'],
        ['whitespace', 'alpha   beta', 5, 'alphaXbeta'],
        ['punctuation boundary', 'alpha,beta', 0, 'X,beta'],
        ['punctuation run', 'alpha...beta', 5, 'alphaXbeta'],
        ['underscore', 'alpha_beta next', 0, 'X next'],
        ['accented word', 'café beta', 0, 'X beta'],
        ['CJK word', '世界 beta', 0, 'X beta'],
    ]) test(`${platform}: cw preserves surrounding text at ${name}`, () => {
        const e = make(text, cursor); e.keys('c', 'w'); e.flush();
        assert.equal(e.mode(), 'INSERT'); e.key('X');
        assert.equal(e.model.text, expected); assert.equal(e.model.clipboard, 'untouched');
    });
    test(`${platform}: rapid cwTEXT Escape input is replayed after copy restoration`, () => {
        const e = make('alpha beta'); e.keys('c', 'w', 'X', 'Y', 'Escape'); e.flush();
        assert.equal(e.model.text, 'XY beta'); assert.equal(e.mode(), 'NORMAL');
        assert.equal(e.model.clipboard, 'untouched');
    });
    test(`${platform}: consecutive buffered cw edits remain ordered across lines`, () => {
        const e = make('alpha beta\nlastword');
        e.keys('c', 'w', 'X', 'Escape', 'j', '0', 'c', 'w', 'Y', 'Escape'); e.flush();
        assert.equal(e.model.text, 'X beta\nY'); assert.equal(e.mode(), 'NORMAL');
    });
    test(`${platform}: cw Escape leaves an empty change without eating the separator`, () => {
        const e = make('alpha beta'); e.keys('c', 'w', 'Escape'); e.flush();
        assert.equal(e.model.text, ' beta'); assert.equal(e.mode(), 'NORMAL');
    });
    test(`${platform}: c Escape cancels the operator without selecting or deleting`, () => {
        const e = make('alpha beta'); e.keys('c', 'Escape'); e.flush();
        assert.equal(e.model.text, 'alpha beta'); assert.equal(e.selected(), ''); assert.equal(e.mode(), 'NORMAL');
    });
    test(`${platform}: unsupported range-copy fails without changing text or clipboard`, () => {
        const e = make('alpha beta'); e.model.copyEventSucceeds = false; e.keys('c', 'w'); e.flush();
        assert.equal(e.model.text, 'alpha beta'); assert.equal(e.model.clipboard, 'untouched');
        assert.equal(e.mode(), 'NORMAL'); assert.match(e.indicator.textContent, /no text changed/);
    });
    test(`${platform}: Escape cancels replacement without changing text or caret`, () => {
        const e = make('alpha'); e.keys('r', 'Escape');
        assert.equal(e.model.text, 'alpha'); assert.equal(e.model.cursor, 0);
        e.keys('l', 'r', 'X'); assert.equal(e.model.text, 'aXpha');
    });
    test(`${platform}: non-printable replacement keys do not become text`, () => {
        for (const key of ['ArrowLeft', 'Enter', 'Tab']) {
            const e = make('alpha'); e.keys('r', key); assert.equal(e.model.text, 'alpha');
        }
    });
    test(`${platform}: uppercase replacement survives a physical Shift key`, () => {
        const e = make('alpha'); e.keys('r', 'Shift', 'X'); assert.equal(e.model.text, 'Xlpha');
    });
    test(`${platform}: repeated zero and dollar stay on the same line`, () => {
        const e = make('first\nsecond\nthird', 8);
        e.keys('0', '0', '0'); assert.equal(e.model.cursor, 6);
        e.keys('$', '$', '$'); assert.equal(e.model.cursor, 12);
        assert.equal(e.model.text, 'first\nsecond\nthird');
    });
    for (const [name, text, position, expected] of [
        ['first', 'first\nsecond\nthird', 0, 'second\nthird'],
        ['middle start', 'first\nsecond\nthird', 6, 'first\nthird'],
        ['middle interior', 'first\nsecond\nthird', 9, 'first\nthird'],
        ['middle end', 'first\nsecond\nthird', 12, 'first\nthird'],
        ['last', 'first\nsecond\nthird', 15, 'first\nsecond'],
        ['empty middle', 'first\n\nthird', 6, 'first\nthird'],
        ['empty last', 'first\n', 6, 'first'],
        ['only line', 'first', 2, ''],
        ['empty document', '', 0, ''],
    ]) test(`${platform}: dd deletes ${name} line only`, () => {
        const e = make(text, position); e.keys('d', 'd'); assert.equal(e.model.text, expected); assert.equal(e.mode(), 'NORMAL');
    });
    test(`${platform}: missing caret does not risk deleting another line`, () => {
        const e = make('first\nsecond', 6); e.model.hasCaret = false; e.keys('d', 'd'); assert.equal(e.model.text, 'first\nsecond');
    });
    test(`${platform}: O at line start inserts directly above that line`, () => {
        const e = make('first\nsecond', 6); e.keys('O', 'X'); assert.equal(e.model.text, 'first\nX\nsecond'); assert.equal(e.mode(), 'INSERT');
    });
    test(`${platform}: o at line end opens directly below that line`, () => {
        const e = make('first\nsecond', 5); e.keys('o', 'X'); assert.equal(e.model.text, 'first\nX\nsecond');
    });
    test(`${platform}: visual delete returns to Normal and does not select on next move`, () => {
        const e = make('alpha beta'); e.keys('v', 'l', 'd', 'l'); assert.equal(e.model.text, 'pha beta'); assert.equal(e.mode(), 'NORMAL'); assert.equal(e.selected(), '');
    });
    test(`${platform}: visual change deletes the selected text and enters Insert`, () => {
        const e = make('alpha'); e.keys('v', 'l', 'c', 'X'); assert.equal(e.model.text, 'Xpha'); assert.equal(e.mode(), 'INSERT');
    });
    test(`${platform}: gg resets after completion, other keys and Escape`, () => {
        const e = make('first\nsecond', 8); e.keys('g', 'g'); assert.equal(e.model.cursor, 0);
        e.keys('j', 'g'); assert.equal(e.model.cursor, 6);
        e.keys('Escape', 'g'); assert.equal(e.model.cursor, 6);
        e.keys('l', 'g'); assert.equal(e.model.cursor, 7);
        e.key('g'); assert.equal(e.model.cursor, 0);
    });
    test(`${platform}: modified shortcuts pass through without entering Vim modes`, () => {
        const e = make('alpha'); e.key('i', { metaKey: true }); assert.equal(e.mode(), 'NORMAL'); assert.equal(e.events.at(-1).defaultPrevented, false);
        e.key('v', { ctrlKey: true }); assert.equal(e.mode(), 'NORMAL');
    });
    test(`${platform}: yank copies actual selection, waits for Docs restoration, and preserves text`, () => {
        const e = make('alpha beta'); e.keys('v', 'l', 'l', 'l', 'l', 'y'); e.flush();
        assert.equal(e.model.clipboard, 'alpha'); assert.equal(e.model.text, 'alpha beta'); assert.equal(e.mode(), 'NORMAL'); assert.equal(e.selected(), '');
        e.keys('i', 'X'); assert.equal(e.model.text, 'Xalpha beta');
    });
    test(`${platform}: multiline yank preserves line breaks`, () => {
        const e = make('first\nsecond\nthird'); e.keys('v', 'j', '$', 'y'); e.flush();
        assert.equal(e.model.clipboard, 'first\nsecond'); assert.equal(e.model.text, 'first\nsecond\nthird');
    });
    test(`${platform}: failed copy preserves selection and exposes failure`, () => {
        const e = make('alpha'); e.model.copySucceeds = false; e.keys('v', 'l', 'y'); e.flush();
        assert.equal(e.model.clipboard, 'untouched'); assert.equal(e.mode(), 'VISUAL'); assert.equal(e.selected(), 'al'); assert.match(e.indicator.textContent, /Copy failed/);
    });
    test(`${platform}: visual-line yank copies the whole selected line`, () => {
        const e = make('first\nsecond', 2); e.keys('V', 'y'); e.flush(); assert.equal(e.model.clipboard, 'first'); assert.equal(e.selected(), '');
    });
    test(`${platform}: P and p use the system clipboard before and after the caret`, async () => {
        const e = make('abc'); e.model.clipboard = 'XY'; e.key('P'); await e.settle(); assert.equal(e.model.text, 'XYabc');
        const f = make('abc'); f.model.clipboard = 'XY'; f.key('p'); await f.settle(); assert.equal(f.model.text, 'aXYbc');
    });
    test(`${platform}: failed clipboard reads leave the document and cursor unchanged`, async () => {
        const e = make('abc'); e.model.pasteSucceeds = false; e.key('p'); await e.settle();
        assert.equal(e.model.text, 'abc'); assert.equal(e.model.cursor, 0); assert.match(e.indicator.textContent, /Paste failed/);
    });
    test(`${platform}: empty clipboard paste is a no-op`, async () => {
        const e = make('abc'); e.model.clipboard = ''; e.key('p'); await e.settle();
        assert.equal(e.model.text, 'abc'); assert.equal(e.model.cursor, 0);
    });
    test(`${platform}: D deletes only the suffix and is harmless at line end`, () => {
        const e = make('alpha\nbeta', 2); e.key('D'); assert.equal(e.model.text, 'al\nbeta');
        e.key('D'); assert.equal(e.model.text, 'al\nbeta');
    });
    test(`${platform}: I and A enter Insert at their respective line boundaries`, () => {
        const e = make('first\nsecond', 9); e.keys('I', 'X'); assert.equal(e.model.text, 'first\nXsecond');
        const f = make('first\nsecond', 9); f.keys('A', 'X'); assert.equal(f.model.text, 'first\nsecondX');
    });
}
