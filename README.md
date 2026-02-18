# dice-decision-engine

Simple browser-based decision helper for a dice bidding game (Liar's Dice style), built with plain HTML/CSS/JS.

## How the probability algorithm works

The calculator splits dice into:
- `known dice`: your own visible dice
- `unknown dice`: all dice held by other players

For any target face `Y`:
- each unknown die matches with probability `p = 1/6`
- number of matches among unknown dice follows a **Binomial** distribution:
  - `K ~ Binomial(n = unknownDiceCount, p = 1/6)`

The app computes the full binomial PMF once per calculation and uses it for all actions.

## Core probability formulas

Let:
- `c = count of face Y in your known dice`
- `X = bid quantity`
- `K = matches from unknown dice`

Then:
- Current bid true (minimum claim):  
  `P(total >= X) = P(c + K >= X)`
- Challenge correct:  
  `P(current bid false) = 1 - P(total >= X)`
- Exact call correct:  
  `P(total == X) = P(c + K == X)`

## Raise generation

Legal raises are generated in bid order:
- higher `X` always beats lower `X`
- if `X` is equal, higher `Y` beats lower `Y`

For each legal raise `(Xr, Yr)`, the app computes:
- `P(raise true) = P(total of Yr >= Xr)`
- `P(raise false) = 1 - P(raise true)`

The “best raise” is the raise with highest `P(raise true)` (tie-break: lower `X`, then lower `Y`).

## Best decision output

The summary compares pure correctness probabilities between:
- `Challenge`
- `Call Exact`
- `Best Raise`

and picks the highest one.

## Exact call risk/reward model (current rules)

Configured by:
- `Z` = dice lost by each opponent if exact call is correct
- `players` = players remaining including you

If exact call is correct:
- all opponents lose `Z` each
- total opponent loss = `(players - 1) * Z`

If exact call is wrong:
- caller loses `1` die

Analytics section shows this from both perspectives:
- caller expected net swing
- opponents expected losses

## Run locally

Open `index.html` directly, or run:

```bash
python3 -m http.server 8000
```

Then browse to `http://localhost:8000`.
