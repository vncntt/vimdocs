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
- [ ] 0 - jump to start of line
	- [ ] implementation is kind of jank. pressing more than one time makes cursor go up when it's supposed to stay in place
- [x] $ - jump to end of line
- [x] gg - jump to first line of document
- [x] G - jump to end of document

## Entering Insert Mode

- [x] i - insert before cursor
- [x] I - insert at beginning of line
- [x] a - insert after cursor
- [x] A - insert at end of line
- [x] o - open new line before current line
- [ ] O - open new line above current line
	- [ ] same bug as 0

## Change

- [x] cw - change word

## Editing

- [x] x - delete a single character
- [x] r - replace character
- [x] dd - delete entire line
- [x] dw - delete word
- [ ] yy - yank line

## Visual Mode

- [x] v - enter visual mode
- [x] hjklwb in visual mode
- [x] d - delete highlighted text
- [x] c - delete highlighted text + enter insert mode




bugs with visual mode yank  
implement yank and paste next time
dd is kind of buggy with lists and just in general