const MODES = {
    NORMAL: 'NORMAL',
    INSERT: 'INSERT',
    VISUAL: 'VISUAL',
    VISUAL_LINE: 'VISUAL_LINE'
};
let modeData = {
    currentMode: MODES.NORMAL
};
let modeProxy = new Proxy(modeData, {
    set: function (target, key, value) {
        target[key] = value;
        if (key === 'currentMode') {
            updateModeIndicator();
        }
        return true;
    }
});
let isShiftHeld = false;
let isAltHeld = false;
let isCmdHeld = false;
let userCursor = null;
let cursorCaret = null;
let lastKeyPressed = null;
let dispatchingKey = false;
let pendingWordChange = null;

function isMacOS() {
    return navigator.userAgent.indexOf('Mac') !== -1;
}
/**
 * Adjust the width of the cursor caret.
 * @param {boolean} isWide - If true, set to wide width; otherwise, set to calculated width.
 */
function setCursorWidth(mode) {
    if (cursorCaret) {
        let isWide = null;
        if (mode === 'INSERT') {
            isWide = true;
        }
        else if (mode === 'NORMAL') {
            isWide = false;
        }
        else if (mode === 'VISUAL' || mode === MODES.VISUAL_LINE) {
            isWide = false;
        };
        if (isWide) {
            cursorCaret.style.borderWidth = "2px";
        } else {
            const scaleFactor = 0.416;
            const caretHeight = parseFloat(cursorCaret.style.height.slice(0, -2));
            const calculatedWidth = scaleFactor * caretHeight;
            cursorCaret.style.borderWidth = `${calculatedWidth}px`;
        }
    }
}
function addModeIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'vim-mode-indicator';
    indicator.style.position = 'fixed';
    indicator.style.bottom = '10px';
    indicator.style.left = '10px';
    indicator.style.padding = '5px 10px';
    indicator.style.background = 'rgba(0, 0, 0, 0.6)';
    indicator.style.color = 'white';
    indicator.style.borderRadius = '5px';
    indicator.style.zIndex = '9999';  // Ensure it's on top
    indicator.textContent = modeProxy.currentMode === MODES.VISUAL_LINE ? "VISUAL LINE" : modeProxy.currentMode;
    document.body.appendChild(indicator);
}
// This function updates the mode indicator's content
function updateModeIndicator() {
    const indicator = document.getElementById('vim-mode-indicator');
    if (indicator) {
        indicator.textContent = modeProxy.currentMode === MODES.VISUAL_LINE ? "VISUAL LINE" : modeProxy.currentMode;
        setCursorWidth(modeProxy.currentMode);
        if (modeProxy.currentMode === MODES.VISUAL || modeProxy.currentMode === MODES.VISUAL_LINE) {
            isShiftHeld = true;
        } else {
            isShiftHeld = false;
        }
    } else {
        addModeIndicator();
    }
}
// Initialize the mode indicator when the extension loads
addModeIndicator();
let iframe = document.querySelector('.docs-texteventtarget-iframe');
let textTarget = iframe ? iframe.contentDocument.querySelector('[contenteditable="true"]') : null;
function getTextTarget() {
    if (!textTarget) {
        iframe = document.querySelector('.docs-texteventtarget-iframe');
        textTarget = iframe ? iframe.contentDocument.querySelector('[contenteditable="true"]') : null;
    }
    return textTarget;
}




// This function will be called periodically until the iframe and its content-editable child are found
function checkForTargetElements() {
    const target = getTextTarget();
    if (!userCursor || !cursorCaret) {
        userCursor = document.querySelector(".kix-cursor");
        cursorCaret = document.querySelector(".kix-cursor-caret");
        if (userCursor && cursorCaret && modeProxy.currentMode === MODES.NORMAL) {
            setCursorWidth(modeProxy.currentMode);
        }
    }
    if (textTarget) {
        attachKeyListener(textTarget);
        clearInterval(intervalId);
    }
}
// Periodically check every 500ms until the target elements are found
const intervalId = setInterval(checkForTargetElements, 500);

