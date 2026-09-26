"use strict";

const STORAGE_KEY = "pitch-note-v1";
const ASPECTS = [
  ["technique", "技術"],
  ["decision", "判断"],
  ["physical", "フィジカル"],
  ["mental", "メンタル"],
];
const ASPECT_KEYS = new Set(ASPECTS.map(([key]) => key));
const POSITIONS = ["GK", "DF", "MF", "FW"];
const KIND = { practice: "練習", match: "試合" };

const ui = {
  playerQuery: "",
  position: "all",
  sessionQuery: "",
  kind: "all",
};

let editingPlayerId = null;
let toastTimer = 0;

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (tag === "button" && props.type == null) node.type = "button";
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "dataset") {
      for (const [name, dataValue] of Object.entries(value)) {
        if (dataValue != null && dataValue !== "") node.dataset[name] = String(dataValue);
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "checked" || key === "selected") {
      node[key] = true;
    } else if (key === "value") {
      node.setAttribute("value", String(value));
      if (tag === "input" || tag === "textarea" || tag === "select") node.value = String(value);
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function asText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) return null;
  return number;
}

function normalizePlayer(raw) {
  const name = asText(raw?.name, 40);
  if (!name) return null;
  const position = POSITIONS.includes(raw?.position) ? raw.position : "";
  return {
    id: asText(raw?.id, 80) || uid(),
    name,
    number: normalizeNumber(raw?.number),
    position,
    trait: asText(raw?.trait, 80),
    createdAt: asText(raw?.createdAt, 40) || new Date().toISOString(),
    updatedAt: asText(raw?.updatedAt, 40) || new Date().toISOString(),
  };
}

function normalizeEntry(raw) {
  const playerId = asText(raw?.playerId, 80);
  if (!playerId) return null;
  const aspects = Array.isArray(raw?.aspects)
    ? [...new Set(raw.aspects.map((item) => String(item)).filter((item) => ASPECT_KEYS.has(item)))]
    : [];
  return {
    id: asText(raw?.id, 80) || uid(),
    playerId,
    aspects,
    good: asText(raw?.good, 2000),
    bad: asText(raw?.bad, 2000),
    next: asText(raw?.next, 2000),
  };
}

function normalizeSession(raw) {
  const date = String(raw?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const entries = Array.isArray(raw?.entries) ? raw.entries.map(normalizeEntry).filter(Boolean) : [];
  if (!entries.length) return null;
  return {
    id: asText(raw?.id, 80) || uid(),
    date,
    kind: raw?.kind === "match" ? "match" : "practice",
    title: asText(raw?.title, 80),
    entries,
    createdAt: asText(raw?.createdAt, 40) || new Date().toISOString(),
    updatedAt: asText(raw?.updatedAt, 40) || new Date().toISOString(),
  };
}

function dedupe(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function normalizeState(data) {
  const players = dedupe(Array.isArray(data?.players) ? data.players.map(normalizePlayer).filter(Boolean) : []);
  const sessions = dedupe(Array.isArray(data?.sessions) ? data.sessions.map(normalizeSession).filter(Boolean) : []);
  return { players, sessions };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { players: [], sessions: [] };
    return normalizeState(JSON.parse(raw));
  } catch {
    return { players: [], sessions: [] };
  }
}

const state = load();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      players: state.players,
      sessions: state.sessions,
    }));
  } catch {
    toast("保存に失敗しました。ブラウザの保存容量を確認してください。");
  }
}

