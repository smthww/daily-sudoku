"use strict";

const $ = (selector) => document.querySelector(selector);
const boardElement = $("#board");
const statusElement = $("#status");
const timerElement = $("#timer");
const difficultyElement = $("#difficulty");
const dialogElement = $("#dialog");
const rankingDialogElement = $("#ranking-dialog");
const startScreenElement = $("#start-screen");
const gameAreaElement = $("#game-area");
const nicknameElement = $("#nickname");

const state = {
  puzzle: Array(81).fill(0), current: Array(81).fill(0), solution: Array(81).fill(0),
  selected: -1, mistakes: new Set(), hints: new Set(), seconds: 0, timerId: null,
  finished: false, started: false, nickname: "", puzzleId: "", dateKey: "",
  errorCount: 0, hintCount: 0, leaderboard: [],
};

const difficultySettings = {
  easy: { holes: 36, label: "轻松" },
  medium: { holes: 45, label: "标准" },
  hard: { holes: 52, label: "挑战" },
};

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random = Math.random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function candidates(board, index) {
  if (board[index] !== 0) return [];
  const row = Math.floor(index / 9);
  const column = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  const used = new Set();
  for (let i = 0; i < 9; i += 1) {
    used.add(board[row * 9 + i]);
    used.add(board[i * 9 + column]);
    used.add(board[(boxRow + Math.floor(i / 3)) * 9 + boxColumn + (i % 3)]);
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((number) => !used.has(number));
}

function bestEmptyCell(board) {
  let bestIndex = -1;
  let bestCandidates = null;
  for (let index = 0; index < 81; index += 1) {
    if (board[index] !== 0) continue;
    const options = candidates(board, index);
    if (options.length === 0) return { index, options };
    if (bestCandidates === null || options.length < bestCandidates.length) {
      bestIndex = index;
      bestCandidates = options;
      if (options.length === 1) break;
    }
  }
  return { index: bestIndex, options: bestCandidates ?? [] };
}

function fillBoard(board, random) {
  const { index, options } = bestEmptyCell(board);
  if (index === -1) return true;
  for (const number of shuffled(options, random)) {
    board[index] = number;
    if (fillBoard(board, random)) return true;
    board[index] = 0;
  }
  return false;
}

function countSolutions(board, limit = 2) {
  let count = 0;
  function search() {
    if (count >= limit) return;
    const { index, options } = bestEmptyCell(board);
    if (index === -1) { count += 1; return; }
    for (const number of options) {
      board[index] = number;
      search();
      board[index] = 0;
      if (count >= limit) return;
    }
  }
  search();
  return count;
}

function makePuzzle(holeTarget, seedText) {
  let best = null;
  const random = seededRandom(hashSeed(seedText));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const solution = Array(81).fill(0);
    fillBoard(solution, random);
    const puzzle = [...solution];
    let holes = 0;
    for (const index of shuffled([...Array(81).keys()], random)) {
      const saved = puzzle[index];
      puzzle[index] = 0;
      if (countSolutions([...puzzle]) === 1) holes += 1;
      else puzzle[index] = saved;
      if (holes >= holeTarget) break;
    }
    if (!best || holes > best.holes) best = { puzzle, solution, holes };
    if (holes >= holeTarget) break;
  }
  if (!best || countSolutions([...best.puzzle]) !== 1) throw new Error("题目生成失败");
  return best;
}

function shanghaiDateKey() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function startTimer() {
  clearInterval(state.timerId);
  state.seconds = 0;
  timerElement.textContent = "00:00";
  state.timerId = setInterval(() => {
    if (!state.finished) timerElement.textContent = formatTime(++state.seconds);
  }, 1000);
}

function setStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = `status ${type}`.trim();
}

function renderBoard() {
  boardElement.innerHTML = "";
  const selectedValue = state.selected >= 0 ? state.current[state.selected] : 0;
  const selectedRow = Math.floor(state.selected / 9);
  const selectedColumn = state.selected % 9;
  state.current.forEach((value, index) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `第 ${row + 1} 行，第 ${column + 1} 列${value ? `，数字 ${value}` : "，空白"}`);
    button.textContent = value || "";
    if (state.puzzle[index]) button.classList.add("given");
    if (index === state.selected) button.classList.add("selected");
    if (state.selected >= 0 && (row === selectedRow || column === selectedColumn ||
      (Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(column / 3) === Math.floor(selectedColumn / 3)))) button.classList.add("related");
    if (value && selectedValue === value) button.classList.add("same");
    if (state.mistakes.has(index)) button.classList.add("error");
    if (state.hints.has(index)) button.classList.add("hint");
    button.addEventListener("click", () => selectCell(index));
    boardElement.appendChild(button);
  });
}

function selectCell(index) {
  if (state.finished || !state.started) return;
  state.selected = index;
  renderBoard();
}

