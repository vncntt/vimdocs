# VimDocs behavior audit

Historical findings from before the fixes. See [TESTING.md](TESTING.md) for the follow-up changes, validation, and remaining limitations.

Reviewed the current working tree (including pre-existing uncommitted edits), 2026-09-10. No implementation files were changed.

## Environment and validation

- Chrome on macOS, existing enabled unpacked extension verified in Chrome's extension details as loaded from this repository.
- Created a private disposable Google Doc for live testing.
- Other installed extensions, including Grammarly, remained enabled. Observations describe this actual environment, not an isolated browser profile.
- `node --check content.js` passes. No package manifest, automated tests, or CI files exist in this working tree.
- Nine isolated JavaScript checks initially reproduced handler defects using a mocked DOM. The permanent regression suite added during the fix is in `tests/commands.test.cjs`; see `TESTING.md`.
- Windows behavior was reviewed in code only. Rich formatting, lists, tables, mobile, IME, collaboration, and all command/boundary combinations have not been exhaustively tested.

The document was reset to this fixture at the end, with Normal mode at the start:

```
alpha beta gamma
second short line
third final line
```

## Prioritized findings

### P1: Replace cancellation edits the document

**Live confirmed and harness confirmed.** `r<Escape>` replaces the current character with `E`. Observed `lpha beta gamma` become `Epha beta gamma`. Escape must cancel without changing text.

`content.js:265-276` accepts every next key except Shift, deletes a character, and passes the key name to `simulateCharacter`. `content.js:670` takes the first character code of that name. Arrow keys and modifiers can similarly become replacement text. Validate printable input, handle cancellation first, and perform replacement as one undoable edit.

### P1: Line-boundary motions can target the wrong paragraph

**Live confirmed.** At the start of line two, `dd` erased line one's text and left an empty first line; line two survived. Repeating `0` from line two moved into line one. `O` from the start of line two inserted above line one. Two `$` commands from line one moved to the end of line two.

The Mac implementations use Option+Up/Down as line boundaries (`content.js:168-204`, `293-297`, `378-389`). These are not idempotent line-start/end operations. Establish explicit line/paragraph semantics, use boundary-safe motions, and select the intended line plus its line break for linewise deletion. Test at both boundaries, on empty lines, and on wrapped paragraphs before treating `dd` as reliable.

### P1: Visual change is absent; visual delete leaves the wrong mode

**Live confirmed and harness confirmed.** `vc` leaves both the text and selection unchanged. `vd` deletes the selection but the indicator remains VISUAL, and Shift-selection remains active for subsequent motions. README marks both features complete.

At `content.js:515-523`, `c` has no implementation and `d` never switches to NORMAL. Implement separate actions and explicit mode transitions: delete -> NORMAL, change -> INSERT. Deleting and changing should also capture the removed text for subsequent paste.

### P2: A single g can unexpectedly jump to the document start

**Live confirmed and harness confirmed.** `gg`, then `j`, then a single `g` jumped back to line one. A marker inserted afterward appeared at the start of line one.

`lastKeyPressed` is set to `g` but never reset (`content.js:206-219`, `500-513`). Escape, unrelated keys, completed commands, and mode changes should reset pending command state. Use an explicit parser state rather than a permanent last-key flag.

### P2: cw removes the word separator

Follow-up: fixed. The later probe showed that Docs selected the word without the separator; its smart deletion removed the adjacent space. The replacement-based change in `TESTING.md` avoids that behavior.

**Live confirmed.** On `alpha beta gamma`, `ggcwCHANGED<Escape>` produced `CHANGEDbeta gamma`, losing the space before `beta`. The desired result is `CHANGED beta gamma`.

`content.js:352-365` implements change-word with the same native word-selection motion used for deletion. The live Docs word selection includes the separator here. Give `cw` its own end-of-word range semantics and test punctuation, repeated spaces, and starting inside a word.

### P2: Yank/paste is unreliable and deletes do not populate registers

**Live confirmed for the combined yank/paste workflow; harness/source confirmed for absent register handling.** `ggvlyp` left the text unchanged; no copied text was inserted. This does not isolate whether copy, paste, or both failed. `yy` has no Normal-mode implementation. Normal `x`, `dw`, `dd`, and `D` delete through Backspace without storing the deleted content, so the usual Vim delete-then-paste workflow cannot retrieve it.