function todayISO() {
  const date = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(iso) {
  const [year, month, day] = String(iso).split("-");
  if (!year || !month || !day) return iso;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function playerLabel(player) {
  return player.number == null ? player.name : `${player.number} ${player.name}`;
}

function sessionTitle(session) {
  return session.title || KIND[session.kind];
}

function aspectLabel(key) {
  return ASPECTS.find(([aspect]) => aspect === key)?.[1] || key;
}

function clip(text, limit = 72) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

function comparePlayers(a, b) {
  const aNumber = a.number == null ? 1000 : a.number;
  const bNumber = b.number == null ? 1000 : b.number;
  if (aNumber !== bNumber) return aNumber - bNumber;
  return a.name.localeCompare(b.name, "ja");
}

function playerById(id) {
  return state.players.find((player) => player.id === id) || null;
}

function sortedPlayers() {
  return [...state.players].sort(comparePlayers);
}

function sortedSessions() {
  return [...state.sessions].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate) return byDate;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

function countFor(playerId) {
  return state.sessions.reduce((total, session) => (
    total + session.entries.filter((entry) => entry.playerId === playerId).length
  ), 0);
}

function latestFor(playerId) {
  let best = null;
  for (const session of state.sessions) {
    for (const entry of session.entries) {
      if (entry.playerId !== playerId) continue;
      const candidate = { session, entry };
      if (!best || session.date > best.session.date || (session.date === best.session.date && (session.createdAt || "") > (best.session.createdAt || ""))) {
        best = candidate;
      }
    }
  }
  return best;
}

function notesFor(playerId) {
  const rows = [];
  for (const session of sortedSessions()) {
    for (const entry of session.entries) {
      if (entry.playerId === playerId) rows.push({ session, entry });
    }
  }
  return rows;
}

function filteredPlayers() {
  const query = ui.playerQuery.trim().toLowerCase();
  return sortedPlayers().filter((player) => {
    if (ui.position !== "all" && player.position !== ui.position) return false;
    if (!query) return true;
    return `${player.name} ${player.trait} ${player.number ?? ""}`.toLowerCase().includes(query);
  });
}

function filteredSessions() {
  const query = ui.sessionQuery.trim().toLowerCase();
  return sortedSessions().filter((session) => {
    if (ui.kind !== "all" && session.kind !== ui.kind) return false;
    if (!query) return true;
    const names = session.entries.map((entry) => playerById(entry.playerId)?.name || "").join(" ");
    const text = [session.title, names, ...session.entries.flatMap((entry) => [entry.good, entry.bad, entry.next])].join(" ");
    return text.toLowerCase().includes(query);
  });
}

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2400);
}

function confirmDialog(message, okLabel = "削除する") {
  const dialog = document.querySelector("#confirm-dialog");
  document.querySelector("#confirm-message").textContent = message;
  document.querySelector("#confirm-ok").textContent = okLabel;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "ok");
    }, { once: true });
    dialog.showModal();
  });
}

function parseRoute() {
  const raw = (location.hash || "#/players").replace(/^#/, "");
  const queryIndex = raw.indexOf("?");
  const path = (queryIndex === -1 ? raw : raw.slice(0, queryIndex)) || "/";
  const params = new URLSearchParams(queryIndex === -1 ? "" : raw.slice(queryIndex + 1));
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "players" && parts[1]) return { name: "player", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "sessions" && parts[1] === "new") {
    return { name: "form", sessionId: null, presetPlayerId: params.get("player") };
  }
  if (parts[0] === "sessions" && parts[1] && parts[2] === "edit") {
    return { name: "form", sessionId: decodeURIComponent(parts[1]), presetPlayerId: null };
  }
  if (parts[0] === "sessions") return { name: "sessions" };
  return { name: "players" };
}

function navKey(name) {
  if (name === "player") return "players";
  if (name === "form") return "form";
  return name;
}

function emptyBox(title, body, actions) {
  return h("div", { class: "empty" },
    h("div", { class: "empty-mark", "aria-hidden": "true" }),
    h("h2", {}, title),
    h("p", {}, body),
    h("div", { class: "empty-actions" }, actions),
  );
}

function openPlayerDialog(player) {
  const current = player && typeof player.id === "string" ? player : null;
  editingPlayerId = current ? current.id : null;
  const dialog = document.querySelector("#player-dialog");
  const form = document.querySelector("#player-form");
  document.querySelector("#player-dialog-title").textContent = current ? "選手を編集" : "選手を追加";
  form.elements.name.value = current?.name ?? "";
  form.elements.number.value = current?.number ?? "";
  form.elements.position.value = current?.position || "";
  form.elements.trait.value = current?.trait ?? "";
  dialog.showModal();
  form.elements.name.focus();
}

function onPlayerSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = editingPlayerId;
  const name = form.elements.name.value.trim();
  if (!name) {
    toast("名前を入力してください");
    form.elements.name.focus();
    return;
  }
  const rawNumber = form.elements.number.value.trim();
  let number = null;
  if (rawNumber) {
    if (!/^\d{1,2}$/.test(rawNumber) || Number(rawNumber) > 99) {
      toast("背番号は0から99で入力してください");
      form.elements.number.focus();
      return;
    }
    number = Number(rawNumber);
  }
  const fields = {
    name: name.slice(0, 40),
    number,
    position: POSITIONS.includes(form.elements.position.value) ? form.elements.position.value : "",
    trait: form.elements.trait.value.trim().slice(0, 80),
    updatedAt: new Date().toISOString(),
  };
  if (id) {
    const player = playerById(id);
    if (player) Object.assign(player, fields);
  } else {
    state.players.push({ id: uid(), ...fields, createdAt: fields.updatedAt });
  }
  document.querySelector("#player-dialog").close();
  persist();
  const sessionForm = document.querySelector("#session-form");
  if (sessionForm) syncPlayerSelects(sessionForm);
  else render();
  toast("保存しました");
}

async function onDeletePlayer(player) {
  const ok = await confirmDialog(`${player.name}さんと、その選手の記録を削除しますか？`);
  if (!ok) return;
  state.players = state.players.filter((item) => item.id !== player.id);
  state.sessions = state.sessions
    .map((session) => ({
      ...session,
      entries: session.entries.filter((entry) => entry.playerId !== player.id),
    }))
    .filter((session) => session.entries.length > 0);
  persist();
  toast("削除しました");
  location.hash = "#/players";
}

async function onDeleteSession(id) {
  const ok = await confirmDialog("この記録を削除しますか？");
  if (!ok) return;
  state.sessions = state.sessions.filter((session) => session.id !== id);
  persist();
  toast("削除しました");
  if (parseRoute().name === "sessions") render();
  else location.hash = "#/sessions";
}

function insertExample() {
  if (state.players.length || state.sessions.length) return;
  const now = new Date().toISOString();
  const yamada = uid();
  const sato = uid();
  state.players.push(
    { id: yamada, name: "山田", number: 10, position: "FW", trait: "右サイドからの仕掛け", createdAt: now, updatedAt: now },
    { id: sato, name: "佐藤", number: 1, position: "GK", trait: "フィードが武器", createdAt: now, updatedAt: now },
  );
  state.sessions.push({
    id: uid(),
    date: todayISO(),
    kind: "practice",
    title: "シュート練習",
    createdAt: now,
    updatedAt: now,
    entries: [
      {
        id: uid(),
        playerId: yamada,
        aspects: ["technique", "decision"],
        good: "ゴール前で一度顔を上げて、ニアへのシュートを選べていた。",
        bad: "失ったあとボールを見すぎて、マークへの戻りが遅れた。",
        next: "失った瞬間に、近い相手の背中を見て戻る。",
      },
      {
        id: uid(),
        playerId: sato,
        aspects: ["technique"],
        good: "クロスに対して、早いタイミングで飛び出せていた。",
        bad: "フィードで、味方が受ける前に蹴ってしまうことがあった。",
        next: "受ける人の顔を見てから足を出す。",
      },
    ],
  });
  persist();
  toast("記入例を入れました。不要なら削除できます。");
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    version: 1,
    players: state.players,
    sessions: state.sessions,
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pitch-note-${todayISO()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  document.querySelector(".data-menu").removeAttribute("open");
  toast("書き出しました");
}

async function importData(event) {
  const input = event.currentTarget;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  try {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || !Array.isArray(data.players) || !Array.isArray(data.sessions)) {
      toast("このアプリの書き出しファイルを選んでください");
      return;
    }
    const next = normalizeState(data);
    const ok = await confirmDialog("現在のデータを、ファイルの内容に置き換えますか？", "置き換える");
    if (!ok) return;
    state.players = next.players;
    state.sessions = next.sessions;
    persist();
    document.querySelector(".data-menu").removeAttribute("open");
    toast("読み込みました");
    if (location.hash === "#/players") render();
    else location.hash = "#/players";
  } catch {
    toast("ファイルを読み込めませんでした");
  }
}

