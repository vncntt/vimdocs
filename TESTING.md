# Validation of Vim command fixes

Validated in Chrome on macOS on 2026-09-10 against the unpacked extension from
this repository. The test document and clipboard page were disposable. Other
extensions remained enabled. The original findings are in `VIM_AUDIT.md`.

## Automated checks

Run with Node.js 18+; no third-party dependencies are needed:

```sh
node --test tests/commands.test.cjs
node --check content.js
```

100 tests pass. The harness executes the actual content script against a small
native-key editor model, asserting text, caret, selection, mode, and clipboard
results for both Mac and Windows branches. It models Docs' deferred selection
restoration after copying. It is not a replacement for live Google Docs tests.

Covered cases include replacement cancellation and modifier keys; repeated
line boundaries; first/middle/final/empty-line deletion; missing caret safety;
opening lines; visual delete/change; pending `g` reset; native shortcuts; copy
failure; copy selection cleanup; multiline and whole-line yank; clipboard paste
before/after the caret; empty/denied clipboard reads; and `D`, `I`, `A`. The `cw` cases also model Docs smart deletion, native word
selection differences, deferred range-copy cleanup, rapid buffered input,
whitespace/punctuation/Unicode boundaries, and an unchanged OS clipboard.

## Live Google Docs checks

| Check | Observed result |
| --- | --- |
| `cw` on `alpha beta` | `CHANGED beta`; the separator survives. |
| `cw` before repeated spaces | `alpha   beta` becomes `X   beta`, verified in a plain textarea. |
| `cw` starting on spaces | Removes only the spaces, preserving the next word. |
| `cw` at punctuation / inside a word | `alpha,beta` becomes `X,beta`; `prefixword tail` from column three becomes `prX tail`. |
| `cw` on final words / an empty line | Changes the final word without losing its line break; preserves following text on an empty line. |
| Consecutive `cw` edits and `cw` then Escape | Follow-up input remains ordered; Escape leaves Normal mode and preserves the separator. |
| Clipboard contents before and after `cw` | `CW_CLIPBOARD_SENTINEL` still pastes into the other tab. |
| `r` then Escape | Original character preserved; subsequent commands work. |
| `gg`, `j`, single `g`, insert marker | Marker stays on line two; no stale jump. |
| Repeated `0` at the start of a middle line | Caret stays on that line; subsequent `dd` removes only that line. |
| Repeated `$` | Inserted end marker stays on the same line. |
| `O` at a line start | Opens directly above the current line. |
| `dd` from inside a middle line | Removes that line; preserves preceding/following text. |
| `dd` on first/final/only line | Removes intended line; final-line deletion does not leave an extra blank paragraph. |
| Repeated `dd` in an empty document | Safe; subsequent insertion works. |
| `dd` on an empty middle line | Removes the blank line, preserving both neighbors. |
| `dd` on middle/final bullet items | Removes only the intended item; remaining bullet items survive. |
| `dd` on a wrapped displayed line | Removes that displayed line; next line still begins with the intact word `Docs.`. |
| Visual `d`, then `i` | Selected characters deleted; returns to Normal and accepts insertion normally. |
| Visual `c`, then typing | Replaces selection and enters Insert. |
| `D` followed by another `D` at line end | Removes the suffix once; second `D` does not backspace another character. |
| Select `alpha`, `y`, Cmd+V in another tab | Separate plain textarea contains `alpha`. |
| Insert immediately after yank settles | Inserts before the original text, without replacing the copied selection. |
| Multiline visual yank to another tab | Selected lines and line breaks are preserved. |
| Unicode clipboard round trip | `alpha café 世界 👋` and a second line survive paste into Docs, yank, and native paste back into another tab. |
| `V`, `y` from inside a line | Whole displayed line appears in the other tab's clipboard textarea. |
| External text `CLIP`, `P` at start of `abc` | `CLIPabc`. |
| External text `CLIP`, `p` on `d` in `def` | `dCLIPef`. |

Clipboard verification used ordinary Cmd+C/Cmd+V between Google Docs and a
separate local HTML textarea. No OS clipboard shell commands, browser debugger,
or background clipboard polling are used by the extension.

## Implementation notes

- Home/End provide idempotent displayed-line boundaries. Paragraph-jump shortcuts
  caused the previous repeated-boundary and wrong-line deletion bugs.
- `dd` uses Docs' rendered caret to distinguish a following line break from the
  document end. On the final line it removes the preceding break instead. It
  declines to delete if the caret cannot be found.
- Synthetic editing events bypass the Vim parser. Real modified shortcuts pass
  through to Docs/the browser.
- Yank invokes Docs' native copy handler with clipboard-write permission. Caret
  collapse waits until Docs has restored its temporary copy selection.
- `cw` obtains range text from a synthetic copy event backed by an in-memory
  DataTransfer, preserving the OS clipboard. It trims the range to the current
  word/punctuation run or leading blanks, waits for Docs' copy cleanup, and
  replaces the range with a temporary space before removing that character.
  This avoids Docs smart deletion removing the neighboring separator. Input
  arriving during copy cleanup is buffered and replayed in order.
- Paste reads plain text through the Clipboard API and dispatches it to Docs'
  paste handler. `execCommand('paste')` returned success without inserting text
  during live testing, so it is no longer used.

## Remaining limitations

- Windows was exercised in the automated model, not on a live Windows machine.
- Lines here are displayed editor lines, not necessarily whole wrapped
  paragraphs. Tables, page boundaries, RTL documents, and concurrent
  collaborators have not been validated.
- `p`/`P` paste plain text; native Cmd/Ctrl+V remains available for rich content.
  Linewise register placement, `yy`, numbered registers, counts, and dot-repeat
  are not implemented. Deletes do not put deleted text into a Vim register.
- Word motion boundaries (`w`/`b`/`e`) and replace/change undo grouping still
  need more work; `cw` uses a separate range-trimming path.
- Visual-line `j`/`k` selection reversal still needs a dedicated range model;
  the verified `V` workflow is selecting/yanking the current displayed line.
- Cursor and selection behavior depend on Google's internal editor DOM and
  keyboard handling; future Docs updates may require changes.
