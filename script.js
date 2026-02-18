"use strict";

const myDiceInput = document.getElementById("myDice");
const otherDiceInput = document.getElementById("otherDice");
const bidQtyInput = document.getElementById("bidQty");
const bidFaceInput = document.getElementById("bidFace");
const penaltyZInput = document.getElementById("penaltyZ");
const playerCountInput = document.getElementById("playerCount");
const calcBtn = document.getElementById("calcBtn");
const sortRaisesBtn = document.getElementById("sortRaisesBtn");
const toggleRaisesBtn = document.getElementById("toggleRaisesBtn");
const errorEl = document.getElementById("error");
const summaryCards = document.getElementById("summaryCards");
const bestAction = document.getElementById("bestAction");
const analyticsCards = document.getElementById("analyticsCards");
const raiseMeta = document.getElementById("raiseMeta");
const raiseTableBody = document.getElementById("raiseTableBody");

const RAISE_PREVIEW_LIMIT = 10;

const raiseState = {
  allRaises: [],
  bestRaise: null,
  totalDice: 0,
  sortByChance: false,
  showFull: false,
};

function parseDice(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  const dice = [];

  for (const token of tokens) {
    const value = Number(token);
    if (!Number.isInteger(value) || value < 1 || value > 6) {
      throw new Error(`Invalid die value "${token}". Use only integers 1-6.`);
    }
    dice.push(value);
  }

  return dice;
}