function filterBar(items, attr, current, label, onPick) {
  return h("div", { class: "filters", role: "group", "aria-label": label },
    ...items.map(([value, text]) => h("button", {
      type: "button",
      class: "filter-chip",
      [attr]: value,
      "aria-pressed": current === value ? "true" : "false",
      onClick() {
        onPick(value);
        this.parentElement.querySelectorAll(".filter-chip").forEach((button) => {
          button.setAttribute("aria-pressed", String(button.getAttribute(attr) === value));
        });
      },
    }, text)),
  );
}

function playerCard(player) {
  const latest = latestFor(player.id);
  const summary = latest
    ? `${formatDate(latest.session.date)} ${latest.entry.good || latest.entry.bad || latest.entry.next || "記録あり"}`
    : "まだ記録がありません";
  return h("a", { class: "player-card", href: `#/players/${encodeURIComponent(player.id)}` },
    h("div", { class: "jersey sm", "aria-hidden": "true" }, player.number == null ? (player.position || "–") : String(player.number)),
    h("div", {},
      h("div", { class: "card-kicker" },
        h("span", { class: "pos" }, player.position || "未設定"),
        h("span", { class: "count" }, `${countFor(player.id)}件`),
      ),
      h("h2", {}, player.name),
      h("p", { class: latest ? "latest" : "latest muted" }, clip(summary, 64)),
      player.trait ? h("p", { class: "trait" }, player.trait) : null,
    ),
  );
}

function previewLine(kind, label, text) {
  if (!text) return null;
  return h("p", { class: `preview ${kind}` }, h("b", {}, label), clip(text, 64));
}

function sessionCard(session) {
  const [year, month, day] = session.date.split("-").map(Number);
  const card = h("article", { class: "session-card" },
    h("div", { class: "day" },
      h("span", { class: "sr-only" }, formatDate(session.date)),
      h("span", { "aria-hidden": "true" }, `${month}月`),
      h("b", { "aria-hidden": "true" }, String(day)),
      h("span", { "aria-hidden": "true" }, String(year)),
    ),
    h("div", {},
      h("div", { class: "title-row" },
        h("span", { class: `badge ${session.kind}` }, KIND[session.kind]),
        h("h3", {}, h("a", { href: `#/sessions/${encodeURIComponent(session.id)}/edit` }, sessionTitle(session))),
      ),
      ...session.entries.slice(0, 2).flatMap((entry) => {
        const player = playerById(entry.playerId);
        return [
          h("p", { class: "who" }, player ? playerLabel(player) : "選手"),
          previewLine("good", "良", entry.good),
          previewLine("bad", "悪", entry.bad),
        ];
      }),
      session.entries.length > 2 ? h("p", { class: "muted small" }, `ほか${session.entries.length - 2}人`) : null,
    ),
    h("div", { class: "card-actions" },
      h("button", {
        type: "button",
        class: "btn small danger",
        onClick(event) {
          event.stopPropagation();
          onDeleteSession(session.id);
        },
      }, "削除"),
    ),
  );
  card.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    location.hash = `#/sessions/${encodeURIComponent(session.id)}/edit`;
  });
  return card;
}

function noteBlock(kind, label, text) {
  if (!text) return null;
  return h("section", { class: `note ${kind}` }, h("h4", {}, label), h("p", {}, text));
}

