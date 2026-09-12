# vimdocs
Vim for GoogleDocs 
Works for the most part for both Windows and Mac

## Installation

```
git clone https://github.com/vncntt/vimdocs.git
```
Click on the extensions icon in Google.  
Click "Manage extensions".\
Turn on developer mode on the top right of your screen.\
Click "Load unpacked" on the top left, navigate to where you put the folder and then click "Open". \

## Cursor movement

- [x] h - move cursor left
- [x] j - move cursor down
- [x] k - move cursor up
- [x] l - move cursor right
- [x] w - jump to next word
- [x] b - jump to prev word
- [x] e - jump to end of word
- [x] 0 - jump to start of line
- [x] $ - jump to end of line
- [x] gg - jump to first line of document
- [x] G - jump to end of document

## Entering Insert Mode

- [x] i - insert before cursor
- [x] I - insert at beginning of line
- [x] a - insert after cursor
- [x] A - insert at end of line
- [x] o - open new line below current line
- [x] O - open new line above current line

In insert mode, `jk` returns to normal mode. A lone `j` waits up to 1 second.

## Change

- [x] cw - change word (keeps the space after it)

## Editing

- [x] x - delete a single character
- [x] r - replace character (Escape cancels)
- [x] dd - delete entire displayed line
- [x] dw - delete word
- [x] D - delete to end of line
- [x] yy - yank displayed line to system clipboard
- [x] p - paste plain text after cursor
- [x] P - paste plain text before cursor

## Visual Mode

- [x] v - enter visual mode
- [x] hjklwb in visual mode
- [x] d - delete highlighted text + return to normal mode
- [x] c - delete highlighted text + enter insert mode

- [x] y - yank selection to system clipboard (can paste in another tab)
- [x] V then y - yank displayed line

Cmd/Ctrl+B, I, U work on visual selections. Cmd/Ctrl+K opens links and returns to normal mode.

- [x] V then j/k - extend or shrink whole-line selection
- [x] V then d - delete selected lines

Reload the extension and Docs after updating.

Tests: `node --test tests/commands.test.cjs` — see [TESTING.md](TESTING.md).
