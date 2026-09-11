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
let returningFromLink = false;
let visualLine = null;

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
            // Link dialogs collapse Docs' selection on apply. Hand control back
            // in Normal mode while leaving the native selection for the dialog.
            if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) &&
                [MODES.VISUAL, MODES.VISUAL_LINE].includes(modeProxy.currentMode)) {
                modeProxy.currentMode = MODES.NORMAL;
                returningFromLink = true;
            }
            return;
        }
        if (returningFromLink) {
            // Cancel can restore a native selection. Collapse it before the
            // next Vim command; apply may already have collapsed it.
            returningFromLink = false;
            isShiftHeld = false;
            simulateKeyPress('ArrowRight');
            simulateKeyPress('ArrowLeft');
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
                    beginVisualLine();
                    break;
                case 'y':
                    if (previousKey === 'y') {
                        beginVisualLine();
                        if (!visualLine?.selected) {
                            modeProxy.currentMode = MODES.NORMAL;
                            clipboardStatus('Empty line; clipboard unchanged');
                        } else {
                            yankSelection();
                        }
                    } else {
                        lastKeyPressed = 'y';
                    }
                    break;
                case 'x':
                    deleteCharacter();
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
                case 'e': {
                    const start = caretPosition();
                    if (!start) break;
                    // Move off the current final character before finding the
                    // next word boundary; don't move backwards at document end.
                    simulateKeyPress('ArrowRight');
                    if (samePosition(start, caretPosition())) break;
                    simulateKeyPress('ArrowRight', !isMacOS(), isMacOS());
                    if (!isMacOS()) simulateKeyPress('ArrowLeft');
                    simulateKeyPress('ArrowLeft');
                    break;
                }
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
                case 'k':
                    moveVisualLine(event.key === 'j' ? 1 : -1);
                    break;
                case 'y':
                    if (visualLine?.selected) yankSelection();
                    else clipboardStatus('Empty line; clipboard unchanged');
                    break;
                case 'd':
                case 'c':
                    deleteVisualLines(event.key === 'c');
                    break;
                case 'Escape':
                    collapseVisualLines();
                    // The native range always points forward; restore the
                    // active line when it is below the original V anchor.
                    for (let i = 0; i < Math.max(visualLine?.extent || 0, 0); i++) stepVisualLine(1);
                    modeProxy.currentMode = MODES.NORMAL;
                    visualLine = null;
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

// Keep an inclusive line offset from the line where V began. Native ranges
// always run forward from the first selected line to the end of the last one.
// Rebuilding the range lets j/k cross the anchor without dropping that line.
function beginVisualLine() {
    if (!caretPosition()) return;
    isShiftHeld = false;
    moveToLineBoundary(false);
    visualLine = { extent: 0, selected: false };
    modeProxy.currentMode = MODES.VISUAL_LINE;
    selectVisualLines();
}

function stepVisualLine(direction) {
    const before = caretPosition();
    simulateKeyPress(direction > 0 ? 'ArrowDown' : 'ArrowUp');
    moveToLineBoundary(false);
    const after = caretPosition();
    return before && after && before.y !== after.y;
}

function collapseVisualLines() {
    isShiftHeld = false;
    // ArrowLeft on an empty range would move onto the preceding line.
    if (visualLine?.selected) simulateKeyPress('ArrowLeft');
    moveToLineBoundary(false);
}

function selectVisualLines() {
    const start = caretPosition();
    isShiftHeld = true;
    for (let i = 0; i < Math.abs(visualLine.extent); i++) {
        simulateKeyPress('ArrowDown');
    }
    moveToLineBoundary(true);
    visualLine.selected = !samePosition(start, caretPosition());
}

function moveVisualLine(direction) {
    if (!visualLine || !caretPosition()) return;
    collapseVisualLines();
    // The active line is the bottom endpoint for a forward range, the top
    // endpoint for a backward range. Probe the new endpoint without selecting.
    for (let i = 0; i < Math.max(visualLine.extent, 0); i++) stepVisualLine(1);
    if (stepVisualLine(direction)) visualLine.extent += direction;
    for (let i = 0; i < Math.max(visualLine.extent, 0); i++) stepVisualLine(-1);
    selectVisualLines();
}

async function readVisualRange(target) {
    const data = new DataTransfer();
    target.dispatchEvent(new ClipboardEvent('copy', {
        clipboardData: data, bubbles: true, cancelable: true,
    }));
    const text = data.getData('text/plain');
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!target.isConnected) throw new Error('Editor detached during range read');
    return text;
}