function playerNote({ session, entry }, player) {
  const others = session.entries.filter((item) => item.playerId !== player.id).length;
  return h("article", { class: "note-card" },
    h("header", {},
      h("div", { class: "title-row" },
        h("time", { datetime: session.date }, formatDate(session.date)),
        h("span", { class: `badge ${session.kind}` }, KIND[session.kind]),
      ),
      h("a", { href: `#/sessions/${encodeURIComponent(session.id)}/edit` }, "編集"),
    ),
    h("h3", {}, sessionTitle(session)),
    entry.aspects.length
      ? h("div", { class: "chip-row" }, ...entry.aspects.map((aspect) => h("span", { class: "tag" }, aspectLabel(aspect))))
      : null,
    noteBlock("good", "良かったところ", entry.good),
    noteBlock("bad", "悪かったところ", entry.bad),
    noteBlock("next", "次に意識すること", entry.next),
    others ? h("p", { class: "muted small" }, `同じ記録にほか${others}人`) : null,
  );
}

function viewPlayers() {
  if (!state.players.length) {
    return h("section", { class: "page" },
      h("div", { class: "page-head" }, h("h2", {}, "選手")),
      emptyBox(
        "選手を登録しましょう",
        "名前とポジションを入れておくと、練習や試合のあとですぐメモできます。",
        [
          h("button", { type: "button", class: "btn primary", onClick: openPlayerDialog }, "選手を追加"),
          state.sessions.length ? null : h("button", { type: "button", class: "btn ghost", onClick: insertExample }, "記入例を見る"),
        ],
      ),
    );
  }
  const list = h("div", { class: "grid", id: "player-list" });
  const fill = () => {
    const players = filteredPlayers();
    list.className = players.length ? "grid" : "stack";
    list.replaceChildren(...(players.length ? players.map(playerCard) : [h("p", { class: "none" }, "一致する選手がいません")]));
  };
  const search = h("input", {
    class: "search",
    type: "search",
    placeholder: "名前で探す",
    "aria-label": "選手を検索",
    value: ui.playerQuery,
  });
  search.addEventListener("input", () => {
    ui.playerQuery = search.value;
    fill();
  });
  const page = h("section", { class: "page" },
    h("div", { class: "page-head" },
      h("div", {},
        h("h2", {}, "選手"),
        h("p", { class: "lead" }, "練習や試合で気になったことを、選手ごとに残します。"),
      ),
      h("button", { type: "button", class: "btn primary", onClick: openPlayerDialog }, "選手を追加"),
    ),
    h("div", { class: "toolbar" }, search),
    filterBar(
      [["all", "すべて"], ...POSITIONS.map((position) => [position, position])],
      "data-pos",
      ui.position,
      "ポジション",
      (value) => {
        ui.position = value;
        fill();
      },
    ),
    list,
  );
  fill();
  return page;
}

function viewPlayer(route) {
  const player = playerById(route.id);
  if (!player) {
    return h("section", { class: "page" }, emptyBox(
      "選手が見つかりません",
      "一覧から選手を選び直してください。",
      h("a", { class: "btn primary", href: "#/players" }, "選手一覧へ"),
    ));
  }
  const notes = notesFor(player.id);
  const page = h("section", { class: "page" });
  page.append(
    h("a", { class: "back", href: "#/players" }, "選手一覧へ"),
    h("header", { class: "player-head" },
      h("div", { class: "jersey" }, player.number == null ? (player.position || "–") : String(player.number)),
      h("div", {},
        h("h2", {}, player.name),
        h("p", { class: "muted" }, [player.position || "ポジション未設定", player.trait].filter(Boolean).join(" · ")),
        h("p", { class: "muted" }, `記録 ${notes.length}件`),
      ),
      h("div", { class: "row-actions" },
        h("a", { class: "btn primary", href: `#/sessions/new?player=${encodeURIComponent(player.id)}` }, "記録を書く"),
        h("button", { type: "button", class: "btn ghost", onClick: () => openPlayerDialog(player) }, "編集"),
        h("button", { type: "button", class: "btn danger", onClick: () => onDeletePlayer(player) }, "削除"),
      ),
    ),
  );
  if (!notes.length) {
    page.append(emptyBox(
      "まだこの選手の記録がありません",
      "練習や試合のあと、良かったところと悪かったところを残しましょう。",
      h("a", { class: "btn primary", href: `#/sessions/new?player=${encodeURIComponent(player.id)}` }, "記録を書く"),
    ));
    return page;
  }
  page.append(h("div", { class: "stack" }, ...notes.map((note) => playerNote(note, player))));
  return page;
}