let replacementPending = false;
let deletionPending = false;
let insideDeletion = false;

function attachKeyListener(element) {
    element.addEventListener('keydown', (event) => {
        // Native editing events must reach Docs without being parsed as Vim commands.
        if (dispatchingKey || event.isComposing) return;
        if (pendingWordChange) {
            event.preventDefault();
            event.stopPropagation();
            pendingWordChange.keys.push({ key: event.key, ctrlKey: event.ctrlKey,
                metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey });
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) {
            lastKeyPressed = null;
            return;
        }
        const previousKey = lastKeyPressed;
        lastKeyPressed = null;
        if (replacementPending || deletionPending) {
            // A replacement is pending, don't process in this main handler
            return;
        }
        if (modeProxy.currentMode === MODES.NORMAL) {
            event.preventDefault();
            switch (event.key) {
                case 'i':
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'a':
                    simulateKeyPress('ArrowRight');
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'h':
                    simulateKeyPress('ArrowLeft')
                    break;
                case 'j':
                    simulateKeyPress('ArrowDown')
                    break;
                case 'k':
                    simulateKeyPress('ArrowUp')
                    break;
                case 'l':
                    simulateKeyPress('ArrowRight')
                    break;
                case 'w':
                    //next word
                    if (isMacOS()) {
                        simulateKeyPress('ArrowRight',false,true);
                        simulateKeyPress('ArrowRight');
                        break;
                    }
                    performAction('ArrowRight', true);
                    break;
                case 'b':
                    //prev word
                    if (isMacOS()) {
                        simulateKeyPress('ArrowLeft', false, true);
                        break;
                    }
                    performAction('ArrowLeft', true);
                    break;
                case '0':
                    moveToLineBoundary(false);
                    break;
                case '$':
                    moveToLineBoundary(true);
                    break;
                case 'I':
                    moveToLineBoundary(false);
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'A':
                    moveToLineBoundary(true);
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'g':
                    if (previousKey === 'g') {
                        if (isMacOS()) {
                            isCmdHeld = true;
                            simulateKeyPress('ArrowUp');
                            isCmdHeld = false;
                            break;
                        }
                        simulateKeyPress('Home', true);
                        break;
                    } else {
                        lastKeyPressed = 'g';
                    }
                    break;
                default:
                    if (deletionPending || replacementPending) {
                        event.stopPropagation();
                        event.preventDefault();
                    }
                    break;
                case 'G':
                    if (isMacOS()) {
                        isCmdHeld = true;
                        simulateKeyPress('ArrowDown');
                        isCmdHeld = false;
                        break;
                    }
                    simulateKeyPress('End', true);
                    break;
                case 'v':
                    isShiftHeld = true;
                    simulateKeyPress('ArrowRight');
                    modeProxy.currentMode = MODES.VISUAL;
                    break;
                case 'V':
                    moveToLineBoundary(false);
                    isShiftHeld = true;
                    moveToLineBoundary(true);
                    modeProxy.currentMode = MODES.VISUAL_LINE;
                    break;
                case 'x':
                    simulateKeyPress('ArrowRight');
                    simulateKeyPress('Backspace');
                    break;
                case 'r':
                    replacementPending = true;
                    const charListener = (charEvent) => {
                        if (dispatchingKey) return;
                        if (['Shift', 'Control', 'Alt', 'Meta'].includes(charEvent.key)) return;
                        replacementPending = false;
                        charEvent.stopPropagation();  // Stop propagation of the event
                        charEvent.preventDefault();   // Prevent default behavior
                        element.removeEventListener('keydown', charListener);
                        if (charEvent.key === 'Escape' || charEvent.key.length !== 1 ||
                            charEvent.ctrlKey || charEvent.metaKey || charEvent.altKey || charEvent.isComposing) return;
                        simulateKeyPress('ArrowRight');
                        simulateKeyPress('Backspace');
                        simulateCharacter(charEvent.key);
                        simulateKeyPress('ArrowLeft');
                    };
                    element.addEventListener('keydown', charListener);
                    break;
                case 'd':
                    deletionPending = true;
                    const deletionListener = (deletionEvent) => {
                        if (dispatchingKey || insideDeletion) {
                            return;
                        }
                        insideDeletion = true;
                        deletionPending = false;
                        deletionEvent.stopPropagation();
                        deletionEvent.preventDefault();
                        if (deletionEvent.key === 'd') {
                            deleteLine();
                        }
                        else if (deletionEvent.key === 'w') {
                            if (isMacOS()) {
                                isShiftHeld = true;
                                simulateKeyPress('ArrowRight',false,true);
                                isShiftHeld = false;
                                simulateKeyPress('Backspace');
                           }
                            else {
                                isShiftHeld = true;
                                simulateKeyPress('ArrowRight', true);
                                isShiftHeld = false;
                                simulateKeyPress('Backspace');
                            }
                        }
                        insideDeletion = false;
                        element.removeEventListener('keydown', deletionListener);
                    };
                    element.addEventListener('keydown', deletionListener);
                    break;
                case 'D':
                    deleteToLineEnd();
                    break;
                case 'c':
                    deletionPending = true;
                    const deletionListener1 = (deletionEvent) => {
                        if (dispatchingKey || insideDeletion) {
                            return;
                        }
                        insideDeletion = true;
                        deletionPending = false;
                        deletionEvent.stopPropagation();
                        deletionEvent.preventDefault();
                        if (deletionEvent.key === 'w') {
                            changeWord();
                        }
                        insideDeletion = false;
                        element.removeEventListener('keydown', deletionListener1);
                    };
                    element.addEventListener('keydown', deletionListener1);
                    break;
                case 'o':
                    moveToLineBoundary(true);
                    simulateKeyPress('Enter');
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'O':
                    moveToLineBoundary(false);
                    simulateKeyPress('Enter');
                    simulateKeyPress('ArrowUp');
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'e':
                    if (isMacOS()) {
                        simulateKeyPress('ArrowRight', false, true);
                        simulateKeyPress('ArrowRight');
                    } else {
                        simulateKeyPress('ArrowRight', true);
                    }
                    simulateKeyPress('ArrowLeft');
                    simulateKeyPress('ArrowLeft');
                    break;
                case 'u':
                    if (isMacOS()) {
                        isCmdHeld = true;
                        simulateKeyPress('z');
                        isCmdHeld = false;
                        break;
                    }
                    simulateKeyPress('z', true);
                    break;
                case 'p':
                    pasteClipboard(true);
                    break;
                case 'P':
                    pasteClipboard(false);
                    break;
            }
        }
        else if (modeProxy.currentMode === MODES.VISUAL) {
            event.preventDefault();
            switch (event.key) {
                case 'Escape':
                    isShiftHeld = false;
                    simulateKeyPress('ArrowRight');
                    simulateKeyPress('ArrowLeft');
                    modeProxy.currentMode = MODES.NORMAL;
                    break;
                case 'h':
                    simulateKeyPress('ArrowLeft');
                    break;
                case 'j':
                    simulateKeyPress('ArrowDown')
                    break;
                case 'k':
                    simulateKeyPress('ArrowUp')
                    break;
                case 'l':
                    simulateKeyPress('ArrowRight')
                    break;
                case 'w':
                    //next word
                    if (isMacOS()) {
                        simulateKeyPress('ArrowRight',false,true);
                        simulateKeyPress('ArrowRight')
                    }
                    else {
                        performAction('ArrowRight', true);
                    }
                   break;
                case 'b':
                    //prev word
                    if (isMacOS()) {
                        simulateKeyPress('ArrowLeft',false,true);
                    }
                    else {
                        performAction('ArrowLeft', true);
                    }
                    break;
                case '0':
                    moveToLineBoundary(false);
                    break;
                case '$':
                    //end of line
                    moveToLineBoundary(true);
                    break;
                case 'g':
                    if (previousKey === 'g') {
                        if (isMacOS()) {
                            isCmdHeld = true;
                            simulateKeyPress('ArrowUp');
                            isCmdHeld = false;
                            break;
                        }
                        simulateKeyPress('Home', true);
                        break;
                    } else {
                        lastKeyPressed = 'g';
                    }
                    break;
                case 'd':
                case 'c':
                    simulateKeyPress('Backspace');
                    modeProxy.currentMode = event.key === 'c' ? MODES.INSERT : MODES.NORMAL;
                    break;
                default:
                    break;
                case 'G':
                    if (isMacOS()) {
                        isCmdHeld = true;
                        simulateKeyPress('ArrowDown');
                        isCmdHeld = false;
                        break;
                    }
                    simulateKeyPress('End', true);
                    break;
                case 'y':
                    yankSelection();
                    break;
            }
        }
        else if (modeProxy.currentMode === MODES.VISUAL_LINE) {
            event.preventDefault();
            switch (event.key) {
                case 'j':
                    simulateKeyPress('ArrowDown');
                    break;
                case 'k':
                    // isShiftHeld is true because we are in VISUAL_LINE mode.
                    if (isMacOS()) {
                        // Simulate Cmd+ArrowLeft to go to the beginning of the current visual line.
                        // Note: The existing '0' command uses simulateKeyPress('ArrowUp', false, true) for macOS,
                        // which might be "go to top of paragraph/document". We need true "start of line".
                        // Let's assume for now that 'ArrowLeft' with Cmd is the correct "start of line" for selection purposes.
                        // If textTarget.dispatchKeyEvent for 'moveFocusToStartOfLine' or similar exists, that'd be better,
                        // but we're using existing simulateKeyPress.
                        // We need to ensure 'ArrowLeft' with Cmd is what we want for "start of visual line".
                        // The existing '0' command for macOS is: moveToLineBoundary(false);
                        // The existing '$' command for macOS is: moveToLineBoundary(true);
                        // These might be more like "go to start/end of paragraph/block" rather than visual line.
                        // Let's try to use the Mac standard "Command + Left Arrow" for start of line.
                        // This means we need to set isCmdHeld = true temporarily.

                        isCmdHeld = true;
                        simulateKeyPress('ArrowLeft'); // Cmd+ArrowLeft
                        isCmdHeld = false;
                        
                        simulateKeyPress('ArrowUp');   // Shift+ArrowUp (isShiftHeld is true globally for VISUAL_LINE)
                    } else {
                        simulateKeyPress('Home');      // Home key for non-MacOS (go to start of line)
                        simulateKeyPress('ArrowUp');   // Shift+ArrowUp
                    }
                    break;
                case 'y':
                    yankSelection();
                    break;
                case 'd':
                case 'c':
                    simulateKeyPress('Backspace');
                    modeProxy.currentMode = event.key === 'c' ? MODES.INSERT : MODES.NORMAL;
                    break;
                case 'Escape':
                    isShiftHeld = false; // Crucial: do this *before* simulating keys
                    // Simulate a slight cursor movement to ensure selection is cleared.
                    // ArrowLeft might be safer if we want to stay on the same line, near the start.
                    simulateKeyPress('ArrowLeft'); 
                    modeProxy.currentMode = MODES.NORMAL;
                    break;
                default:
                    break;
            }
        }
        else if (modeProxy.currentMode === MODES.INSERT && event.key === 'Escape') {
            modeProxy.currentMode = MODES.NORMAL;
        }
    });
    //element.addEventListener('blur', () => {
    //    modeProxy.currentMode = MODES.NORMAL;
    //    updateModeIndicator();
    //});
}