function buildBinomialDistribution(n, p) {
  const probs = new Array(n + 1).fill(0);
  const q = 1 - p;

  probs[0] = Math.pow(q, n);
  for (let k = 0; k < n; k += 1) {
    probs[k + 1] = probs[k] * ((n - k) / (k + 1)) * (p / q);
  }

  let sum = 0;
  for (const prob of probs) sum += prob;
  if (sum > 0) {
    for (let i = 0; i < probs.length; i += 1) probs[i] /= sum;
  }

  const suffix = new Array(n + 2).fill(0);
  for (let k = n; k >= 0; k -= 1) {
    suffix[k] = suffix[k + 1] + probs[k];
  }

  return { n, probs, suffix };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function probabilityAtLeast(requiredTotal, knownCount, distribution) {
  const neededFromUnknown = requiredTotal - knownCount;
  if (neededFromUnknown <= 0) return 1;
  if (neededFromUnknown > distribution.n) return 0;
  return clamp01(distribution.suffix[neededFromUnknown]);
}

function probabilityExact(requiredTotal, knownCount, distribution) {
  const neededFromUnknown = requiredTotal - knownCount;
  if (neededFromUnknown < 0 || neededFromUnknown > distribution.n) return 0;
  return clamp01(distribution.probs[neededFromUnknown]);
}

function formatPct(probability) {
  return `${(probability * 100).toFixed(2)}%`;
}

function countFaces(dice) {
  const counts = Array(7).fill(0);
  for (const face of dice) counts[face] += 1;
  return counts;
}

function chooseBestRaise(raises) {
  if (raises.length === 0) return null;
  const eps = 1e-12;
  let best = raises[0];

  for (const row of raises) {
    if (row.minTrue > best.minTrue + eps) {
      best = row;
      continue;
    }
    if (Math.abs(row.minTrue - best.minTrue) <= eps) {
      if (row.qty < best.qty || (row.qty === best.qty && row.face < best.face)) {
        best = row;
      }
    }
  }

  return best;
}

function chooseBestMove(challengeCorrect, callExactCorrect, bestRaise) {
  const options = [
    { label: "Challenge", prob: challengeCorrect },
    { label: "Call Exact", prob: callExactCorrect },
  ];

  if (bestRaise) {
    options.push({
      label: `Raise to ${bestRaise.qty} ${bestRaise.face}`,
      prob: bestRaise.minTrue,
    });
  }

  let best = options[0];
  for (const option of options) {
    if (option.prob > best.prob) best = option;
  }

  return best;
}

function renderSummary({ challengeCorrect, callExactCorrect, bestRaise }) {
  const bestRaiseTitle = bestRaise
    ? `Best raise true chance (${bestRaise.qty} ${bestRaise.face})`
    : "Best raise true chance";
  const bestRaiseValue = bestRaise ? formatPct(bestRaise.minTrue) : "N/A";
  const bestRaiseClass = bestRaise && bestRaise.minTrue >= 0.5 ? "good" : "warn";

  const cards = [
    {
      title: "Challenge correct (current bid false)",
      value: formatPct(challengeCorrect),
      cls: challengeCorrect >= 0.5 ? "good" : "warn",
    },
    {
      title: "Exact call correct (== X of Y)",
      value: formatPct(callExactCorrect),
      cls: callExactCorrect >= 0.2 ? "good" : "warn",
    },
    {
      title: bestRaiseTitle,
      value: bestRaiseValue,
      cls: bestRaiseClass,
    },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <div class="card summary-card">
          <span class="metric-label">${card.title}</span>
          <strong class="${card.cls}">${card.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderAnalytics({
  currentBidTrue,
  challengeCorrect,
  callExactCorrect,
  bestRaise,
  z,
  players,
}) {
  const rewardIfRight = (players - 1) * z;
  const riskIfWrong = 1;
  const exactWrong = 1 - callExactCorrect;
  const expectedOpponentsTotalLoss = callExactCorrect * rewardIfRight;
  const expectedOpponentPerPlayerLoss = callExactCorrect * z;
  const expectedCallerNetSwing =
    callExactCorrect * rewardIfRight - exactWrong * riskIfWrong;
  const riskRewardRatio = `${rewardIfRight.toFixed(2)}:1`;

  const bestMove = chooseBestMove(challengeCorrect, callExactCorrect, bestRaise);
  bestAction.innerHTML = `
    <span>Best move by pure correctness probability</span>
    <strong>${bestMove.label} (${formatPct(bestMove.prob)})</strong>
  `;

  const cards = [
    {
      title: "Current bid true chance (>= X of Y)",
      value: formatPct(currentBidTrue),
      note: "If this is low, challenge gets better.",
      cls: currentBidTrue >= 0.5 ? "good" : "warn",
    },
    {
      title: "Exact call wrong chance",
      value: formatPct(exactWrong),
      note: "Wrong call costs you 1 die.",
      cls: exactWrong >= 0.5 ? "warn" : "good",
    },
    {
      title: "Caller perspective (Exact)",
      value: `Right: +${rewardIfRight} swing | Wrong: -1`,
      note: `Risk-reward ratio: ${riskRewardRatio}`,
      cls: "good",
    },
    {
      title: "Caller expected net swing (Exact)",
      value: expectedCallerNetSwing.toFixed(2),
      note: "Positive favors calling exact long-term.",
      cls: expectedCallerNetSwing >= 0 ? "good" : "warn",
    },
    {
      title: "Opponents perspective (Exact)",
      value: `${expectedOpponentsTotalLoss.toFixed(2)} expected total dice lost`,
      note: `${expectedOpponentPerPlayerLoss.toFixed(2)} expected loss per opponent`,
      cls: "warn",
    },
  ];

  analyticsCards.innerHTML = cards
    .map(
      (card) => `
        <div class="card analytics-card">
          <span class="metric-label">${card.title}</span>
          <strong class="${card.cls}">${card.value}</strong>
          <small>${card.note}</small>
        </div>
      `
    )
    .join("");
}

function orderRaises(raises, sortByChance) {
  const ordered = [...raises];
  if (!sortByChance) return ordered;

  ordered.sort((a, b) => {
    if (b.minTrue !== a.minTrue) return b.minTrue - a.minTrue;
    if (a.qty !== b.qty) return a.qty - b.qty;
    return a.face - b.face;
  });

  return ordered;
}

function renderRaiseTable() {
  const raises = raiseState.allRaises;
  const bestRaise = raiseState.bestRaise;
  const totalDice = raiseState.totalDice;
  raiseTableBody.innerHTML = "";

  if (raises.length === 0) {
    raiseMeta.textContent = "No legal raises available from this current bid.";
    sortRaisesBtn.disabled = true;
    toggleRaisesBtn.disabled = true;
    sortRaisesBtn.textContent = "Sort: Bid Order";
    toggleRaisesBtn.textContent = "Show Full List";

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "No legal raises available from this current bid.";
    row.appendChild(cell);
    raiseTableBody.appendChild(row);
    return;
  }

  sortRaisesBtn.disabled = false;
  sortRaisesBtn.textContent = raiseState.sortByChance
    ? "Sort: Chance (High to Low)"
    : "Sort: Bid Order";

  const orderedRaises = orderRaises(raises, raiseState.sortByChance);
  const shouldLimit = !raiseState.showFull;
  const visibleRaises = shouldLimit
    ? orderedRaises.slice(0, RAISE_PREVIEW_LIMIT)
    : orderedRaises;

  toggleRaisesBtn.disabled = raises.length <= RAISE_PREVIEW_LIMIT;
  toggleRaisesBtn.textContent = raiseState.showFull
    ? `Show Top ${RAISE_PREVIEW_LIMIT}`
    : "Show Full List";

  raiseMeta.textContent = `Total legal raises: ${raises.length}. Showing ${visibleRaises.length}. Total dice in play (known + unknown): ${totalDice}.`;

  for (const raise of visibleRaises) {
    const row = document.createElement("tr");
    if (bestRaise && raise.qty === bestRaise.qty && raise.face === bestRaise.face) {
      row.classList.add("best-row");
    }

    const bidCell = document.createElement("td");
    bidCell.textContent = `${raise.qty} ${raise.face}`;

    const trueCell = document.createElement("td");
    trueCell.textContent = formatPct(raise.minTrue);

    const falseCell = document.createElement("td");
    falseCell.textContent = formatPct(raise.falseProb);

    row.appendChild(bidCell);
    row.appendChild(trueCell);
    row.appendChild(falseCell);
    raiseTableBody.appendChild(row);
  }
}

function calculate() {
  errorEl.textContent = "";

  try {
    const myDice = parseDice(myDiceInput.value);
    const otherDice = Number(otherDiceInput.value);
    const bidQty = Number(bidQtyInput.value);
    const bidFace = Number(bidFaceInput.value);
    const z = Number(penaltyZInput.value);
    const players = Number(playerCountInput.value);

    if (!Number.isInteger(otherDice) || otherDice < 0) {
      throw new Error("Other players' dice must be a non-negative integer.");
    }
    if (!Number.isInteger(bidQty) || bidQty < 1) {
      throw new Error("Current bid X must be an integer >= 1.");
    }
    if (!Number.isInteger(bidFace) || bidFace < 1 || bidFace > 6) {
      throw new Error("Current bid Y must be an integer from 1 to 6.");
    }
    if (!Number.isInteger(z) || z < 1) {
      throw new Error("Z must be an integer >= 1.");
    }
    if (!Number.isInteger(players) || players < 2) {
      throw new Error("Players remaining must be an integer >= 2.");
    }

    const totalDice = myDice.length + otherDice;
    if (totalDice < 1) {
      throw new Error("You need at least one die in play.");
    }

    const counts = countFaces(myDice);
    const distribution = buildBinomialDistribution(otherDice, 1 / 6);

    const currentBidTrue = probabilityAtLeast(bidQty, counts[bidFace], distribution);
    const challengeCorrect = 1 - currentBidTrue;
    const callExactCorrect = probabilityExact(bidQty, counts[bidFace], distribution);

    const raises = [];
    for (let qty = bidQty; qty <= totalDice; qty += 1) {
      for (let face = 1; face <= 6; face += 1) {
        if (qty === bidQty && face <= bidFace) continue;

        const minTrue = probabilityAtLeast(qty, counts[face], distribution);
        raises.push({
          qty,
          face,
          minTrue,
          falseProb: 1 - minTrue,
        });
      }
    }

    const bestRaise = chooseBestRaise(raises);

    renderSummary({
      challengeCorrect,
      callExactCorrect,
      bestRaise,
    });

    renderAnalytics({
      currentBidTrue,
      challengeCorrect,
      callExactCorrect,
      bestRaise,
      z,
      players,
    });

    raiseState.allRaises = raises;
    raiseState.bestRaise = bestRaise;
    raiseState.totalDice = totalDice;
    raiseState.showFull = false;
    renderRaiseTable();
  } catch (error) {
    summaryCards.innerHTML = "";
    bestAction.textContent = "";
    analyticsCards.innerHTML = "";
    raiseMeta.textContent = "";
    raiseTableBody.innerHTML = "";
    sortRaisesBtn.disabled = true;
    toggleRaisesBtn.disabled = true;
    errorEl.textContent = error.message || "Invalid input.";
  }
}

calcBtn.addEventListener("click", calculate);
sortRaisesBtn.addEventListener("click", () => {
  if (raiseState.allRaises.length === 0) return;
  raiseState.sortByChance = !raiseState.sortByChance;
  renderRaiseTable();
});
toggleRaisesBtn.addEventListener("click", () => {
  if (raiseState.allRaises.length <= RAISE_PREVIEW_LIMIT) return;
  raiseState.showFull = !raiseState.showFull;
  renderRaiseTable();
});
window.addEventListener("DOMContentLoaded", calculate);