function viewSessions() {
  if (!state.sessions.length) {
    return h("section", { class: "page" },
      h("div", { class: "page-head" }, h("h2", {}, "記録")),
      emptyBox(
        "まだ記録がありません",
        "練習や試合のあと、良かったところと悪かったところを残しておきましょう。",
        h("a", { class: "btn primary", href: "#/sessions/new" }, "記録を書く"),
      ),
    );
  }
  const list = h("div", { class: "stack", id: "session-list" });
  const fill = () => {
    const sessions = filteredSessions();
    list.replaceChildren(...(sessions.length ? sessions.map(sessionCard) : [h("p", { class: "none" }, "一致する記録がありません")]));
  };
  const search = h("input", {
    class: "search",
    type: "search",
    placeholder: "選手名・内容で探す",
    "aria-label": "記録を検索",
    value: ui.sessionQuery,
  });
  search.addEventListener("input", () => {
    ui.sessionQuery = search.value;
    fill();
  });
  const page = h("section", { class: "page" },
    h("div", { class: "page-head" },
      h("div", {},
        h("h2", {}, "記録"),
        h("p", { class: "lead" }, "練習と試合のメモを、日付の新しい順に見られます。"),
      ),
      h("a", { class: "btn primary", href: "#/sessions/new" }, "記録を書く"),
    ),
    h("div", { class: "toolbar" }, search),
    filterBar(
      [["all", "すべて"], ["practice", "練習"], ["match", "試合"]],
      "data-kind",
      ui.kind,
      "種類",
      (value) => {
        ui.kind = value;
        fill();
      },
    ),
    list,
  );
  fill();
  return page;
}

function playerOptionNodes(selected) {
  const nodes = [h("option", { value: "" }, "選手を選択")];
  for (const player of sortedPlayers()) {
    const option = h("option", { value: player.id }, playerLabel(player));
    if (player.id === selected) option.selected = true;
    nodes.push(option);
  }
  if (selected && !playerById(selected)) {
    const missing = h("option", { value: selected }, "（削除された選手）");
    missing.selected = true;
    nodes.push(missing);
  }
  return nodes;
}

function refreshPlayerOptions(form) {
  const selects = [...form.querySelectorAll(".entry-player")];
  const chosen = new Set(selects.map((select) => select.value).filter(Boolean));
  for (const select of selects) {
    for (const option of select.options) {
      option.disabled = Boolean(option.value) && option.value !== select.value && chosen.has(option.value);
    }
  }
}

function syncPlayerSelects(form) {
  form.querySelectorAll(".entry-player").forEach((select) => {
    const current = select.value;
    select.replaceChildren(...playerOptionNodes(current));
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });
  refreshPlayerOptions(form);
}

function clearEntry(row) {
  const select = row.querySelector(".entry-player");
  select.value = "";
  row.querySelectorAll("textarea").forEach((textarea) => {
    textarea.value = "";
  });
  row.querySelectorAll(".chip").forEach((chip) => chip.setAttribute("aria-pressed", "false"));
}

