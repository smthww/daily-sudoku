"use strict";

const boardElement = document.querySelector("#board");
const statusElement = document.querySelector("#status");
const timerElement = document.querySelector("#timer");
const difficultyElement = document.querySelector("#difficulty");
const dialogElement = document.querySelector("#dialog");
const startScreenElement = document.querySelector("#start-screen");
const gameAreaElement = document.querySelector("#game-area");

const state = {
  puzzle: Array(81).fill(0),
  current: Array(81).fill(0),
  solution: Array(81).fill(0),
  selected: -1,
  mistakes: new Set(),
  hints: new Set(),
  seconds: 0,
  timerId: null,
  finished: false,
};

const difficultySettings = {
  easy: { holes: 36, label: "轻松" },
  medium: { holes: 45, label: "标准" },
  hard: { holes: 52, label: "挑战" },
};

function shuffled(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
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

// 选择候选数字最少的空格，能显著加快唯一解检测。
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

function fillBoard(board) {
  const { index, options } = bestEmptyCell(board);
  if (index === -1) return true;
  for (const number of shuffled(options)) {
    board[index] = number;
    if (fillBoard(board)) return true;
    board[index] = 0;
  }
  return false;
}

// 最多数到 2：发现第二个解后就无需继续搜索。
function countSolutions(board, limit = 2) {
  let count = 0;

  function search() {
    if (count >= limit) return;
    const { index, options } = bestEmptyCell(board);
    if (index === -1) {
      count += 1;
      return;
    }
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

function makePuzzle(holeTarget) {
  let best = null;

  // 高难度可能需要几套终盘，保留挖空数最多的一套作为兜底。
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const solution = Array(81).fill(0);
    fillBoard(solution);
    const puzzle = [...solution];
    let holes = 0;

    for (const index of shuffled([...Array(81).keys()])) {
      const saved = puzzle[index];
      puzzle[index] = 0;
      if (countSolutions([...puzzle]) === 1) {
        holes += 1;
      } else {
        puzzle[index] = saved;
      }
      if (holes >= holeTarget) break;
    }

    if (!best || holes > best.holes) best = { puzzle, solution, holes };
    if (holes >= holeTarget) break;
  }

  // 最终再独立验证一次；这里若失败说明生成器本身出现了错误。
  if (countSolutions([...best.puzzle]) !== 1) {
    throw new Error("题目未通过唯一解检测");
  }
  return best;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function startTimer() {
  clearInterval(state.timerId);
  state.seconds = 0;
  timerElement.textContent = "00:00";
  state.timerId = setInterval(() => {
    if (!state.finished) {
      state.seconds += 1;
      timerElement.textContent = formatTime(state.seconds);
    }
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
      (Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(column / 3) === Math.floor(selectedColumn / 3)))) {
      button.classList.add("related");
    }
    if (value && selectedValue === value) button.classList.add("same");
    if (state.mistakes.has(index)) button.classList.add("error");
    if (state.hints.has(index)) button.classList.add("hint");
    button.addEventListener("click", () => selectCell(index));
    boardElement.appendChild(button);
  });
}

function selectCell(index) {
  if (state.finished) return;
  state.selected = index;
  renderBoard();
}

function enterNumber(number) {
  const index = state.selected;
  if (index < 0 || state.puzzle[index] || state.finished) return;
  state.current[index] = number;
  state.mistakes.delete(index);
  state.hints.delete(index);
  setStatus("继续加油。每行、每列和每个九宫格都不能重复。 ");
  renderBoard();
  if (state.current.every(Boolean)) checkBoard();
}

function checkBoard() {
  state.mistakes.clear();
  state.current.forEach((value, index) => {
    if (value && value !== state.solution[index]) state.mistakes.add(index);
  });

  if (state.mistakes.size) {
    setStatus(`发现 ${state.mistakes.size} 个不正确的数字，已为你标出。`, "error-text");
    renderBoard();
    return;
  }
  if (state.current.some((value) => value === 0)) {
    setStatus("目前填写的数字都正确，还有空格未完成。", "success-text");
    renderBoard();
    return;
  }

  state.finished = true;
  clearInterval(state.timerId);
  setStatus("恭喜完成！", "success-text");
  document.querySelector("#dialog-message").textContent = `本局用时 ${formatTime(state.seconds)}。`;
  dialogElement.hidden = false;
}

function giveHint() {
  if (state.finished) return;
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
  setStatus("已填入一个提示数字。", "success-text");
  renderBoard();
}

function newGame() {
  const setting = difficultySettings[difficultyElement.value];
  state.finished = true;
  clearInterval(state.timerId);
  dialogElement.hidden = true;
  startScreenElement.hidden = true;
  gameAreaElement.classList.remove("waiting");
  setStatus("正在生成题目…");
  document.querySelector("#new-game").disabled = true;

  // 先让浏览器绘制状态文字，再执行计算。
  setTimeout(() => {
    try {
      const generated = makePuzzle(setting.holes);
      state.puzzle = generated.puzzle;
      state.current = [...generated.puzzle];
      state.solution = generated.solution;
      state.selected = -1;
      state.mistakes.clear();
      state.hints.clear();
      state.finished = false;
      renderBoard();
      startTimer();
      setStatus(`${setting.label}难度 · 已挖空 ${generated.holes} 格`, "success-text");
    } catch (error) {
      console.error(error);
      setStatus("题目生成失败，请点击“生成新题”重试。", "error-text");
    } finally {
      document.querySelector("#new-game").disabled = false;
    }
  }, 30);
}

for (let number = 1; number <= 9; number += 1) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = number;
  button.setAttribute("aria-label", `填写数字 ${number}`);
  button.addEventListener("click", () => enterNumber(number));
  document.querySelector("#number-pad").appendChild(button);
}

document.querySelector("#new-game").addEventListener("click", newGame);
document.querySelector("#start-game").addEventListener("click", newGame);
document.querySelector("#play-again").addEventListener("click", newGame);
document.querySelector("#check").addEventListener("click", checkBoard);
document.querySelector("#hint").addEventListener("click", giveHint);
document.querySelector("#erase").addEventListener("click", () => enterNumber(0));

document.addEventListener("keydown", (event) => {
  if (/^[1-9]$/.test(event.key)) enterNumber(Number(event.key));
  if (["Backspace", "Delete", "0"].includes(event.key)) enterNumber(0);
  if (state.selected < 0) return;
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (!(event.key in moves)) return;
  event.preventDefault();
  const next = state.selected + moves[event.key];
  if (next >= 0 && next < 81 && !(event.key === "ArrowLeft" && state.selected % 9 === 0) && !(event.key === "ArrowRight" && state.selected % 9 === 8)) {
    selectCell(next);
  }
});

renderBoard();
