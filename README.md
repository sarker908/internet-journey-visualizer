# What If?

**One decision. Infinite possibilities.**

What If? is a cinematic, interactive alternate-reality experience. Choose a hypothetical situation, make decisions, and discover how your choices shape a different outcome.

This repository was repurposed from its previous project and rebuilt as **What If?**.

## Live demo

Enable GitHub Pages for this repository (Settings → Pages → Deploy from a branch → main / root), then open the published URL.

## Features

- Six original scenarios across survival, time travel, future technology, mystery-style decisions and human nature
- Branching narrative engine driven by a graph of story nodes
- Multiple endings based on the path a player chooses
- Personal timeline showing each event and decision
- Local reality archive saved in the browser
- Replay scenarios to explore alternate paths
- Responsive cinematic interface
- No AI, backend, API key, database or build step required

## Run locally

Because this is a static website, no installation is required.

1. Download or clone this repository.
2. Open `index.html` in a modern browser.

For the best local development experience, use the VS Code Live Server extension or run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project structure

```text
what-if/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── app.js
│       └── scenarios.js
└── README.md
```

## How the story engine works

Each scenario is a directed graph. Every story node has a unique ID, narrative content and a list of choices. A choice points to the ID of the next node. Ending nodes contain an ending flag and the final outcome.

The application tracks the path and selected choices in JavaScript, renders the next node, and stops when it reaches an ending. The timeline is generated from the recorded path. Completed outcomes are stored in browser LocalStorage.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- LocalStorage
- SVG/CSS-inspired visual effects

## Notes

- Progress is stored locally in the current browser. It is not synchronized between devices.
- Story outcomes are predefined. The application does not use generative AI.
- Scenario content is fictional and intended for interactive entertainment.

## License

MIT