function entryRow(entry) {
  const row = h("article", { class: "entry" });
  if (entry.id) row.dataset.id = entry.id;
  const select = h("select", { class: "entry-player", "aria-label": "選手" }, ...playerOptionNodes(entry.playerId || ""));
  row.append(
    h("div", { class: "entry-top" },
      select,
      h("button", {
        type: "button",
        class: "btn small danger",
        onClick() {
          const form = row.closest("form");
          if (form.querySelectorAll(".entry").length === 1) {
            clearEntry(row);
            refreshPlayerOptions(form);
            return;
          }
          row.remove();
          refreshPlayerOptions(form);
        },
      }, "外す"),
    ),
    h("div", { class: "chip-row", role: "group", "aria-label": "観点" },
      ...ASPECTS.map(([key, label]) => h("button", {
        type: "button",
        class: "chip",
        "data-aspect": key,
        "aria-pressed": entry.aspects?.includes(key) ? "true" : "false",
        onClick() {
          const pressed = this.getAttribute("aria-pressed") === "true";
          this.setAttribute("aria-pressed", pressed ? "false" : "true");
        },
      }, label)),
    ),
    h("div", { class: "notes-3" },
      h("label", { class: "field" }, "良かったところ",
        h("textarea", {
          class: "good",
          maxlength: "2000",
          placeholder: "例: ゴール前で顔を上げて、ニアへのシュートを選べていた",
          value: entry.good || "",
        })),
      h("label", { class: "field" }, "悪かったところ",
        h("textarea", {
          class: "bad",
          maxlength: "2000",
          placeholder: "例: 失ったあとボールを見すぎて、マークが遅れた",
          value: entry.bad || "",
        })),
      h("label", { class: "field span-all" }, "次に意識すること",
        h("textarea", {
          class: "next",
          maxlength: "2000",
          placeholder: "例: 失った瞬間に、近い相手の背中を見て戻る",
          value: entry.next || "",
        })),
    ),
  );
  return row;
}

function readEntries(form) {
  const entries = [];
  for (const row of form.querySelectorAll(".entry")) {
    const playerId = row.querySelector(".entry-player").value;
    const good = row.querySelector(".good").value.trim();
    const bad = row.querySelector(".bad").value.trim();
    const next = row.querySelector(".next").value.trim();
    const aspects = [...row.querySelectorAll('.chip[aria-pressed="true"]')].map((chip) => chip.dataset.aspect);
    if (!playerId && !good && !bad && !next && !aspects.length) continue;
    if (!playerId || !playerById(playerId)) {
      toast("選手を選択してください");
      row.querySelector(".entry-player").focus();
      return null;
    }
    if (!good && !bad && !next) {
      toast("良かったところ、悪かったところ、次に意識することのいずれかを書いてください");
      row.querySelector(".good").focus();
      return null;
    }
    entries.push({
      id: row.dataset.id || uid(),
      playerId,
      aspects,
      good: good.slice(0, 2000),
      bad: bad.slice(0, 2000),
      next: next.slice(0, 2000),
    });
  }
  if (!entries.length) {
    toast("内容を入力してください");
    return null;
  }
  return entries;
}

function onSubmitSession(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const date = form.elements.date.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    toast("日付を入力してください");
    form.elements.date.focus();
    return;
  }
  const entries = readEntries(form);
  if (!entries) return;
  const now = new Date().toISOString();
  const payload = {
    date,
    kind: form.elements.kind.value === "match" ? "match" : "practice",
    title: form.elements.title.value.trim().slice(0, 80),
    entries,
    updatedAt: now,
  };
  const existing = form.dataset.sessionId ? state.sessions.find((session) => session.id === form.dataset.sessionId) : null;
  if (existing) Object.assign(existing, payload);
  else {
    state.sessions.push({ id: uid(), ...payload, createdAt: now });
  }
  persist();
  toast("保存しました");
  location.hash = "#/sessions";
}