const KEY_CODES = {
    'End': 35,
    'Home': 36,
    'ArrowLeft': 37,
    'ArrowUp': 38,
    'ArrowRight': 39,
    'ArrowDown': 40,
    'Backspace': 8,
    'Enter': 13,
    'Shift': 16,
    'Cmd': 91,
    'Option': 18
};
function simulateKeyPress(keyval, ctrlval = false, optionval = false) {
    const target = getTextTarget();
    if (target) {
        const keyCode = KEY_CODES[keyval] || (keyval.length === 1 ? keyval.toUpperCase().charCodeAt(0) : 0);
        const simulatedEvent = new KeyboardEvent('keydown', {
            key: keyval,
            keyCode: keyCode,  // KeyCode for 'Home' key
            which: keyCode,    // 'which' for compatibility
            ctrlKey: ctrlval,
            shiftKey: isShiftHeld,
            altKey: optionval,  // Option key pressed if optionval is true
            metaKey: isCmdHeld,
            bubbles: true,
            cancelable: true
        });
        dispatchingKey = true;
        try {
            target.dispatchEvent(simulatedEvent);
        } finally {
            dispatchingKey = false;
        }
    }
}
function performAction(key, ctrlval = false) {
    if (isMacOS()) {
        isAltHeld = true;
        simulateKeyPress(key);
        isAltHeld = false;

    } else {
        simulateKeyPress(key, ctrlval);
        console.log(key, ctrlval);
    }
}
function simulateCharacter(letter) {
    const target = getTextTarget();
    if (target) {
        const simulatedEvent = new KeyboardEvent('keypress', {
            key: letter,
            charCode: letter.charCodeAt(0),
            bubbles: true,
            cancelable: true
        });
        dispatchingKey = true;
        try {
            target.dispatchEvent(simulatedEvent);
        } finally {
            dispatchingKey = false;
        }
    }
}

