# Sarah (non-technical site admin) — Shortcode Builder user test

Persona: marketing-site admin, not a developer. Goal on each page: fill in the form and copy a working shortcode. On gvlogic, also try the merge-tag preview.

Pages tested:
- Attribute builder: http://localhost:3000/docs/gravityview/shortcodes/gventry/
- Conditional block builder: http://localhost:3000/docs/gravityview/shortcodes/gvlogic/

> Note on a mid-test change: the gventry builder visibly improved between my first page load and a re-load minutes later. The first render showed only raw attribute names (`entry_id`) as labels, with both required fields pre-emptively outlined red and a red "Required" line under each empty field. The re-loaded build added plain-English labels ("Entry ID", "View ID", etc.), dropped the pre-emptive red state, and only validates after you click Copy. The dev server appears to have hot-reloaded an edit. All findings below describe the CURRENT (re-loaded) build unless noted.

---

## First impressions (within ~10 seconds)

**gventry (attribute builder).** Once I scrolled down far enough to find it: "Shortcode builder — Fill in the fields you need, then copy the generated `[gventry]` shortcode." Clear enough. Fields read "Entry ID", "View ID", "Edit", "Secret", "Content between the tags", each with the raw name in a gray pill and a red `*` on the two required ones. I understood "Entry ID" and "View ID" immediately. "Secret" made me nervous ("do I need a secret? where's my secret?") until I read the help text. The output box at the bottom already showing `[gventry]` and a Copy button told me where the result lands.

**gvlogic (conditional block builder).** Genuinely friendly. "If this value / Comparison / This value / Show when it matches / Otherwise show" reads like a plain-English sentence, not code. The placeholders sell it: `{Status}` in "If this value", "Approved" in "This value", "Content shown when the condition is true" in the big box. The Comparison dropdown shows "is / is not / contains / is greater than / is one of …" instead of operator codes. I felt I could do this without understanding shortcodes at all. The only word that gave me pause was the gray hint "a field or merge tag" next to "If this value" — I don't know what a merge tag is, but `{Status}` and the word "field" gave me enough to guess.

---

## Task walkthrough

### gventry — build `[gventry entry_id="123" view_id="4"]`

