const MODES = {
    NORMAL: 'NORMAL',
    INSERT: 'INSERT',
    VISUAL: 'VISUAL'
};
let modeData = {
    currentMode: MODES.NORMAL
};
let modeProxy = new Proxy(modeData, {
    set: function (target, key, value) {
        target[key] = value;
        //holy shit the line above has to come first. took me like 40 min to find this bug ugh
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

function isMacOS() {
    return navigator.userAgent.indexOf('Mac') !== -1;
}
/**
 * Adjust the width of the cursor caret.
 * @param {boolean} isWide - If true, set to wide width; otherwise, set to calculated width.
 */
function setCursorWidth(mode) {
    if (cursorCaret) {
        isWide = null;
        if (mode === 'INSERT') {
            isWide = true;
        }
        else if (mode === 'NORMAL') {
            isWide = false;
        }
        else if (mode === 'VISUAL') {
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
    indicator.textContent = modeProxy.currentMode;
    document.body.appendChild(indicator);
}
// This function updates the mode indicator's content
function updateModeIndicator() {
    const indicator = document.getElementById('vim-mode-indicator');
    if (indicator) {
        indicator.textContent = modeProxy.currentMode;
        setCursorWidth(modeProxy.currentMode);
        if (modeProxy.currentMode === MODES.VISUAL) {
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
        console.log('Key pressed:', event.key);
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
                    //need to add if(at beginning of line) do nothing
                    if (isMacOS()) {
                        simulateKeyPress('ArrowUp', false, true);
                        break;
                    }
                    performAction('ArrowUp', true)
                    break;
                case '$':
                    //end of line
                    //implement if at end of line, don't do anything
                    if (isMacOS()) {
                        simulateKeyPress('ArrowDown', false, true);
                    } else {
                        performAction('ArrowDown', true);
                        performAction('ArrowLeft', true);
                    }
                    break;
                case 'I':
                    //insert at beginning of line
                    if (isMacOS()) {
                        simulateKeyPress('ArrowUp', false, true);
                    }
                    else {
                        performAction('ArrowUp', true);
                    }
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'A':
                    //insert at end of line
                    if (isMacOS()) {
                        simulateKeyPress('ArrowDown', false, true);
                    }
                    else {
                        performAction('ArrowLeft',true);
                    }
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'g':
                    //there's a small bug where if you do "Gg" it will go to the beginning of the document when it's not supposed to
                    if (lastKeyPressed === 'g') {
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
                case 'x':
                    simulateKeyPress('ArrowRight');
                    simulateKeyPress('Backspace');
                    break;
                case 'r':
                    replacementPending = true;
                    const charListener = (charEvent) => {
                        if (charEvent.key === "Shift") {
                            return;
                        }
                        replacementPending = false;
                        charEvent.stopPropagation();  // Stop propagation of the event
                        charEvent.preventDefault();   // Prevent default behavior
                        element.removeEventListener('keydown', charListener);
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
                        if (insideDeletion) {
                            return;
                        }
                        insideDeletion = true;
                        deletionPending = false;
                        deletionEvent.stopPropagation();
                        deletionEvent.preventDefault();
                        if (deletionEvent.key === 'd') {
                            if (isMacOS()) {
                                //doesn't work if at beginning of line
                                simulateKeyPress('ArrowUp',false,true);
                                isShiftHeld = true;
                                simulateKeyPress('ArrowDown',false,true);
                                isShiftHeld = false;
                                simulateKeyPress('Backspace');

                           }
                            else {
                                simulateKeyPress('ArrowDown', true);
                                simulateKeyPress('ArrowLeft');
                                isShiftHeld = true;
                                simulateKeyPress('ArrowUp', true);
                                simulateKeyPress('Backspace');
                                isShiftHeld = false;
                            }
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
                case 'c':
                    deletionPending = true;
                    const deletionListener1 = (deletionEvent) => {
                        if (insideDeletion) {
                            return;
                        }
                        insideDeletion = true;
                        deletionPending = false;
                        deletionEvent.stopPropagation();
                        deletionEvent.preventDefault();
                        if (deletionEvent.key === 'w') {
                            if (isMacOS()) {
                                isShiftHeld = true;
                                simulateKeyPress('ArrowRight',false,true);
                                isShiftHeld = false;
                                simulateKeyPress('Backspace');
                                modeProxy.currentMode = MODES.INSERT;
                            }
                            else {
                                isShiftHeld = true;
                                simulateKeyPress('ArrowRight', true);
                                isShiftHeld = false;
                                simulateKeyPress('Backspace');
                                modeProxy.currentMode = MODES.INSERT;
                            }
                        }
                        insideDeletion = false;
                        element.removeEventListener('keydown', deletionListener1);
                    };
                    element.addEventListener('keydown', deletionListener1);
                    break;
                case 'v':
                    isShiftHeld = true;
                    simulateKeyPress('ArrowRight');
                    modeProxy.currentMode = MODES.VISUAL;
                    break;
                case 'o':
                    //doesn't work at the end of a line
                    simulateKeyPress('$');
                    simulateKeyPress('Enter');
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'O':
                    //doesn't work at beginning of line because of '0' bug
                    simulateKeyPress('0');
                    simulateKeyPress('Enter');
                    simulateKeyPress('ArrowUp');
                    modeProxy.currentMode = MODES.INSERT;
                    break;
                case 'e':
                    simulateKeyPress('w');
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
                    //need to add if(at beginning of line) do nothing
                    if (isMacOS()) {
                        simulateKeyPress('ArrowUp',false,true);
                    }
                    else {
                        performAction('ArrowUp', true);
                    }
                    break;
                case '$':
                    //end of line
                    if (isMacOS()) {
                        simulateKeyPress('ArrowDown',false,true);
                    }
                    else {
                        performAction('ArrowDown', true);
                    }
                    break;
                case 'g':
                    //there's a small bug where if you do "Gg" it will go to the beginning of the document when it's not supposed to
                    if (lastKeyPressed === 'g') {
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
                    simulateKeyPress('Backspace')
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
                case 'y':
                //don't know how to copy

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
        const keyCode = KEY_CODES[keyval] || keyval.keyCode;
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
        target.dispatchEvent(simulatedEvent);
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
        target.dispatchEvent(simulatedEvent);
    }
}

function isAtEndOfLine() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    if (!range.collapsed) return false; // Ensure the range is a cursor (collapsed range)

    // Create a temporary range to select all content from the cursor to the end of the node
    const tempRange = range.cloneRange();
    tempRange.selectNodeContents(range.endContainer);
    tempRange.setStart(range.endOffset, 0);

    // Check if the temporary range's content is empty (i.e., cursor is at the end)
    return tempRange.toString() === '';
}