// Keep selection modifiers explicit when invoking native Docs navigation.
function moveToLineBoundary(end) {
    // Docs handles Home/End on both platforms. Cmd/Option+arrows can cross
    // a paragraph boundary when the caret is already at its start or end.
    simulateKeyPress(end ? 'End' : 'Home');
}

function caretPosition() {
    const caret = document.querySelector('.kix-cursor-caret');
    if (!caret) return null;
    const rect = caret.getBoundingClientRect();
    const editor = document.querySelector('.kix-appview-editor');
    return { x: rect.left + (editor?.scrollLeft || 0), y: rect.top + (editor?.scrollTop || 0) };
}

function samePosition(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
}

function deleteToLineEnd() {
    const start = caretPosition();
    isShiftHeld = true;
    moveToLineBoundary(true);
    isShiftHeld = false;
    // An empty selection must not turn D into a backward-character deletion.
    if (start && !samePosition(start, caretPosition())) simulateKeyPress('Backspace');
}

function deleteLine() {
    // If the Docs caret is unavailable, don't guess whether navigation moved.
    // Otherwise a failed boundary probe could delete an unrelated line.
    if (!caretPosition()) {
        clipboardStatus('Editor cursor unavailable; try again');
        return;
    }
    moveToLineBoundary(true);
    const end = caretPosition();
    simulateKeyPress('ArrowRight');
    const after = caretPosition();
    if (samePosition(end, after)) {
        // No next character: include the preceding break on the final line.
        moveToLineBoundary(false);
        simulateKeyPress('ArrowLeft');
        isShiftHeld = true;
        if (isMacOS()) {
            isCmdHeld = true;
            simulateKeyPress('ArrowDown');
            isCmdHeld = false;
        } else {
            simulateKeyPress('End', true);
        }
    } else {
        simulateKeyPress('ArrowLeft');
        moveToLineBoundary(false);
        isShiftHeld = true;
        moveToLineBoundary(true);
        simulateKeyPress('ArrowRight');
    }
    isShiftHeld = false;
    simulateKeyPress('Backspace');
    moveToLineBoundary(false);
}

