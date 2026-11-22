# Designlapse — instructions for AI agents

Use this whenever the user asks you to design something: an app screen, a web page, a component, a dashboard.
You deliver the finished design, and Designlapse turns it into a page where the user can scrub from the first
piece to the final screen, branch from any step, and copy a reference to a step to ask you for changes.

## 1. Design the final screen

Write the finished design as **one standalone HTML file**: a complete document with its own `<style>`, no
scripts (designs are shown in a sandboxed frame). Make it full fidelity — real colours, type, spacing and content.
Close every tag you open.

Size it for its frame:

| frame     | viewport   | notes                                                    |
|-----------|------------|----------------------------------------------------------|
| `phone`   | 390 × 844  | iOS/Android screen; leave ~54px at the top for the status bar |
| `tablet`  | 820 × 1180 |                                                          |
| `browser` | 1280 × 800 | web pages; taller pages scroll inside the viewer         |
| `none`    | any        | set width/height in the design JSON                      |

Inter from Google Fonts is a good default:
`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`

## 2. Tag the pieces in build order

Add `data-step="N"` to the pieces of the design in the order they should appear — top to bottom, outside in.
Each step shows every piece up to N, exactly as it looks in the final design. Untagged elements always show.
Several elements can share a number. Aim for 8–15 steps. Example for a mobile profile screen:

```html
<div class="cover" data-step="1">
  <button class="back" data-step="2">…</button>
  <button class="more" data-step="2">…</button>
</div>
<div class="avatar" data-step="3">AM</div>
<div class="who" data-step="4">…name and handle…</div>
<p class="bio" data-step="5">…</p>
<div class="stats" data-step="6">…</div>
<div class="actions" data-step="7">…</div>
<nav class="tabs" data-step="8">…</nav>
<div class="grid" data-step="9">…</div>
<nav class="tabbar" data-step="10">…</nav>
```

Don't make wireframe or placeholder versions; every step uses the final design's real styling.

## 3. Add it

```bash
npx designlapse add path/to/final.html --title "User profile" --prompt "<the user's request>" --frame phone
```

This writes the steps to `designs/<name>/`, records the design in `designs/<name>.json`, and builds
`designs/designlapse.html`, which holds every design in the project behind a picker. Add `--open` to open it.
Each new request (another screen or part of the app) is a new `add` with its own `--title`.

## 4. Iterate from a step

The user can copy a reference to any step. It looks like:

```
Designlapse “User profile” (designs/user-profile.json) — step 7 (designs/user-profile/07.html)
Iterate from this step: make the avatar bigger
```

To respond: copy that step's file, make the change (full fidelity), save it somewhere, then run

```bash
npx designlapse iterate user-profile path/to/changed.html --from 7
```

It becomes a new step (the next number). If step 7 wasn't the latest step, it's a branch: the canvas shows it
on its own row under step 7. Never edit or delete existing step files. Tell the user the new step number;
`designs/designlapse.html#user-profile/step-13` opens it.

`npx designlapse list` shows every design and step; `npx designlapse build` rebuilds the page.