function enterNumber(number) {
  const index = state.selected;
  if (index < 0 || state.puzzle[index] || state.finished || !state.started) return;
  state.current[index] = number;
  state.mistakes.delete(index);
  state.hints.delete(index);
  setStatus("继续加油。每行、每列和每个九宫格都不能重复。");
  renderBoard();
  if (state.current.every(Boolean)) checkBoard();
}

function normalizedLeaderboard(rows) {
  const bestByUser = new Map();
  rows.filter((row) => row.ranked === true && Number.isFinite(row.elapsedSeconds)).forEach((row) => {
    const key = row.userId || row._openid || row.nickname;
    const previous = bestByUser.get(key);
    if (!previous || row.elapsedSeconds < previous.elapsedSeconds ||
      (row.elapsedSeconds === previous.elapsedSeconds && (row.mistakes || 0) < (previous.mistakes || 0))) bestByUser.set(key, row);
  });
  return [...bestByUser.values()].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || (a.mistakes || 0) - (b.mistakes || 0)).slice(0, 20);
}

function renderRanking(target, limit = 20) {
  const rows = state.leaderboard.slice(0, limit);
  if (!rows.length) {
    target.className = "ranking-list muted-list";
    target.textContent = "还没有上榜成绩，等你来占据第一名。";
    return;
  }
  target.className = target.id === "ranking-full" ? "ranking-list full-ranking" : "ranking-list";
  target.innerHTML = rows.map((row, index) => {
    const mine = row.userId && row.userId === window.sudokuCloud?.getUserId();
    return `<div class="ranking-row${mine ? " me" : ""}"><span class="ranking-rank">${index + 1}</span><span class="ranking-name">${escapeHtml(row.nickname || "匿名玩家")}${mine ? "（我）" : ""}</span><span class="ranking-time">${formatTime(row.elapsedSeconds)}<small>${row.mistakes || 0} 次错误</small></span></div>`;
  }).join("");
}

function escapeHtml(text) {
  const node = document.createElement("span");
  node.textContent = String(text);
  return node.innerHTML;
}

async function loadLeaderboard(showLoading = true) {
  if (!state.puzzleId) return;
  if (showLoading) $("#ranking-preview").textContent = "正在读取…";
  try {
    const rows = await window.sudokuCloud.getLeaderboard(state.puzzleId);
    state.leaderboard = normalizedLeaderboard(rows);
    renderRanking($("#ranking-preview"), 5);
    renderRanking($("#ranking-full"));
  } catch (error) {
    console.warn("排行榜暂不可用", error);
    $("#ranking-preview").className = "ranking-list muted-list";
    $("#ranking-preview").textContent = "云端暂时未连接，游戏仍可正常进行。";
    $("#ranking-full").textContent = "排行榜暂时无法读取，请稍后再试。";
  }
}

async function completeGame() {
  state.finished = true;
  clearInterval(state.timerId);
  setStatus("恭喜完成！", "success-text");
  $("#dialog-message").textContent = `本局用时 ${formatTime(state.seconds)}，错误 ${state.errorCount} 次。`;
  $("#submit-message").textContent = "正在保存成绩…";
  dialogElement.hidden = false;
  const ranked = state.hintCount === 0;
  try {
    await window.sudokuCloud.saveScore({
      puzzleId: state.puzzleId, dateKey: state.dateKey, difficulty: difficultyElement.value,
      difficultyLabel: difficultySettings[difficultyElement.value].label,
      nickname: state.nickname, elapsedSeconds: state.seconds, mistakes: state.errorCount,
      hints: state.hintCount, ranked,
    });
    $("#submit-message").textContent = ranked ? "成绩已保存到今日排行榜。" : "成绩已保存；本局使用了提示，不计入排名。";
    await loadLeaderboard(false);
  } catch (error) {
    console.error("成绩保存失败", error);
    $("#submit-message").textContent = "成绩暂未上传，请检查网络后重新挑战。";
  }
}

function checkBoard() {
  if (!state.started || state.finished) return;
  state.mistakes.clear();
  state.current.forEach((value, index) => {
    if (value && value !== state.solution[index]) state.mistakes.add(index);
  });
  if (state.mistakes.size) {
    state.errorCount += 1;
    setStatus(`发现 ${state.mistakes.size} 个不正确的数字，已为你标出。`, "error-text");
    renderBoard();
    return;
  }
  if (state.current.some((value) => value === 0)) {
    setStatus("目前填写的数字都正确，还有空格未完成。", "success-text");
    renderBoard();
    return;
  }
  completeGame();
}