function clipboardStatus(message) {
    const indicator = document.getElementById('vim-mode-indicator');
    if (indicator) indicator.textContent = `${modeProxy.currentMode} — ${message}`;
}

function yankSelection() {
    const target = getTextTarget();
    if (!target) return;
    try {
        // Let Docs supply its selected text/HTML to the browser's real clipboard.
        // The hidden input's DOM selection is only a placeholder, not document text.
        const copied = target.ownerDocument.execCommand('copy');
        if (!copied) {
            clipboardStatus('Copy failed; use Cmd/Ctrl+C');
            return;
        }
        // Docs temporarily fills its hidden input during copy, then restores
        // the editor selection on a timer. Collapse after that restoration.
        setTimeout(() => {
            isShiftHeld = false;
            simulateKeyPress('ArrowLeft');
            modeProxy.currentMode = MODES.NORMAL;
            clipboardStatus('Copied');
        }, 0);
    } catch (error) {
        clipboardStatus('Copy failed; use Cmd/Ctrl+C');
    }
}

async function pasteClipboard(after) {
    const target = getTextTarget();
    if (!target) return;
    try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        if (after) simulateKeyPress('ArrowRight');
        const data = new DataTransfer();
        data.setData('text/plain', text);
        target.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
        }));
    } catch (error) {
        clipboardStatus('Paste failed; use Cmd/Ctrl+V');
    }
}

