(function () {
  "use strict";

  var DATA = window.ZHONGJIAN_HEXAGRAMS;
  var HISTORY_KEY = "zhongjian_liuyao_minitool_history_v1";
  var state = { question: "", throws: [], result: null };
  var views = ["question", "throw", "result", "history"];

  function byId(id) { return document.getElementById(id); }
  function showView(name) {
    views.forEach(function (viewName) {
      byId(viewName + "-view").classList.toggle("is-active", viewName === name);
    });
    window.scrollTo(0, 0);
  }
  function isYang(value) { return value === 7 || value === 9; }
  function isMoving(value) { return value === 6 || value === 9; }
  function changedIsYang(value) { return isMoving(value) ? !isYang(value) : isYang(value); }
  function lineName(position) { return ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"][position - 1]; }

  function randomCoin() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      var randomByte = new Uint8Array(1);
      window.crypto.getRandomValues(randomByte);
      return randomByte[0] < 128 ? 1 : 0;
    }
    return Math.random() < 0.5 ? 1 : 0;
  }

  function tossLine() {
    var coins = [randomCoin(), randomCoin(), randomCoin()];
    var value = coins.reduce(function (sum, coin) { return sum + (coin ? 3 : 2); }, 0);
    return { coins: coins, value: value };
  }

  function calculateResult() {
    var values = state.throws.map(function (item) { return item.value; });
    var originalBits = values.map(function (value) { return isYang(value) ? "1" : "0"; }).join("");
    var changedBits = values.map(function (value) { return changedIsYang(value) ? "1" : "0"; }).join("");
    var moving = [];
    values.forEach(function (value, index) { if (isMoving(value)) moving.push(index + 1); });
    state.result = {
      values: values,
      originalBits: originalBits,
      changedBits: changedBits,
      moving: moving,
      original: DATA.hexagrams[originalBits],
      changed: DATA.hexagrams[changedBits]
    };
  }

  function lineLabel(value) {
    if (value === 6) return "老阴（动）";
    if (value === 7) return "少阳";
    if (value === 8) return "少阴";
    return "老阳（动）";
  }

  function makeLine(value, className) {
    var line = document.createElement("div");
    line.className = className + " " + (isYang(value) ? "is-yang" : "is-yin") + (isMoving(value) ? " is-moving" : "");
    return line;
  }

  function renderThrowState() {
    var count = state.throws.length;
    byId("throw-count").textContent = count < 6 ? "第 " + (count + 1) + " / 6 爻" : "六爻已成";
    byId("throw-once").textContent = count < 6 ? "投第 " + (count + 1) + " 爻" : "查看卦象";
    var stack = byId("line-stack");
    stack.textContent = "";
    state.throws.slice().reverse().forEach(function (item) { stack.appendChild(makeLine(item.value, "mini-line")); });
  }

  function animateCoins(result, callback) {
    var group = document.querySelector(".coins");
    var coins = document.querySelectorAll(".coin");
    group.classList.add("is-tossing");
    window.setTimeout(function () {
      result.coins.forEach(function (coin, index) { coins[index].classList.toggle("is-back", coin === 0); });
      group.classList.remove("is-tossing");
      callback();
    }, 560);
  }

  function finishCasting() {
    calculateResult();
    saveHistory();
    renderResult();
    showView("result");
  }

  function handleThrowOnce() {
    if (state.throws.length >= 6) { finishCasting(); return; }
    var result = tossLine();
    byId("throw-once").disabled = true;
    animateCoins(result, function () {
      state.throws.push(result);
      byId("line-result").textContent = "第 " + state.throws.length + " 爻 · " + lineLabel(result.value);
      byId("throw-once").disabled = false;
      renderThrowState();
      if (state.throws.length === 6) window.setTimeout(finishCasting, 450);
    });
  }

  function handleThrowAll() {
    state.throws = [];
    for (var i = 0; i < 6; i += 1) state.throws.push(tossLine());
    byId("line-result").textContent = "六爻已成";
    renderThrowState();
    window.setTimeout(finishCasting, 250);
  }

  function appendHexagramLines(container, values, changed) {
    container.textContent = "";
    values.slice().reverse().forEach(function (value) {
      var shown = changed ? (changedIsYang(value) ? 7 : 8) : value;
      container.appendChild(makeLine(shown, "hex-line"));
    });
  }

  function renderResult() {
    var result = state.result;
    if (!result || !result.original || !result.changed) return;
    var hasChange = result.originalBits !== result.changedBits;
    byId("result-question").textContent = "所问：" + state.question;
    appendHexagramLines(byId("original-lines"), result.values, false);
    appendHexagramLines(byId("changed-lines"), result.values, true);
    byId("original-name").textContent = result.original.name;
    byId("changed-name").textContent = result.changed.name;
    byId("changed-column").classList.toggle("is-hidden", !hasChange);
    byId("change-arrow").classList.toggle("is-hidden", !hasChange);
    byId("moving-lines").textContent = result.moving.length ? "动爻：" + result.moving.map(lineName).join("、") : "本卦无动爻";
    byId("gua-ci").textContent = result.original.gua_ci;
    byId("xiang-yue").textContent = result.original.xiang_yue;

    var yaoList = byId("yao-ci-list");
    yaoList.textContent = "";
    result.moving.forEach(function (position) {
      var p = document.createElement("p");
      p.className = "yao-item";
      p.textContent = result.original.yao_ci[String(position)] || "";
      yaoList.appendChild(p);
    });

    byId("changed-classic").classList.toggle("is-hidden", !hasChange);
    if (hasChange) {
      byId("changed-gua-ci").textContent = result.changed.gua_ci;
      byId("changed-xiang-yue").textContent = result.changed.xiang_yue;
    }

    var prompt = "本次得“" + result.original.name + "”。卦辞曰：“" + result.original.gua_ci + "”象曰：“" + result.original.xiang_yue + "”";
    if (result.moving.length) {
      prompt += "本次有" + result.moving.map(lineName).join("、") + "发动，可先结合对应爻辞观察事情正在变化的部分，再参考变卦“" + result.changed.name + "”理解后续趋势。";
    } else {
      prompt += "本卦无动爻，可将注意力放在本卦整体处境与当下可行的行动上。";
    }
    prompt += "请结合实际情况独立判断，不以卦象替代医疗、法律、投资或其他专业建议。";
    byId("offline-reading").textContent = prompt;
    byId("bridge-status").textContent = "";
  }

  function readHistory() {
    try {
      var parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveHistory() {
    var entries = readHistory();
    entries.unshift({ id: String(Date.now()), createdAt: new Date().toISOString(), question: state.question, values: state.result.values, originalBits: state.result.originalBits });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 30)));
  }

  function restoreHistory(entry) {
    state.question = entry.question;
    state.throws = entry.values.map(function (value) { return { coins: [0, 0, 0], value: value }; });
    calculateResult();
    renderResult();
    showView("result");
  }

  function formatDate(iso) {
    var date = new Date(iso);
    function two(value) { return String(value).padStart(2, "0"); }
    return date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate()) + " " + two(date.getHours()) + ":" + two(date.getMinutes());
  }

  function renderHistory() {
    var list = byId("history-list");
    var entries = readHistory();
    list.textContent = "";
    if (!entries.length) {
      var empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "暂无卦录";
      list.appendChild(empty);
      return;
    }
    entries.forEach(function (entry) {
      var item = document.createElement("article");
      item.className = "history-item";
      var button = document.createElement("button");
      button.type = "button";
      var title = document.createElement("h3");
      var info = DATA.hexagrams[entry.originalBits];
      title.textContent = info ? info.name : "卦象记录";
      var question = document.createElement("p");
      question.textContent = entry.question;
      var date = document.createElement("p");
      date.textContent = formatDate(entry.createdAt);
      button.appendChild(title);
      button.appendChild(question);
      button.appendChild(date);
      button.addEventListener("click", function () { restoreHistory(entry); });
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    var line = "";
    var lines = [];
    String(text).split("").forEach(function (char) {
      var test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = char; }
      else line = test;
    });
    if (line) lines.push(line);
    lines.forEach(function (item, index) { ctx.fillText(item, x, y + index * lineHeight); });
    return y + lines.length * lineHeight;
  }

  function makeResultImage() {
    var result = state.result;
    var canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 2400;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d7bd79";
    ctx.lineWidth = 3;
    ctx.strokeRect(54, 54, 972, 2292);
    ctx.textAlign = "center";
    ctx.fillStyle = "#8b650f";
    ctx.font = "48px serif";
    ctx.fillText("众见六爻", 540, 135);
    ctx.fillStyle = "#3d3023";
    ctx.font = "58px serif";
    ctx.fillText(result.original.name + (result.originalBits !== result.changedBits ? "　→　" + result.changed.name : ""), 540, 250);
    ctx.font = "30px serif";
    ctx.fillStyle = "#796548";
    var y = drawWrappedText(ctx, "所问：" + state.question, 540, 340, 850, 48) + 30;
    ctx.textAlign = "left";
    ctx.fillStyle = "#9a7114";
    ctx.font = "30px serif";
    ctx.fillText("卦辞", 120, y);
    y += 52;
    ctx.fillStyle = "#3d3023";
    ctx.font = "34px serif";
    y = drawWrappedText(ctx, result.original.gua_ci, 120, y, 840, 54) + 44;
    ctx.fillStyle = "#9a7114";
    ctx.font = "30px serif";
    ctx.fillText("象曰", 120, y);
    y += 52;
    ctx.fillStyle = "#3d3023";
    ctx.font = "34px serif";
    y = drawWrappedText(ctx, result.original.xiang_yue, 120, y, 840, 54) + 44;
    if (result.moving.length) {
      ctx.fillStyle = "#9a7114";
      ctx.font = "30px serif";
      ctx.fillText("动爻", 120, y);
      y += 52;
      ctx.fillStyle = "#3d3023";
      ctx.font = "32px serif";
      result.moving.forEach(function (position) {
        y = drawWrappedText(ctx, result.original.yao_ci[String(position)] || "", 120, y, 840, 50) + 18;
      });
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#9a8a73";
    ctx.font = "24px serif";
    ctx.fillText("《周易》文化研究与娱乐参考 · 请结合实际独立判断", 540, 2280);
    return canvas.toDataURL("image/png");
  }

  function getBridge() { return window.xhs && window.xhs.miniTool ? window.xhs.miniTool : null; }

  async function saveImage() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.writeTempFile !== "function" || typeof bridge.saveImageToPhotosAlbum !== "function") {
      byId("bridge-status").textContent = "请在小红书小工具真机环境中使用保存功能；当前环境可直接截屏保存。";
      return;
    }
    byId("bridge-status").textContent = "正在生成图片……";
    try {
      var temp = await bridge.writeTempFile({ data: makeResultImage() });
      await bridge.saveImageToPhotosAlbum({ filePath: temp.filePath });
      byId("bridge-status").textContent = "已保存到系统相册";
    } catch (error) {
      byId("bridge-status").textContent = "保存失败，请检查相册权限后重试。";
    }
  }

  async function postNote() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.postNote !== "function") {
      byId("bridge-status").textContent = "请在小红书小工具真机环境中使用发布功能。";
      return;
    }
    byId("bridge-status").textContent = "正在准备笔记……";
    try {
      await bridge.postNote({
        title: "我的众见六爻卦象",
        content: "本次得“" + state.result.original.name + "”。仅供《周易》文化研究与娱乐参考。",
        pageType: "photo_publish",
        mediaInfo: { image_resources: [{ url: makeResultImage() }] },
        tags: "众见六爻"
      });
      byId("bridge-status").textContent = "已打开笔记发布页";
    } catch (error) {
      byId("bridge-status").textContent = "打开发布页失败，请稍后重试。";
    }
  }

  function beginQuestion() {
    var question = byId("question").value.trim();
    if (question.length < 4) {
      byId("question-error").textContent = question ? "问题至少需要四个字" : "请先写下您的问题";
      return;
    }
    state.question = question;
    state.throws = [];
    state.result = null;
    byId("current-question").textContent = question;
    byId("line-result").textContent = "点击下方按钮开始投掷";
    renderThrowState();
    showView("throw");
  }

  function bindEvents() {
    byId("question").addEventListener("input", function (event) {
      byId("question-count").textContent = String(event.target.value.length);
      byId("question-error").textContent = "";
    });
    byId("start-button").addEventListener("click", beginQuestion);
    byId("throw-once").addEventListener("click", handleThrowOnce);
    byId("throw-all").addEventListener("click", handleThrowAll);
    byId("throw-back").addEventListener("click", function () { showView("question"); });
    byId("result-back").addEventListener("click", function () { showView("question"); });
    byId("history-button").addEventListener("click", function () { renderHistory(); showView("history"); });
    byId("history-back").addEventListener("click", function () { showView("question"); });
    byId("clear-history").addEventListener("click", function () {
      if (confirm("确定清空当前小工具内的全部卦录吗？")) { localStorage.removeItem(HISTORY_KEY); renderHistory(); }
    });
    byId("save-image").addEventListener("click", saveImage);
    byId("post-note").addEventListener("click", postNote);
  }

  if (!DATA || !DATA.hexagrams) {
    document.body.textContent = "卦象数据加载失败，请重新安装小工具。";
    return;
  }
  bindEvents();
}());
