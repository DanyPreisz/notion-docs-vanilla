const nav = document.querySelector("#nav");
const title = document.querySelector("#title");
const body = document.querySelector("#body");
const msg = document.querySelector("#msg");
const storeEl = document.querySelector("#store");
const q = document.querySelector("#q");
let id = null;
let timer = null;
document.querySelector("#new").addEventListener("click", createPage);
document.querySelector("#del").addEventListener("click", removePage);
q.addEventListener("input", list);
title.addEventListener("input", save);
body.addEventListener("input", save);
nav.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-id]");
  if (btn) open(btn.dataset.id);
});
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "<" + "lt;");
}
async function list() {
  const pages = await (await fetch("/api/pages?q=" + encodeURIComponent(q.value.trim()))).json();
  nav.innerHTML = pages.map((p) => `<button type="button" data-id="${p.id}" class="${p.id === id ? "is-on" : ""}">${escapeHtml(p.title)}</button>`).join("") || "<p class='empty'>Sin páginas</p>";
}
async function open(next) {
  if (!next) return;
  const page = await (await fetch("/api/pages/" + next)).json();
  if (!page.id) return;
  id = page.id;
  title.value = page.title;
  body.value = page.body || "";
  msg.textContent = "";
  list();
}
function save() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!id) return;
    await fetch("/api/pages/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.value, body: body.value }),
    });
    msg.textContent = "Guardado";
    list();
  }, 350);
}
async function createPage() {
  const page = await (await fetch("/api/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Sin título" }),
  })).json();
  q.value = "";
  open(page.id);
}
async function removePage() {
  if (!id) return;
  await fetch("/api/pages/" + id, { method: "DELETE" });
  id = null;
  title.value = "";
  body.value = "";
  msg.textContent = "Borrada";
  const pages = await (await fetch("/api/pages")).json();
  if (pages[0]) open(pages[0].id);
  else list();
}
async function boot() {
  const health = await (await fetch("/health")).json();
  storeEl.textContent = health.store === "mongodb" ? "MongoDB" : "Local";
  const pages = await (await fetch("/api/pages")).json();
  if (pages[0]) return open(pages[0].id);
  const first = await (await fetch("/api/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Inicio" }),
  })).json();
  open(first.id);
}
boot();
