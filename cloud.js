"use strict";

(function createSudokuCloud() {
  const ENV_ID = "daily-sudoku-d3g3cccua4adfaf16";
  const COLLECTION = "scores";
  let app = null;
  let database = null;
  let userId = "";
  let readyPromise = null;

  async function initialize() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      if (!window.cloudbase) throw new Error("CloudBase SDK 未加载");
      app = window.cloudbase.init({ env: ENV_ID, region: "ap-shanghai" });
      const auth = app.auth();
      let loginState = await auth.getLoginState();
      if (!loginState) {
        await auth.signInAnonymously();
        loginState = await auth.getLoginState();
      }
      if (!loginState?.user?.uid) throw new Error("匿名登录失败");
      userId = loginState.user.uid;
      database = app.database();
      return true;
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
    return readyPromise;
  }

  async function saveScore(score) {
    await initialize();
    return database.collection(COLLECTION).add({
      ...score,
      kind: "score",
      userId,
      createdAt: new Date().toISOString(),
    });
  }

  async function getLeaderboard(puzzleId) {
    await initialize();
    const result = await database.collection(COLLECTION)
      .where({ puzzleId, kind: "score" })
      .limit(100)
      .get();
    return Array.isArray(result?.data) ? result.data : [];
  }

  window.sudokuCloud = {
    initialize,
    saveScore,
    getLeaderboard,
    getUserId: () => userId,
  };
})();
