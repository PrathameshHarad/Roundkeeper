"use strict";

const STORAGE_KEY = "roundkeeper.data.v1";

const elements = {
  emptyState: document.querySelector("#empty-state"),
  emptyCreateGame: document.querySelector("#empty-create-game"),
  gameView: document.querySelector("#game-view"),
  gameName: document.querySelector("#game-name"),
  gamePicker: document.querySelector("#game-picker"),
  nextRound: document.querySelector("#next-round"),
  playerCount: document.querySelector("#player-count"),
  playerList: document.querySelector("#player-list"),
  addPlayerForm: document.querySelector("#add-player-form"),
  playerName: document.querySelector("#player-name"),
  playerMessage: document.querySelector("#player-message"),
  leaderboard: document.querySelector("#leaderboard"),
  roundHistory: document.querySelector("#round-history"),
  undoButton: document.querySelector("#undo-button"),
  createGameDialog: document.querySelector("#create-game-dialog"),
  createGameForm: document.querySelector("#create-game-form"),
  newGameName: document.querySelector("#new-game-name"),
  newGameButton: document.querySelector("#new-game-button"),
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { games: [], activeGameId: null };

    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.games)) {
      throw new Error("Saved game data has an invalid format.");
    }
    return {
      games: parsed.games.filter((game) =>
        game &&
        typeof game.id === "string" &&
        typeof game.name === "string" &&
        Array.isArray(game.players) &&
        Array.isArray(game.rounds)
      ),
      activeGameId: typeof parsed.activeGameId === "string" ? parsed.activeGameId : null,
    };
  } catch (error) {
    console.error("Could not restore saved games:", error);
    return { games: [], activeGameId: null };
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save game data:", error);
    window.alert("Your changes could not be saved on this device. Check available browser storage and try again.");
  }
}

function activeGame() {
  return state.games.find((game) => game.id === state.activeGameId) ?? null;
}

function makeId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showCreateGame() {
  elements.newGameName.value = "";
  elements.createGameDialog.showModal();
  elements.newGameName.focus();
}

function render() {
  const game = activeGame();
  elements.emptyState.hidden = Boolean(game);
  elements.gameView.hidden = !game;
  if (!game) return;

  elements.gameName.textContent = game.name;
  elements.gamePicker.replaceChildren();
  for (const savedGame of state.games) {
    const option = document.createElement("option");
    option.value = savedGame.id;
    option.textContent = savedGame.name;
    option.selected = savedGame.id === game.id;
    elements.gamePicker.append(option);
  }

  elements.nextRound.textContent = String(game.rounds.length + 1);
  elements.playerCount.textContent = String(game.players.length);
  renderPlayers(game);
  renderLeaderboard(game);
  renderHistory(game);
}

function renderPlayers(game) {
  elements.playerList.replaceChildren();
  elements.playerMessage.textContent = "";

  if (game.players.length === 0) {
    elements.playerList.append(
      createNode("p", "empty-note", "Add everyone at the table to start keeping score.")
    );
    return;
  }

  for (const player of game.players) {
    const button = createNode("button", "player-button");
    button.type = "button";
    button.disabled = game.players.length === 0;
    button.setAttribute("aria-label", `Record ${player.name} as winner of round ${game.rounds.length + 1}`);
    const avatar = createNode("span", "player-avatar", player.name.trim().charAt(0).toLocaleUpperCase());
    avatar.setAttribute("aria-hidden", "true");
    button.append(avatar, createNode("span", "player-button-label", player.name), createNode("span", "record-plus", "+"));
    button.addEventListener("click", () => {
      game.rounds.push({ id: makeId(), playerId: player.id, number: game.rounds.length + 1 });
      saveState();
      render();
    });
    elements.playerList.append(button);
  }
}