`content.js:405-438`, `533-549`, `584-600` rely on `execCommand('copy'/'paste')`, report failures only in the console, and do not track characterwise versus linewise content. Yank also switches mode without collapsing selection. Add a private Vim register and explicit range/caret restoration; treat system clipboard access as a separate integration. Show an actionable status if clipboard operations fail. Do not mark `p`/`P` complete until both paths are verified independently with controlled clipboard content.

### P2: Visual-line mode does not maintain whole-line selection

**Live confirmed.** `Vd` did nothing. `Vjk` ended with no visible selection, despite still showing VISUAL LINE; it should return to the original full-line selection.

`content.js:552-610` has no delete/change handlers. The `j` and `k` paths are asymmetric and extend native character selections without a persistent line anchor. Store linewise selection boundaries and direction, then derive each selection from those boundaries. Test unequal line lengths and reversing selection direction.

### P2: Modifier shortcuts are interpreted as Vim letters

**Harness confirmed; not independently live tested.** Cmd+i enters INSERT because the handler switches solely on `event.key`. Cmd+b can be interpreted as backward-word movement; Cmd+v can enter Visual mode.

`content.js:123-131` unconditionally prevents default in Normal mode and does not distinguish modifiers, composition, or internal synthetic events. Add a routing layer for native shortcuts and IME before the Vim parser. Internal dispatched keystrokes currently also re-enter the same handler, increasing accidental coupling.

### P2: D's end-of-line helper has a conditional runtime exception

**Harness confirmed; ordinary live D worked in the tested document.** For a collapsed DOM selection with a range, `tempRange.setStart(range.endOffset, 0)` passes a number where a Node is required and throws (`content.js:678-691`). It also reads the top-level window selection, while editing occurs in an iframe and Docs uses its own rendered editor model.

Do not fix this only by swapping arguments: determine how the editor caret/range should be represented and avoid assuming a DOM text-node boundary equals a document line boundary. Include a test for the collapsed-selection branch that the live smoke test did not exercise.

### P2: Windows A moves backward

**Harness/source confirmed, not live tested on Windows.** `content.js:201-203` sends Ctrl+Left for `A`, moving to a previous word boundary before entering Insert mode. It should move to the line end. Review the other non-Mac paragraph-based mappings together and validate them on Windows.

## Additional observations and improvements

- Basic `i`, Escape, `a`, `h/j/k/l`, `w/b`, `I/A`, `gg/G`, ordinary `r`, and `x` behaved as expected in the simple Mac smoke sequences. This is not proof of boundary correctness.
- `w` followed by `e` and `rX` on the fixture produced `alpha betX gamma`, as expected. The hard-coded extra arrow movements in `w/e` remain fragile for punctuation, whitespace and word ends (`content.js:151-158`, `391-395`).
- `o` opened below a line in the tested case. `D` removed the suffix of a line in the tested case. Both need boundary tests because of their dependencies on paragraph motions.
- `u` after `rX` appeared to undo only the inserted replacement, leaving the original character deleted. This needs an isolated undo-history test; there is no explicit transaction grouping around replacement.
- Cursor placement after leaving Insert mode is not adjusted left (`content.js:612-614`), and `h/l/x` have no line boundary protection. Test end-of-document and line-break deletion before adding more commands.
- `getTextTarget()` caches its element indefinitely, and the initialization interval stops when the text target exists even if the cursor was not found (`content.js:89-116`). Recover from editor target replacement, and initialize cursor styling independently of listener binding.
- Remove per-keystroke console logging (`content.js:124`); it runs even in Insert mode. Gate diagnostic tracing behind an explicit debug setting.
- Fix implicit global `isWide` (`content.js:36`), remove duplicate `case 'v'`, and replace unused modifier flags with explicit event options.
- Update README to match actual capabilities. It claims visual `c` works, omits newer visual-line behavior, and describes lowercase `o` as opening “before” rather than below.

## Recommended implementation order

1. Stop destructive surprises: replacement cancellation and boundary-safe `dd`, `0`, `$`, `O`.
2. Introduce a small command state machine with explicit cancellation, mode transitions, modifier handling, and counts/operators as data.
3. Separate Docs range/motion/edit operations from Vim parsing; stop composing commands by dispatching Vim letters back through the listener.
4. Implement characterwise and linewise registers, paste, selection anchors, and undo grouping.
5. Add regression checks for the reproduced bugs plus live smoke fixtures on Mac and Windows. Include empty documents, empty lines, first/last character, line starts/ends, wrapped paragraphs, lists, and reverse visual selections.

Fixing this shared foundation will address multiple commands at once and is a better next step than adding more bindings to the current switch statement.