async function deleteVisualLines(change) {
    const target = getTextTarget();
    if (!visualLine || !caretPosition() || !target) return;
    if (change) {
        if (visualLine.selected) simulateKeyPress('Backspace');
        visualLine = null;
        modeProxy.currentMode = MODES.INSERT;
        return;
    }
    const transaction = { keys: [] };
    pendingWordChange = transaction;
    let failure = false;
    try {
        const span = Math.abs(visualLine.extent);
        collapseVisualLines();
        for (let i = 0; i < span; i++) stepVisualLine(1);
        moveToLineBoundary(true);
        const lineEnd = caretPosition();
        moveToLineBoundary(false);
        const emptyLastLine = samePosition(lineEnd, caretPosition());
        moveToLineBoundary(true);
        // Probe with a collapsed caret. Docs' hidden caret can stay stationary
        // when a selection changes, so selection geometry cannot identify EOF.
        const end = caretPosition();
        simulateKeyPress('ArrowRight');
        const atEnd = samePosition(end, caretPosition());
        let followingBreak = false;
        if (!atEnd) {
            simulateKeyPress('ArrowLeft');
            if (emptyLastLine) {
                // Docs serializes a selected empty-paragraph break as a space.
                // Equal collapsed Home/End endpoints identify an empty line;
                // advancing from it necessarily crosses its paragraph break.
                followingBreak = true;
            } else {
                isShiftHeld = true;
                simulateKeyPress('ArrowRight');
                // A lone paragraph break is copied as a space by Docs. Include
                // a character beyond it so its leading newline survives copy.
                simulateKeyPress('ArrowRight');
                const next = await readVisualRange(target);
                if (!next) throw new Error('Range unavailable');
                followingBreak = /^[\r\n]/.test(next);
                isShiftHeld = false;
                simulateKeyPress('ArrowLeft');
                if (!followingBreak && /^[ \t]+$/.test(next)) {
                    // Only one character may remain before an empty final
                    // paragraph. Its equal Home/End endpoints disambiguate
                    // the copied placeholder from a real soft-wrap space.
                    simulateKeyPress('ArrowRight');
                    moveToLineBoundary(false);
                    const nextStart = caretPosition();
                    moveToLineBoundary(true);
                    followingBreak = samePosition(nextStart, caretPosition());
                    moveToLineBoundary(false);
                    simulateKeyPress('ArrowLeft');
                }
            }
        }
        moveToLineBoundary(false);
        for (let i = 0; i < span; i++) stepVisualLine(-1);
        let precedingBreak = false;
        if (atEnd) {
            const start = caretPosition();
            moveToLineBoundary(true);
            const emptyFirstLine = samePosition(start, caretPosition());
            moveToLineBoundary(false);
            simulateKeyPress('ArrowLeft');
            if (!samePosition(start, caretPosition())) {
                simulateKeyPress('ArrowRight');
                if (emptyFirstLine) {
                    precedingBreak = true;
                } else {
                    isShiftHeld = true;
                    simulateKeyPress('ArrowLeft');
                    // Preserve the trailing newline in Docs' copy payload.
                    simulateKeyPress('ArrowLeft');
                    const previous = await readVisualRange(target);
                    if (!previous) throw new Error('Range unavailable');
                    precedingBreak = /[\r\n]$/.test(previous);
                    isShiftHeld = false;
                    simulateKeyPress('ArrowRight');
                    if (!precedingBreak && /^[ \t]+$/.test(previous)) {
                        simulateKeyPress('ArrowLeft');
                        moveToLineBoundary(true);
                        const previousEnd = caretPosition();
                        moveToLineBoundary(false);
                        precedingBreak = samePosition(previousEnd, caretPosition());
                        moveToLineBoundary(true);
                        simulateKeyPress('ArrowRight');
                    }
                }
            }
        }
        if (precedingBreak) simulateKeyPress('ArrowLeft');
        isShiftHeld = true;
        if (precedingBreak) simulateKeyPress('ArrowRight');
        for (let i = 0; i < span; i++) simulateKeyPress('ArrowDown');
        moveToLineBoundary(true);
        if (followingBreak) simulateKeyPress('ArrowRight');
        if (!visualLine.selected && !followingBreak && !precedingBreak) return;
        isShiftHeld = false;
        // A paragraph-inclusive range is not a word-only smart deletion.
        // Replacing it with a character can preserve its final paragraph break
        // in Docs, leaving an unwanted empty line, so delete it directly.
        if (!followingBreak && !precedingBreak) simulateCharacter(' ');
        simulateKeyPress('Backspace');
        moveToLineBoundary(false);
    } catch (error) {
        failure = true;
        isShiftHeld = false;
        simulateKeyPress('ArrowLeft');
    } finally {
        visualLine = null;
        modeProxy.currentMode = MODES.NORMAL;
        if (failure) clipboardStatus('Could not read lines; no text changed');
        replayBufferedKeys(transaction, target);
    }
}

function replayBufferedKeys(transaction, target) {
    pendingWordChange = null;
    if (!target.isConnected) return;
    for (const key of transaction.keys) {
        const event = new KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        if (!event.defaultPrevented && key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.altKey) {
            simulateCharacter(key.key);
        }
    }
}

function deleteCharacter() {
    const start = caretPosition();
    if (!start) return;
    isShiftHeld = true;
    moveToLineBoundary(true);
    isShiftHeld = false;
    if (samePosition(start, caretPosition())) {
        // Docs allows a caret after the final character; Vim's x must not
        // consume the paragraph break there. Empty lines have nothing to delete.
        moveToLineBoundary(false);
        if (samePosition(start, caretPosition())) return;
        moveToLineBoundary(true);
        simulateKeyPress('ArrowLeft');
    } else {
        simulateKeyPress('ArrowLeft'); // collapse back to the original position
    }
    simulateKeyPress('ArrowRight');
    simulateKeyPress('Backspace');
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
        // the editor selection on a timer. Buffer follow-up commands until
        // restoration finishes so they cannot edit the old Visual selection.
        const transaction = { keys: [] };
        pendingWordChange = transaction;
        setTimeout(() => {
            try {
                isShiftHeld = false;
                simulateKeyPress('ArrowLeft');
                visualLine = null;
                modeProxy.currentMode = MODES.NORMAL;
                clipboardStatus('Copied');
            } finally {
                replayBufferedKeys(transaction, target);
            }
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
        replayBufferedKeys(transaction, target);
    }, 0);
}