function renderLeaderboard(game) {
  elements.leaderboard.replaceChildren();
  if (game.players.length === 0) {
    elements.leaderboard.append(createNode("p", "empty-note", "Scores will show up here once you add players."));
    return;
  }

  const rows = game.players.map((player) => ({
    player,
    wins: game.rounds.filter((round) => round.playerId === player.id).length,
  })).sort((a, b) => b.wins - a.wins || a.player.name.localeCompare(b.player.name));

  rows.forEach(({ player, wins }, index) => {
    const row = createNode("div", "leaderboard-row");
    const rank = createNode("span", `rank${index === 0 && wins > 0 ? " rank-first" : ""}`, index === 0 && wins > 0 ? "★" : `${index + 1}.`);
    const name = createNode("span", "leader-name", player.name);
    const score = createNode("span", "leader-wins", `${wins} ${wins === 1 ? "win" : "wins"}`);
    row.append(rank, name, score);
    elements.leaderboard.append(row);
  });
}

function renderHistory(game) {
  elements.roundHistory.replaceChildren();
  elements.undoButton.disabled = game.rounds.length === 0;

  if (game.rounds.length === 0) {
    elements.roundHistory.append(createNode("p", "empty-note", "Your recorded rounds will appear here. Tap a player above when someone wins."));
    return;
  }

  [...game.rounds].reverse().forEach((round) => {
    const winner = game.players.find((player) => player.id === round.playerId);
    const row = createNode("div", "round-row");
    row.dataset.roundId = round.id;
    row.append(createNode("span", "round-number", `Round ${round.number}`));
    const detail = createNode("div", "round-winner");
    detail.append(document.createTextNode(winner ? winner.name : "Player removed"));
    detail.append(createNode("span", "round-meta", "Winner"));
    row.append(detail);

    const actions = createNode("div", "round-actions");
    const editButton = createNode("button", "icon-button", "Edit");
    editButton.type = "button";
    editButton.setAttribute("aria-label", `Correct winner for round ${round.number}`);
    editButton.addEventListener("click", () => startCorrection(game, round, row));
    actions.append(editButton);
    row.append(actions);
    elements.roundHistory.append(row);
  });
}

function startCorrection(game, round, row) {
  if (game.players.length === 0) return;

  const detail = row.querySelector(".round-winner");
  const actions = row.querySelector(".round-actions");
  const select = createNode("select", "correction-select");
  select.setAttribute("aria-label", `Select winner for round ${round.number}`);
  for (const player of game.players) {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    option.selected = player.id === round.playerId;
    select.append(option);
  }

  const saveButton = createNode("button", "icon-button", "Save");
  saveButton.type = "button";
  saveButton.addEventListener("click", () => {
    round.playerId = select.value;
    saveState();
    render();
  });
  const cancelButton = createNode("button", "icon-button", "Cancel");
  cancelButton.type = "button";
  cancelButton.addEventListener("click", render);

  detail.replaceChildren(select);
  actions.replaceChildren(saveButton, cancelButton);
  select.focus();
}

elements.emptyCreateGame.addEventListener("click", showCreateGame);
elements.newGameButton.addEventListener("click", showCreateGame);
document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  if (state.games.length === 0) showCreateGame();
  else {
    state.activeGameId = state.games[0].id;
    saveState();
    render();
  }
});

document.querySelector(".dialog-close").addEventListener("click", () => elements.createGameDialog.close());
elements.createGameDialog.addEventListener("click", (event) => {
  if (event.target === elements.createGameDialog) elements.createGameDialog.close();
});

elements.createGameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.newGameName.value.trim();
  if (!name) return;

  const game = { id: makeId(), name, players: [], rounds: [] };
  state.games.unshift(game);
  state.activeGameId = game.id;
  saveState();
  elements.createGameDialog.close();
  render();
  elements.playerName.focus();
});

elements.gamePicker.addEventListener("change", () => {
  state.activeGameId = elements.gamePicker.value;
  saveState();
  render();
});

elements.addPlayerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const game = activeGame();
  const name = elements.playerName.value.trim();
  if (!game || !name) return;
  if (game.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    elements.playerMessage.textContent = "That player is already in this game.";
    elements.playerName.focus();
    return;
  }

  game.players.push({ id: makeId(), name });
  elements.playerName.value = "";
  saveState();
  render();
  elements.playerName.focus();
});

elements.undoButton.addEventListener("click", () => {
  const game = activeGame();
  if (!game || game.rounds.length === 0) return;
  game.rounds.pop();
  saveState();
  render();
});

render();