function changeWord() {
    const target = getTextTarget();
    const start = caretPosition();
    if (!target || !start) return;
    isShiftHeld = true;
    simulateKeyPress('ArrowRight', !isMacOS(), isMacOS());
    isShiftHeld = false;
    if (samePosition(start, caretPosition())) {
        modeProxy.currentMode = MODES.INSERT;
        return;
    }

    // Ask Docs for this range using an in-memory copy event. Unlike execCommand
    // or navigator.clipboard, this does not read or overwrite the OS clipboard.
    const data = new DataTransfer();
    const transaction = { keys: [] };
    pendingWordChange = transaction;
    target.dispatchEvent(new ClipboardEvent('copy', {
        clipboardData: data, bubbles: true, cancelable: true,
    }));
    const selected = data.getData('text/plain');
    // cw changes the remaining keyword/punctuation run, or just the whitespace
    // when starting on blanks. It must never consume the following word/break.
    const prefix = selected.match(/^[^\S\r\n]+|^[\p{L}\p{N}\p{M}_]+|^[^\p{L}\p{N}\p{M}_\s]+/u)?.[0] || '';

    // Docs restores its temporary copy selection on a timer. Finish after that,
    // and replay rapid follow-up input so cw<Escape> and cwTEXT stay ordered.
    setTimeout(() => {
        if (selected) {
            if (prefix) {
                isShiftHeld = true;
                const tail = selected.slice(prefix.length);
                const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(tail);
                for (const ignored of characters) simulateKeyPress('ArrowLeft');
                isShiftHeld = false;
                // Backspace on a selected word invokes Docs' smart deletion,
                // which also removes the neighboring space. Replace the range
                // first, then remove only the single temporary character.
                simulateCharacter(' ');
                simulateKeyPress('Backspace');
            } else {
                simulateKeyPress('ArrowLeft');
            }
            modeProxy.currentMode = MODES.INSERT;
        } else {
            simulateKeyPress('ArrowLeft');
            clipboardStatus('Could not read word; no text changed');
        }
        pendingWordChange = null;
        for (const key of transaction.keys) {
            const event = new KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true });
            target.dispatchEvent(event);
            if (!event.defaultPrevented && key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.altKey) {
                simulateCharacter(key.key);
            }
        }
    }, 0);
}
