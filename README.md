# designlapse

Scrub through a design step by step.

Give it a finished HTML design with its pieces tagged in build order, and it builds a page where you can swipe
from the first piece to the final screen, jump to any step, branch from any step, and copy a reference to paste
into any AI chat. Works with any AI agent (or by hand). No dependencies.

- **Canvas:** every step of the design as an artboard, connected left to right. Branches drop to their own row.
- **Lapse:** the selected step at full size in a phone, tablet or browser frame, with a scrubber, play,
  full screen, and a **Show changes** switch that outlines what each step added.
- **Copy:** copies a reference to the current step plus your note, for example
  `Designlapse “User profile” (designs/user-profile.json) — step 7 (designs/user-profile/07.html)`.
- **Design picker:** every design in the project in one page.

## Quick start

1. Write the final design as one HTML file and tag its pieces in the order they should appear:

   ```html
   <div class="cover" data-step="1">…</div>
   <div class="avatar" data-step="2">AM</div>
   <div class="name" data-step="3">Alex Morgan</div>
   ```

2. Add it:

   ```bash
   npx designlapse add final.html --title "User profile" --prompt "Design a user profile" --open
   ```

3. Open `designs/designlapse.html` (the `--open` flag does it for you).

## Using it with an AI agent

Give your agent the instructions in [`AGENTS.md`](AGENTS.md). For example, add them to your project's agent
instructions file:

```bash
npx designlapse instructions >> AGENTS.md
```

Then ask for a design as usual ("design me a settings screen"). The agent writes the final design, tags the
pieces, and runs `designlapse add`. To change something, go to a step in the page, type what should change,
press **Copy**, and paste it into the chat. The agent saves the changed design and runs
`designlapse iterate <name> changed.html --from <step>`, which adds it as a new step (a branch if you went back).

## Commands

| command | what it does |
|---|---|
| `designlapse add <final.html> --title "…" [--prompt "…"] [--frame phone\|tablet\|browser\|none] [--url …] [--name slug] [--force]` | add a design; its `data-step` pieces become the steps |
| `designlapse iterate <name> <step.html> [--from <step>]` | add a step, continuing or branching from a step |
| `designlapse build [--name <design>]` | rebuild the page |
| `designlapse list` | list designs and their step files |
| `designlapse instructions` | print the agent guide |

Every command takes `--dir <folder>` (default `designs`) and `--open`.

## Files

```
designs/
  designlapse.html        the page (every design)
  user-profile.json       { title, prompt, frame, created, steps: [{ id, parent?, file }] }
  user-profile/01.html    one standalone HTML file per step
```

A design's JSON can be written by hand too: each step is `{ "id": "1", "file": "user-profile/01.html" }`, and
`"parent": "<id>"` makes a step continue from an earlier one.

## Keyboard

← → previous / next step · Space play · F full screen · C show changes · L show or hide the lapse

## API

```js
import { add, iterate, build, list, splitSteps } from 'designlapse';

add('final.html', { title: 'User profile', frame: 'phone' });
iterate('user-profile', 'changed.html', { from: '7' });
build();
```
