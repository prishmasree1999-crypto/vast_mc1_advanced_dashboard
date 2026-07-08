# Advanced VAST MC1 Embargo Breach Dashboard

This is an advanced VS Code dashboard for the VAST Challenge 2026 MC1 embargo breach investigation.
It uses Python for data preparation and JavaScript/D3/Vega-Lite for advanced visualisation.

## What makes this advanced

The dashboard avoids simple isolated charts and instead includes:

1. **Forensic causal map** — shows the full cause-and-effect story.
2. **Information movement Sankey** — shows how communication moved from agents/channels to the public breach.
3. **June 5 breach sequence** — shows the minute-level sequence of the breach.
4. **Behaviour deviation small multiples** — compares each agent with their own baseline.
5. **Agent × channel matrix** — highlights side_huddle and public channel use.
6. **Risk radar** — decomposes risk by activity spike, shadow channel, public exposure, sensitive language, Judge silence and direct breach.
7. **Risk ranking with components** — corrects the wrong all-agents-equal risk score.
8. **Leading indicator matrix** — proves warning signs before June 5.
9. **Keyword burst timeline** — tracks sensitive merger language.
10. **Judge silence gap** — shows the warning-to-breach failure window.
11. **Evidence cards** — links findings to real timestamped messages.

## Purpose

This project investigates the VAST Challenge 2026 MC1 embargo breach using advanced visual analytics.

It answers:

1. What caused the breach?
2. Which agents behaved abnormally?
3. Were there early warning signs before June 5?

## Tools used

- Python for data cleaning
- JavaScript for dashboard
- D3.js for advanced causal graph, Sankey, radar and swimlane
- Vega-Lite for heatmap, keyword timeline and risk ranking
- VS Code Live Server for running the dashboard

## Folder structure

vast_mc1_project/
├── data_raw/
│   └── MC1_final_00.json
├── data_clean/
├── python_scripts/
│   └── clean_vast_mc1.py
├── visualisation/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── outputs/
├── requirements.txt
└── README.md

## How to run

### Step 1

Put the original JSON file here:

data_raw/MC1_final_00.json

### Step 2

Install Python packages:

pip install -r requirements.txt

### Step 3

Run data cleaning:

python python_scripts/clean_vast_mc1.py

### Step 4

Open this file with VS Code Live Server:

visualisation/index.html

## Advanced visualisations included

1. Forensic causal map
2. June 5 breach swimlane
3. Information movement Sankey
4. Agent × channel heatmap
5. Behaviour deviation chart
6. Keyword burst timeline
7. side_huddle leading indicator chart
8. Judge silence gap chart
9. Risk radar
10. Corrected agent risk ranking
11. Evidence cards

## Final finding

The breach was predictable. It did not suddenly happen on June 5. The data shows earlier warning signs through side_huddle activity, sensitive keyword activity, weak Judge-Agent enforcement and Legal-Agent self-authorisation before the public breach.