function viewForm(route) {
  if (!state.players.length) {
    return h("section", { class: "page" },
      h("div", { class: "page-head" }, h("h2", {}, "記録を書く")),
      emptyBox(
        "先に選手を登録してください",
        "記録は選手ごとに残します。まずは選手を追加しましょう。",
        h("button", { type: "button", class: "btn primary", onClick: openPlayerDialog }, "選手を追加"),
      ),
    );
  }
  const session = route.sessionId ? state.sessions.find((item) => item.id === route.sessionId) : null;
  if (route.sessionId && !session) {
    return h("section", { class: "page" }, emptyBox("記録が見つかりません", "記録一覧から選び直してください。", h("a", { class: "btn primary", href: "#/sessions" }, "記録一覧へ")));
  }
  const preset = !session && playerById(route.presetPlayerId || "") ? route.presetPlayerId : "";
  const initial = session?.entries?.length
    ? session.entries
    : [{ playerId: preset, aspects: [], good: "", bad: "", next: "" }];
  const entries = h("div", { class: "stack" }, ...initial.map((entry) => entryRow(entry)));
  const form = h("form", { id: "session-form", class: "stack", autocomplete: "off" },
    h("label", { class: "field" }, "日付",
      h("input", { type: "date", name: "date", required: true, value: session?.date || todayISO() })),
    h("fieldset", { class: "segment-field" },
      h("legend", {}, "種類"),
      h("div", { class: "segment" },
        h("label", {}, h("input", { type: "radio", name: "kind", value: "practice", checked: session?.kind !== "match" }), "練習"),
        h("label", {}, h("input", { type: "radio", name: "kind", value: "match", checked: session?.kind === "match" }), "試合"),
      ),
    ),
    h("label", { class: "field" }, "タイトル（任意）",
      h("input", { name: "title", maxlength: "80", placeholder: "例: 紅白戦、対FC青葉、シュート練習", value: session?.title || "" })),
    h("h3", {}, "この日の選手"),
    entries,
    h("button", {
      type: "button",
      class: "btn ghost",
      onClick() {
        const row = entryRow({});
        entries.append(row);
        refreshPlayerOptions(form);
        row.querySelector("select").focus();
      },
    }, "もう一人書く"),
    h("div", { class: "form-actions" },
      h("a", { class: "btn ghost", href: "#/sessions" }, "キャンセル"),
      session ? h("button", { type: "button", class: "btn danger", onClick: () => onDeleteSession(session.id) }, "削除") : null,
      h("button", { type: "submit", class: "btn primary" }, "保存する"),
    ),
  );
  if (session) form.dataset.sessionId = session.id;
  form.addEventListener("change", (event) => {
    if (event.target.classList.contains("entry-player")) refreshPlayerOptions(form);
  });
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.tagName === "INPUT") event.preventDefault();
  });
  form.addEventListener("submit", onSubmitSession);
  refreshPlayerOptions(form);
  return h("section", { class: "page" },
    h("div", { class: "page-head" },
      h("div", {},
        h("h2", {}, session ? "記録を編集" : "記録を書く"),
        h("p", { class: "lead" }, "一人でも複数人でも、同じ練習・試合のメモとして残せます。"),
      ),
    ),
    form,
  );
}

function render() {
  const route = parseRoute();
  const key = navKey(route.name);
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === key;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const view = {
    players: viewPlayers,
    player: viewPlayer,
    sessions: viewSessions,
    form: viewForm,
  }[route.name];
  const page = view(route);
  document.querySelector("#main").replaceChildren(page);
  const heading = page.querySelector("h2");
  document.title = heading ? `${heading.textContent} · ピッチノート` : "ピッチノート";
  window.scrollTo(0, 0);
}

function init() {
  document.querySelector("#export-btn").addEventListener("click", exportData);
  document.querySelector("#import-btn").addEventListener("click", () => {
    document.querySelector("#import-file").click();
  });
  document.querySelector("#import-file").addEventListener("change", importData);
  document.querySelector("#player-form").addEventListener("submit", onPlayerSubmit);
  document.querySelector("#player-cancel").addEventListener("click", () => {
    document.querySelector("#player-dialog").close();
  });
  document.querySelector("#player-dialog").addEventListener("close", () => {
    editingPlayerId = null;
  });
  window.addEventListener("hashchange", () => {
    document.querySelector(".data-menu").removeAttribute("open");
    render();
  });
  if (!location.hash) location.hash = "#/players";
  else render();
}

init();