1. **Scrolled a long way** to find the builder (it's at the very bottom, ~81% down the page, below the whole reference + attributes table). I almost missed it; my first instinct was to copy one of the example code blocks near the top and hand-edit the numbers.
2. **Tried Copy with empty required fields first** (expected: a clear "you're not done" signal). The output box showed a bare `[gventry]`. Clicking Copy did **nothing visible** at first — button stayed "Copy", no "Copied!" toast. Confusing: "Did it copy? Is it broken?" THEN the UI updated: red "Please fill this in." appeared under Entry ID and View ID, both got a red border, and a red line above the button said "Fill in the required fields (Entry ID, View ID) before copying." That message is good and names the exact fields. But it only appears AFTER I click — nothing warns me up front, and the broken `[gventry]` sits in the output box looking copyable the whole time.
3. **Typed `123` into Entry ID and `4` into View ID.** Output updated live to `[gventry entry_id="123" view_id="4"]` — exactly matching the example above. The red warnings cleared the moment I filled the fields. 
4. **Clicked Copy on the valid shortcode** → button flipped to **"Copied!"** for a moment. That's the green-check feedback I trust. 
5. Poked the **Edit dropdown** and chose "true" → output became `[gventry entry_id="123" view_id="4" edit="true"]`. This worried a more careful colleague: the help text literally says "Set to 1…" and every example uses `edit="1"`, but the builder emits `edit="true"`. I wouldn't notice, but it's an inconsistency.

Final shortcode I'd trust and paste: `[gventry entry_id="123" view_id="4"]` ✅

### gvlogic — build a conditional block + try merge-tag preview

1. Filled it out like a sentence: If this value `{Status}`, Comparison "is", This value `Approved`, Show when it matches `Congratulations, you're approved!`, Otherwise show `Your application is still being reviewed.`
2. Output box produced, live and correct:
   ```
   [gvlogic if="{Status}" is="Approved"]
   Congratulations, you're approved!
   [else]
   Your application is still being reviewed.
   [/gvlogic]
   ```
   I'd absolutely trust this. It hid the weird gvlogic detail where the operator becomes the attribute name (`is="Approved"`) — I never had to know that.
3. **Merge-tag preview.** Because I'd typed `{Status}`, a new section appeared below the result: "This uses merge tags. Enter sample values to preview the result:" with a `{Status}` sample-value box and a SECOND code box. I typed `Approved` as the sample value. The second box changed to `[gvlogic if="Approved" is="Approved"] …`. 
   - Honest reaction: I expected "preview the result" to show me **the message my visitor will see** ("Congratulations, you're approved!"). Instead it just swapped `{Status}` → `Approved` and still showed all the `[gvlogic]`/`[else]`/`[/gvlogic]` plumbing. It doesn't tell me whether the condition matched or which branch wins. I was left unsure what I was looking at.
   - Also: two near-identical code boxes stacked close together. The bottom (preview) one has the literal `Approved` baked in. If I got confused and selected/copied THAT one, my shortcode would lose the dynamic `{Status}` and break. The preview box has no Copy button (good), but it's visually identical and selectable.
4. **Cleared "If this value" and clicked Copy** (error-recovery test). Output became `[gvlogic is="Approved"]…` — the `if=` is just **gone**, leaving a broken shortcode (a comparison with nothing to compare). Copy still said **"Copied!"** with **no warning at all**. "If this value" has no required `*` and no validation. I'd happily paste a broken shortcode and never know why my page is blank.

Final shortcode I'd trust and paste: the full `[gvlogic if="{Status}" is="Approved"]…[/gvlogic]` block ✅

---

## Heuristic findings

| Heuristic | gventry | gvlogic | Notes |
|---|---|---|---|
| **label_clarity** | PASS | PASS | Plain-English labels on both ("Entry ID", "If this value", "Comparison", "Otherwise show"). "Secret" needs its help text to make sense (P3). Raw names in gray pills are a nice touch. |
| **real_world / jargon** | PASS (P3) | FLAG P2 | gventry help text reads plainly. gvlogic's "a field or merge tag" hint uses "merge tag" with no explanation; a non-coder won't know what that is. The `{Status}` placeholder partly rescues it. |
| **recognition** | FLAG P2 | FLAG P2 | Live-updating output + "Copied!" makes "done" clear once you find the builder. But the builder is far below the fold and absent from the page's table of contents, so noticing it at all is the weak link. |
| **error_recovery** | PASS (P2) | **FAIL P1** | gventry: blocks copy on empty required fields, shows "Please fill this in." + names the fields. Good — but only AFTER you click, and the no-op-on-first-click reads as "broken." gvlogic: clearing required "If this value" silently emits a broken `[gvlogic is="…"]`, copies it, says "Copied!", zero warning. |
| **help_documentation** | PASS | PASS | Per-field help text sits right under each field. gvlogic's example-rich reference is directly above. |
| **discoverability** | FAIL P2 | FAIL P2 | Builder is at ~81% page depth, below a long reference + attributes table, and is NOT in the right-hand table of contents. Copy button itself is obvious once seen. Merge-tag preview is discoverable but only appears after typing a `{…}` tag (which is fine, but undiscoverable if you don't). |

---

## Findings by severity

**P1 (major confusion / wrong-or-broken result)**
- **gvlogic emits and copies a broken shortcode with no warning.** Clearing the required "If this value" field produces `[gvlogic is="Approved"]…` (no `if=`), and Copy still succeeds with a cheerful "Copied!". The field carries no required `*` and no validation. A pasted result silently fails. Either require `if` (warn like gventry does) or, at minimum, don't emit a dangling comparison operator with no target. (field: "If this value" / Copy button)
- **Inconsistency between the two builders' validation.** gventry blocks empty-required copy with red "Please fill this in." messages; gvlogic happily copies a broken result. Same component family should behave the same way.

**P2 (noticeable friction / unclear)**
- **Builder is buried and not in the page TOC** (both pages, ~81% down). Non-technical users may never scroll to it and will hand-edit the top example code blocks instead. Add a "Shortcode builder" entry to the right-hand table of contents, and/or surface a link/anchor near the top ("Prefer to fill in a form? Jump to the builder").
- **gventry: first Copy click on empty fields looks like nothing happened.** The button doesn't change and the warning only renders a beat later. For a non-coder this reads as "the button is broken." Show the validation message immediately (proactively, even before the click) and/or disable the Copy button until required fields are filled.
- **gvlogic merge-tag preview is mislabeled.** "Enter sample values to preview the result" but the preview only substitutes the merge tag into the shortcode; it doesn't show the resolved visible output (which branch shows, what text the visitor sees). Either rename it ("Preview with sample values substituted") or actually resolve the condition and show the winning content.
- **gvlogic: two near-identical code boxes.** The preview box (with the literal sample value baked in) sits right under the real copyable shortcode. A confused user could select/copy the preview and ship a non-dynamic shortcode. Visually distinguish the preview (different background/label like "Preview only — do not copy").
- **gvlogic "merge tag" jargon** in the "a field or merge tag" hint, unexplained.

**P3 (polish)**
- **gventry "Edit" dropdown emits `edit="true"`** while all docs/examples use `edit="1"` and the help says "Set to 1…". Align the emitted value (`1`/`0`) with the documentation, or confirm `true` is equivalent and update the docs.
- **gventry "Secret" field** momentarily alarming ("do I have a secret?"). The help text resolves it ("You only need this if you have turned on Enhanced Security"), so consider leading the help text with "Most people leave this blank."
- The improved labels should be the only version shipped; make sure the older raw-`entry_id`-only render with pre-emptive red borders isn't what reaches production.

---

## Support tickets I'd actually file

1. "I filled in the gvlogic builder, copied it, pasted it on my page, and the page shows nothing / the message never appears. What did I do wrong?" (Likely the silently-broken empty-`if` case, or pasting the preview box.)
2. "On the gvlogic page, what does 'merge tag' mean, and what do I put in the 'If this value' box? Is `{Status}` literally what I type, or do I replace it with something?"
3. "The gventry builder says `edit` should be set to `1`, but the builder gave me `edit=\"true\"`. Which one is correct?"
4. "Is there a fill-in-the-blanks tool for building these shortcodes? I've just been copying the examples and editing the numbers by hand." (i.e., the builder exists but I never found it.)
5. "I clicked Copy on the gventry builder and nothing happened — is the button broken?" (empty-required, no immediate feedback.)

---

## Screenshots saved

- `01-gventry-builder-first-look.png` — gventry builder, FIRST render: raw `entry_id` labels, pre-emptive red borders + red "Required" under empty fields.
- `02-gventry-builder-header.png` — gventry builder heading + intro line in context (below "Full guide").
- `03-gventry-empty-copy-broken-output.png` — gventry, empty required fields, output shows bare `[gventry]`.
- `04-gventry-builder-current-labels.png` — gventry builder, RE-LOADED build with friendly labels ("Entry ID", "View ID", "Edit", "Secret").
- `05-gventry-filled-result.png` — gventry filled, output `[gventry entry_id="123" view_id="4"]`.
- `06-gventry-copied-feedback.png` — gventry valid shortcode, Copy clicked (the "Copied!" feedback state).
- `07-gventry-empty-silent-nofeedback.png` — gventry after clicking Copy on empty fields: red "Please fill this in." + "Fill in the required fields…before copying."
- `08-gvlogic-builder-first-look.png` — gvlogic conditional builder, first impression (plain-English labels + placeholders).
- `09-gvlogic-filled-result.png` — gvlogic filled, full `[gvlogic …][else]…[/gvlogic]` block generated.
- `10-gvlogic-mergetag-preview-appears.png` — merge-tag preview section appears after typing `{Status}` (sample-value box, second code box still raw).
- `11-gvlogic-mergetag-preview-substituted.png` — sample value "Approved" entered; preview box swaps `{Status}`→`Approved` but still shows full shortcode plumbing (doesn't resolve the visible result).

---

## What genuinely works well

- The gvlogic "If this value / Comparison / This value / Show when it matches / Otherwise show" framing is excellent for non-coders and hides gvlogic's operator-as-attribute weirdness completely.
- Comparison dropdown maps operator codes to plain English ("is not", "contains", "is one of", "is greater than"). This is the part I feared most and it was painless.
- Live-updating output box on both builders; you see the shortcode form as you type.
- "Copied!" feedback on a valid copy is exactly the visual confirmation I trust.
- The merge-tag preview EXISTING at all is a nice, thoughtful touch — it just needs to deliver the "result" it promises.
- gventry's post-click validation message names the exact missing fields by their friendly label ("Fill in the required fields (Entry ID, View ID)").
