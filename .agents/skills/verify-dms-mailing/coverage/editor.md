# Coverage: editor

Sources: docs/4.usage/3.editor.md, 5.extending (Amounts and dates, Footer links), 6.faq (Do edits change what customers receive).

| Behaviour (page, section) | Journey | Check |
|---|---|---|
| Edits stay in a draft; real sends use the published version (Draft, test, publish; FAQ) | edits-stay-in-a-draft-until-published | a save writes a draft next to the published content; a real send uses the published version |
| Discard draft drops the changes and goes back to the published version | edits-stay-in-a-draft-until-published | discard goes back to the published version |
| Content put back as published leaves no draft | edits-stay-in-a-draft-until-published | content put back as published leaves no draft |
| Publishing without a change writes no version | edits-stay-in-a-draft-until-published | publishing without a change writes no version |
| A template never published has nothing to discard | edits-stay-in-a-draft-until-published | a template never published has nothing to discard |
| A save, publish or restore behind the stored draft is refused | a-stale-editor-cannot-overwrite-a-newer-draft | a stale writer is refused; restore refuses a stale revision |
| The version history restores an earlier version into the draft; customers keep the live version | a-version-restores-as-a-draft-and-customers-stay-on-the-live-one | version 1 comes back as the draft; a send meanwhile uses version 2 |
| Restoring the live version leaves no draft; an unknown version is a 404 | a-version-restores-as-a-draft-and-customers-stay-on-the-live-one | restoring the live version leaves no draft; version zero does not exist |
| Blocks: Heading (alignment, size), Paragraph (alignment), Image (alt), Button (link, alignment), List (rows per item), Total, Code, Divider, Footer | every-block-type-renders-with-its-settings | each block renders |
| Condition blocks show their if or else branch | visibility-rules-compare-a-variable-with-a-value | a condition block shows its if branch when the rule holds and its else branch otherwise |
| Visibility: filled, empty, equals, differs, greater, lower | visibility-rules-compare-a-variable-with-a-value | every operator shows and hides the right blocks |
| Tokens `{{path}}` resolve in the subject, the preheader and the blocks | every-block-type-renders-with-its-settings | the preview answers the subject, the preheader and no missing variable |
| The preview names the variables the data does not carry | footer-links-need-a-label-and-a-url-and-tokens-report-what-is-missing | the preview names the variables the data does not carry |
| Amounts and dates are written for the locale of the send (Amounts and dates) | amounts-and-dates-are-written-in-the-locale-of-the-send | French, English |
| A list's length and an element by index resolve; numbers and formatted strings go out as given | amounts-and-dates-are-written-in-the-locale-of-the-send | French |
| An unknown currency code writes a plain number | amounts-and-dates-are-written-in-the-locale-of-the-send | an unknown currency writes a plain number (an invalid code such as EURO; the well-formed unknown ZZZ writes "ZZZ 9,874.20", which the docs do not describe) |
| Footer unsubscribe and preferences links need a label and a URL; an empty label removes the link (Footer links) | footer-links-need-a-label-and-a-url-and-tokens-report-what-is-missing | footer links |
| Editor panes, tabs, toolbar and palette (Layout) | the-editor-page-has-its-panes-toolbar-and-keyboard-shortcuts | the editor shows its panes, toolbar and block palette |
| Shortcuts Ctrl+S, Ctrl+D, Ctrl+Z, Ctrl+Shift+Z, Delete, Backspace, T, Escape | the-editor-page-has-its-panes-toolbar-and-keyboard-shortcuts | one verify step per shortcut |
| Shortcut Ctrl+Enter opens the publish review, and publishing from it goes live | ctrl-enter-opens-the-publish-review-and-publishing-from-it-goes-live; the-editor-page-has-its-panes-toolbar-and-keyboard-shortcuts | Ctrl+Enter opens "Publish Keyboard publish?" with Publish v1 while the template stays a draft with no version; Keep editing closes it and publishes nothing; Publish v1 leaves the template live with versions [1], no draft, and a send going out with the published subject; a later change reviews and publishes as v2. The page journey also checks the dialog's three choices |
| Shortcuts Ctrl+Y redoes, `/` searches blocks | the-editor-page-has-its-panes-toolbar-and-keyboard-shortcuts | Ctrl+Z then Ctrl+Y leaves two headings in the saved draft; `/` then "div" leaves only the Divider block in the palette. Cmd+Enter on macOS is Not driven (the harness runs Chromium on Linux) |
| Drag a block from the palette to the canvas | Not driven | the harness has no pointer drag; clicking the palette is driven |
| Variables tab declaring a variable with its type and required flag; Declare in one click; the type labels | Not driven | the variable declarations are driven through the API (version restore), the panel is not |
| Locale switch with a dot for a missing locale; the empty canvas counting recipients who got the fallback | Not driven | needs 30 days of fallback sends and a second locale in the UI |
| Publish changes lists the changes and the checks; a locale with an empty subject stops the publish | Not driven in the UI | the API refusal (empty_subject 422) is driven in the templates feature |
| Test sends the draft to up to 5 addresses with [TEST] | Not driven here | the sends feature drives the test send and its recipients |
| Desktop/Mobile and Variables/Data switches change the preview | Not driven | the preview frame is an iframe the harness does not read |