function giveHint() {
  if (state.finished || !state.started) return;
  let index = state.selected;
  if (index < 0 || state.puzzle[index] || state.current[index] === state.solution[index]) {
    const empty = state.current.map((value, i) => value === 0 && !state.puzzle[i] ? i : -1).filter((i) => i >= 0);
    if (!empty.length) return checkBoard();
    index = empty[Math.floor(Math.random() * empty.length)];
  }
  state.current[index] = state.solution[index];
  state.selected = index;
  state.mistakes.delete(index);
  state.hints.add(index);
  state.hintCount += 1;
  setStatus("已填入一个提示数字；本局完成后不会计入排行榜。", "success-text");
  renderBoard();
}

function validNickname() {
  const nickname = nicknameElement.value.trim();
  if (nickname.length < 2 || nickname.length > 12) {
    $("#nickname-error").textContent = "请输入 2–12 个字的昵称。";
    nicknameElement.focus();
    return "";
  }
  $("#nickname-error").textContent = "";
  return nickname;
}

function startGame() {
  const nickname = validNickname();
  if (!nickname) return;
  state.nickname = nickname;
  localStorage.setItem("sudokuNickname", nickname);
  $("#player-button").textContent = `玩家：${nickname}`;
  newGame();
}

function newGame() {
  if (!state.nickname) {
    startScreenElement.hidden = false;
    gameAreaElement.classList.add("waiting");
    nicknameElement.focus();
    return;
  }
  const setting = difficultySettings[difficultyElement.value];
  state.finished = true;
  state.started = false;
  clearInterval(state.timerId);
  dialogElement.hidden = true;
  startScreenElement.hidden = true;
  gameAreaElement.classList.remove("waiting");
  setStatus("正在准备今日题目…");
  $("#new-game").disabled = true;
  setTimeout(() => {
    try {
      state.dateKey = shanghaiDateKey();
      state.puzzleId = `v1-${state.dateKey}-${difficultyElement.value}`;
      const generated = makePuzzle(setting.holes, state.puzzleId);
      state.puzzle = generated.puzzle;
      state.current = [...generated.puzzle];
      state.solution = generated.solution;
      state.selected = -1;
      state.mistakes.clear();
      state.hints.clear();
      state.errorCount = 0;
      state.hintCount = 0;
      state.finished = false;
      state.started = true;
      renderBoard();
      startTimer();
      setStatus(`${setting.label}难度 · 今日同题 · 加油！`, "success-text");
      $("#ranking-subtitle").textContent = `${state.dateKey} · ${setting.label}难度`;
      loadLeaderboard();
    } catch (error) {
      console.error(error);
      setStatus("题目生成失败，请点击“重新开始”重试。", "error-text");
    } finally {
      $("#new-game").disabled = false;
    }
  }, 30);
}

function showRanking() {
  rankingDialogElement.hidden = false;
  loadLeaderboard(false);
}

for (let number = 1; number <= 9; number += 1) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = number;
  button.setAttribute("aria-label", `填写数字 ${number}`);
  button.addEventListener("click", () => enterNumber(number));
  $("#number-pad").appendChild(button);
}

$("#new-game").addEventListener("click", newGame);
$("#start-game").addEventListener("click", startGame);
$("#play-again").addEventListener("click", newGame);
$("#check").addEventListener("click", checkBoard);
$("#hint").addEventListener("click", giveHint);
$("#erase").addEventListener("click", () => enterNumber(0));
$("#show-ranking").addEventListener("click", showRanking);
$("#dialog-ranking").addEventListener("click", showRanking);
$("#close-ranking").addEventListener("click", () => { rankingDialogElement.hidden = true; });
$("#player-button").addEventListener("click", () => {
  state.nickname = "";
  nicknameElement.value = localStorage.getItem("sudokuNickname") || "";
  startScreenElement.hidden = false;
  gameAreaElement.classList.add("waiting");
  clearInterval(state.timerId);
  nicknameElement.focus();
});
difficultyElement.addEventListener("change", () => { if (state.started) newGame(); });
nicknameElement.addEventListener("keydown", (event) => { if (event.key === "Enter") startGame(); });
rankingDialogElement.addEventListener("click", (event) => { if (event.target === rankingDialogElement) rankingDialogElement.hidden = true; });

document.addEventListener("keydown", (event) => {
  if (/^[1-9]$/.test(event.key)) enterNumber(Number(event.key));
  if (["Backspace", "Delete", "0"].includes(event.key)) enterNumber(0);
  if (state.selected < 0) return;
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (!(event.key in moves)) return;
  event.preventDefault();
  const next = state.selected + moves[event.key];
  if (next >= 0 && next < 81 && !(event.key === "ArrowLeft" && state.selected % 9 === 0) && !(event.key === "ArrowRight" && state.selected % 9 === 8)) selectCell(next);
});

const savedNickname = localStorage.getItem("sudokuNickname") || "";
nicknameElement.value = savedNickname;
if (savedNickname) $("#player-button").textContent = `玩家：${savedNickname}`;
renderBoard();
