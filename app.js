"use strict";

const app = document.querySelector("#app");
const LANGS = ["en", "hi", "mr", "gu"];

const state = {
  lang: validLang(storeGet("kapoor-lang")),
  afterLang: "home",
  mode: "clinic",
  step: "day",
  cursor: null,
  picked: null,
  hour: null,
  minute: null,
  errors: {},
  draftName: null,
  draftPhone: null,
};

let lastRoute = "";
let mapInstance = null;

function validLang(code) {
  return STR[code] ? code : "";
}

function storeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

function pack() {
  return STR[state.lang] || STR.en;
}

function t(key) {
  const value = pack()[key];
  if (value != null && value !== "") return value;
  const fallback = STR.en[key];
  return fallback != null ? fallback : key;
}

function fill(key, n) {
  return t(key).replace("{n}", String(n));
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function clinicNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

function dateNum(y, m, d) {
  return y * 10000 + m * 100 + d;
}

function addDays(y, m, d, n) {
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function shiftMonth(y, m, delta) {
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function jsDow(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isWeekend(y, m, d) {
  return !CLINIC.openDays.includes(jsDow(y, m, d));
}

function isBeforeToday(y, m, d) {
  const now = clinicNow();
  return dateNum(y, m, d) < dateNum(now.year, now.month, now.day);
}

function windowEnd() {
  const now = clinicNow();
  return addDays(now.year, now.month, now.day, CLINIC.bookWindowDays - 1);
}

function isBeyond(y, m, d) {
  const end = windowEnd();
  return dateNum(y, m, d) > dateNum(end.year, end.month, end.day);
}

function isToday(y, m, d) {
  const now = clinicNow();
  return y === now.year && m === now.month && d === now.day;
}

function minutes() {
  const list = [];
  for (let minute = 0; minute < 60; minute += CLINIC.slotMinutes) list.push(minute);
  return list;
}

function hours() {
  const list = [];
  for (let hour = CLINIC.openHour; hour < CLINIC.closeHour; hour += 1) list.push(hour);
  return list;
}

function slotStarted(y, m, d, hour, minute) {
  const now = clinicNow();
  const day = dateNum(y, m, d);
  const today = dateNum(now.year, now.month, now.day);
  if (day < today) return true;
  if (day > today) return false;
  if (hour < now.hour) return true;
  if (hour > now.hour) return false;
  return minute <= now.minute;
}

function hourOpen(y, m, d, hour) {
  return minutes().some((minute) => !slotStarted(y, m, d, hour, minute));
}

function hour12(hour) {
  return hour % 12 === 0 ? 12 : hour % 12;
}

function clockLabel(hour, minute) {
  return `${hour12(hour)}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function rangeLabel() {
  return `${hour12(CLINIC.openHour)}–${hour12(CLINIC.closeHour)}`;
}

function atNoon(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function formatWhen(y, m, d, locale, options) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "Asia/Kolkata",
    numberingSystem: "latn",
  }).format(atNoon(y, m, d));
}

function monthTitle(y, m) {
  return formatWhen(y, m, 1, pack().locale, { month: "long", year: "numeric" });
}

function niceDate(y, m, d) {
  return formatWhen(y, m, d, pack().locale, { weekday: "short", day: "numeric", month: "short" });
}

function englishDate(y, m, d) {
  return formatWhen(y, m, d, "en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

function parseRoute() {
  const hash = (location.hash || "#/").replace(/^#/, "");
  if (hash === "/book" || hash === "book") return "book";
  if (hash === "/online" || hash === "online") return "online";
  if (hash === "/map" || hash === "map") return "map";
  if (hash === "/lang" || hash === "lang") return "lang";
  return "home";
}

function resetWizard(route) {
  const now = clinicNow();
  state.mode = route === "online" ? "online" : "clinic";
  state.step = "day";
  state.picked = null;
  state.hour = null;
  state.minute = null;
  state.errors = {};
  state.cursor = { year: now.year, month: now.month };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function lastRequest() {
  try {
    const value = JSON.parse(storeGet("kapoor-last") || "null");
    if (!value || typeof value.url !== "string" || !value.url.startsWith("https://wa.me/")) return null;
    return value;
  } catch (e) {
    return null;
  }
}

function normalizePhone(raw) {
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function validPhone(digits) {
  return /^[6-9]\d{9}$/.test(digits);
}

function draftName() {
  if (state.draftName != null) return state.draftName;
  const last = lastRequest();
  return last ? last.name : "";
}

function draftPhone() {
  if (state.draftPhone != null) return state.draftPhone;
  const last = lastRequest();
  return last ? last.phone : "";
}

function buildMessage(name, phone, y, m, d, hour, minute) {
  const kind = state.mode === "online" ? "Online WhatsApp consult" : "Clinic visit";
  return [
    `${t("greet")} ${CLINIC.doctor}`,
    t("patientLine"),
    "",
    `Name: ${name}`,
    `Phone: +91 ${phone}`,
    `Type: ${kind}`,
    `Date: ${englishDate(y, m, d)}`,
    `Time: ${clockLabel(hour, minute)}`,
    "Place: Lifeline Hospital, Vishal Complex, Malad West, Mumbai",
  ].join("\n");
}

function svg(path) {
  return `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function iconBack() {
  return svg('<path d="M15 5 8 12l7 7"/>');
}

function iconBuilding() {
  return svg('<path d="M4 20h16"/><path d="M6 20V6l6-2 6 2v14"/><path d="M10 10h.01M14 10h.01M10 14h.01M14 14h.01M11 20v-3h2v3"/>');
}

function iconChat() {
  return svg('<path d="M5 16.5 4 20l3.5-1A8 8 0 1 0 5 16.5z"/>');
}

function iconPin() {
  return svg('<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="2"/>');
}

function iconChevron(dir) {
  const d = dir < 0 ? "M14 6 8 12l6 6" : "M10 6l6 6-6 6";
  return `<button type="button" class="icon-btn" data-action="month" data-delta="${dir}" aria-label="${esc(t(dir < 0 ? "prevMonth" : "nextMonth"))}">${svg(`<path d="${d}"/>`)}</button>`;
}

function iconDoor() {
  return `<svg viewBox="0 0 120 72" width="120" height="72" aria-hidden="true">
    <rect x="18" y="10" width="46" height="56" rx="4" fill="#fffaf3" stroke="#0f6e6b" stroke-width="3"/>
    <circle cx="54" cy="40" r="3" fill="#e07a2f"/>
    <path d="M78 22a12 12 0 1 0 12 18 10 10 0 0 1-12-10 10 10 0 0 1 8-8z" fill="#0f6e6b"/>
  </svg>`;
}

function topbar(title) {
  return `<header class="top">
    <button type="button" class="icon-btn" data-action="back" aria-label="${esc(t("back"))}">${iconBack()}</button>
    <h1>${esc(title)}</h1>
    <span></span>
  </header>`;
}

function steps(active) {
  const items = [["stepDay", 1], ["stepTime", 2], ["stepSend", 3]];
  return `<ol class="steps">${items.map(([key, n]) => {
    const cls = n === active ? "on" : n < active ? "done" : "";
    return `<li class="${cls}"><span>${n}</span>${esc(t(key))}</li>`;
  }).join("")}</ol>`;
}

function legend() {
  return `<ul class="legend">
    <li><i class="dot open"></i>${esc(t("open"))}</li>
    <li><i class="dot busy"></i>${esc(t("busy"))}</li>
    <li><i class="dot shut"></i>${esc(t("closed"))}</li>
  </ul>`;
}

function dayBar() {
  return `<div class="bar" aria-hidden="true">
    <span class="b-busy">${esc(fill("before", hour12(CLINIC.openHour)))}</span>
    <span class="b-open">${esc(rangeLabel())}</span>
    <span class="b-busy">${esc(fill("after", hour12(CLINIC.closeHour)))}</span>
  </div>`;
}

function drawLang() {
  const buttons = LANGS.map((code) => {
    const item = STR[code];
    return `<button type="button" class="lang-btn" lang="${item.htmlLang}" data-action="lang" data-lang="${code}">
      <span class="glyph">${item.glyph}</span>
      <span class="native">${item.native}</span>
    </button>`;
  }).join("");
  return `<header class="hero">
      <div class="mark" aria-hidden="true">AK</div>
      <h1>${esc(CLINIC.doctor)}</h1>
      <p class="role">Diabetologist</p>
    </header>
    <section class="pad"><div class="lang-grid">${buttons}</div></section>`;
}

function drawHome() {
  const last = lastRequest();
  const lastCard = last ? `<a class="last" href="${esc(last.url)}" target="_blank" rel="noopener">
      <span>${esc(t("lastRequest"))}</span>
      <strong>${esc(last.time)}</strong>
    </a>` : "";
  return `<header class="hero">
      <div class="hero-top">
        <div class="mark" aria-hidden="true">AK</div>
        <button type="button" class="lang-chip" data-action="go" data-hash="#/lang" lang="${pack().htmlLang}">${esc(pack().native)}</button>
      </div>
      <h1>${esc(CLINIC.doctor)}</h1>
      <p class="role">${esc(t("specialty"))}</p>
      <p class="place-line">${esc(t("place"))}</p>
    </header>
    <section class="hours" aria-label="${esc(rangeLabel())}">
      <div class="hours-block open">
        <span class="when">${esc(rangeLabel())}</span>
        <span>${esc(t("monFri"))}</span>
        <span class="tag">${esc(t("open"))}</span>
      </div>
      <div class="hours-block shut">
        <span class="when" aria-hidden="true">—</span>
        <span>${esc(t("satSun"))}</span>
        <span class="tag">${esc(t("closed"))}</span>
      </div>
    </section>
    <nav class="actions">
      <a class="action" href="#/book">
        <span class="ico">${iconBuilding()}</span>
        <span class="grow"><strong>${esc(t("visit"))}</strong><small>${esc(t("visitHint"))}</small></span>
        <span class="chev" aria-hidden="true">›</span>
      </a>
      <a class="action" href="#/online">
        <span class="ico">${iconChat()}</span>
        <span class="grow"><strong>${esc(t("online"))}</strong><small>${esc(t("onlineHint"))}</small></span>
        <span class="chev" aria-hidden="true">›</span>
      </a>
      <a class="action" href="#/map">
        <span class="ico">${iconPin()}</span>
        <span class="grow"><strong>${esc(t("reach"))}</strong><small>${esc(t("reachHint"))}</small></span>
        <span class="chev" aria-hidden="true">›</span>
      </a>
    </nav>
    ${lastCard}
    <p class="fine">${esc(t("emergency"))}</p>`;
}

function monthNav() {
  const now = clinicNow();
  const end = windowEnd();
  const cursor = state.cursor;
  const index = cursor.year * 12 + cursor.month;
  const prevOff = index <= now.year * 12 + now.month;
  const nextOff = index >= end.year * 12 + end.month;
  return `<div class="month">
    ${prevOff ? `<span></span>` : iconChevron(-1)}
    <h2>${esc(monthTitle(cursor.year, cursor.month))}</h2>
    ${nextOff ? `<span></span>` : iconChevron(1)}
  </div>`;
}

function calendar() {
  const { year, month } = state.cursor;
  const first = jsDow(year, month, 1);
  const lead = (first + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const letters = pack().dow.map((letter) => `<span>${esc(letter)}</span>`).join("");
  let cells = "";
  for (let i = 0; i < lead; i += 1) cells += `<span class="day-blank"></span>`;
  for (let day = 1; day <= count; day += 1) {
    const weekend = isWeekend(year, month, day);
    const past = isBeforeToday(year, month, day);
    const beyond = isBeyond(year, month, day);
    const selected = state.picked && state.picked.y === year && state.picked.m === month && state.picked.d === day;
    let cls = "day";
    if (past) cls += weekend ? " shut past" : " past";
    else if (beyond) cls += " far";
    else if (weekend) cls += " shut";
    else cls += " open";
    if (selected) cls += " selected";
    if (isToday(year, month, day)) cls += " today";
    const status = weekend ? t("closed") : past ? t("busy") : beyond ? "" : t("open");
    const label = `${niceDate(year, month, day)}${status ? `, ${status}` : ""}${isToday(year, month, day) ? `, ${t("today")}` : ""}`;
    const mini = weekend ? `<i class="mark-mini"></i>` : "";
    if (past || beyond) {
      cells += `<span class="${cls}"><span class="n">${day}</span>${mini}</span>`;
    } else {
      cells += `<button type="button" class="${cls}" data-action="pick-day" data-y="${year}" data-m="${month}" data-d="${day}" aria-label="${esc(label)}" ${selected ? 'aria-pressed="true"' : ""}><span class="n">${day}</span>${mini}</button>`;
    }
  }
  const closed = state.picked && isWeekend(state.picked.y, state.picked.m, state.picked.d)
    ? `<div class="closed-card">${iconDoor()}<p>${esc(t("weekend"))}</p></div>`
    : "";
  return `<p class="picked">${esc(t("pickDay"))}</p>
    ${monthNav()}
    <div class="dow">${letters}</div>
    <div class="cal">${cells}</div>
    ${legend()}
    ${closed}`;
}

function drawHours() {
  const { y, m, d } = state.picked;
  const any = hours().some((hour) => hourOpen(y, m, d, hour));
  const buttons = hours().map((hour) => {
    const open = hourOpen(y, m, d, hour);
    if (!open) {
      return `<button type="button" class="slot busy" disabled><span class="n">${hour12(hour)}</span><span class="s">${esc(t("busy"))}</span></button>`;
    }
    return `<button type="button" class="slot" data-action="pick-hour" data-hour="${hour}"><span class="n">${hour12(hour)}</span><span class="s">PM</span></button>`;
  }).join("");
  return `<p class="picked">${esc(niceDate(y, m, d))}</p>
    ${dayBar()}
    <p class="picked">${esc(t("pickHour"))}</p>
    ${any ? "" : `<p class="note">${esc(t("dayOver"))}</p>`}
    <div class="slots">${buttons}</div>`;
}

function drawMinutes() {
  const { y, m, d } = state.picked;
  const hour = state.hour;
  const buttons = minutes().map((minute) => {
    const label = `${hour12(hour)}:${String(minute).padStart(2, "0")}`;
    if (slotStarted(y, m, d, hour, minute)) {
      return `<button type="button" class="slot busy" disabled><span class="n">${label}</span><span class="s">${esc(t("busy"))}</span></button>`;
    }
    return `<button type="button" class="slot" data-action="pick-minute" data-minute="${minute}"><span class="n">${label}</span><span class="s">PM</span></button>`;
  }).join("");
  return `<p class="picked">${esc(niceDate(y, m, d))}</p>
    ${dayBar()}
    <p class="picked">${esc(t("pickMinute"))}</p>
    <div class="slots mins">${buttons}</div>`;
}

function drawForm() {
  const { y, m, d } = state.picked;
  const time = clockLabel(state.hour, state.minute);
  const nameErr = state.errors.name ? `<span class="err" role="alert">${esc(t("nameError"))}</span>` : "";
  const phoneErr = state.errors.phone ? `<span class="err" role="alert">${esc(t("phoneError"))}</span>` : "";
  return `<div class="summary">
      <strong class="big-time">${esc(time.replace(" PM", "").replace(" AM", ""))}</strong>
      <span class="ampm">PM</span>
      <p class="when">${esc(niceDate(y, m, d))}</p>
    </div>
    <form data-form="book" novalidate>
      <label class="field">${esc(t("name"))}
        <input name="name" autocomplete="name" autocapitalize="words" value="${esc(draftName())}" ${state.errors.name ? 'aria-invalid="true"' : ""}>
        ${nameErr}
      </label>
      <label class="field">${esc(t("phone"))}
        <input name="phone" inputmode="numeric" autocomplete="tel" maxlength="16" value="${esc(draftPhone())}" ${state.errors.phone ? 'aria-invalid="true"' : ""}>
        ${phoneErr}
      </label>
      <button class="wa" type="submit">${esc(t("send"))}</button>
      <p class="fine">${esc(t("confirm"))}<br>${esc(t("notHeld"))}</p>
    </form>`;
}

function drawSent() {
  const sent = state.sent;
  return `<div class="sent">
      <div class="check" aria-hidden="true">${iconChat()}</div>
      <h2>${esc(t("sent"))}</h2>
      <strong class="big-time">${esc(sent.time.replace(" PM", "").replace(" AM", ""))}</strong>
      <span class="ampm">PM</span>
      <p class="when">${esc(sent.when)}</p>
      <p class="fine">${esc(t("confirm"))}<br>${esc(t("notHeld"))}</p>
    </div>
    <div class="stack">
      <a class="wa" href="${esc(sent.url)}" target="_blank" rel="noopener">${esc(t("resend"))}</a>
      <button type="button" class="ghost" data-action="go" data-hash="#/">${esc(t("home"))}</button>
    </div>`;
}

function drawBook() {
  const active = state.step === "day" ? 1 : state.step === "form" || state.step === "sent" ? 3 : 2;
  const body = state.step === "sent" ? drawSent()
    : state.step === "form" ? drawForm()
    : state.step === "minute" ? drawMinutes()
    : state.step === "hour" ? drawHours()
    : calendar();
  const hint = state.mode === "online" ? t("onlineHint") : t("visitHint");
  return `${topbar(state.mode === "online" ? t("online") : t("visit"))}
    ${steps(active)}
    <p class="banner">${esc(hint)}</p>
    ${body}`;
}

function directionsUrl() {
  return `https://www.google.com/maps/dir/?api=1&destination=${CLINIC.lat},${CLINIC.lng}`;
}

function drawMap() {
  return `${topbar(t("reach"))}
    <p class="address">${esc(t("place"))}<small>${esc(CLINIC.address)}</small></p>
    <div id="map"></div>
    <p class="note" id="map-offline" hidden>${esc(t("mapOffline"))}</p>
    <div class="stack map-actions">
      <a class="go" id="directions" href="${esc(directionsUrl())}" target="_blank" rel="noopener">${esc(t("directions"))}</a>
    </div>`;
}

function draw(screen) {
  const inner = screen === "lang" ? drawLang()
    : screen === "book" || screen === "online" ? drawBook()
    : screen === "map" ? drawMap()
    : drawHome();
  return `<div class="shell">${inner}</div>`;
}

function destroyMap() {
  if (!mapInstance) return;
  mapInstance.remove();
  mapInstance = null;
}

function initMap() {
  const el = document.querySelector("#map");
  if (!el || !window.L) {
    if (el) el.hidden = true;
    const note = document.querySelector("#map-offline");
    if (note) note.hidden = false;
    return;
  }
  mapInstance = L.map(el, { scrollWheelZoom: false }).setView([CLINIC.lat, CLINIC.lng], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapInstance);
  const icon = L.icon({
    iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
  L.marker([CLINIC.lat, CLINIC.lng], { icon }).addTo(mapInstance)
    .bindPopup(`<strong>${esc(CLINIC.hospital)}</strong><br>Malad West`)
    .openPopup();
  requestAnimationFrame(() => mapInstance && mapInstance.invalidateSize());
}

function render() {
  destroyMap();
  const route = parseRoute();
  const gated = !state.lang && route !== "lang";
  if (gated) state.afterLang = route;
  if (!gated && (route === "book" || route === "online") && route !== lastRoute) resetWizard(route);
  lastRoute = gated ? "lang" : route;
  const screen = gated ? "lang" : route;
  document.documentElement.lang = state.lang ? pack().htmlLang : "en";
  app.innerHTML = draw(screen);
  const bad = app.querySelector('[aria-invalid="true"]');
  if (bad) bad.focus();
  if (screen === "map") requestAnimationFrame(initMap);
  window.scrollTo(0, 0);
}

function onClick(event) {
  const el = event.target.closest("[data-action]");
  if (!el || !app.contains(el)) return;
  const action = el.dataset.action;
  if (action === "lang") {
    state.lang = validLang(el.dataset.lang);
    storeSet("kapoor-lang", state.lang);
    const dest = state.afterLang && state.afterLang !== "lang" ? state.afterLang : "home";
    state.afterLang = "home";
    go(dest === "home" ? "#/" : `#/${dest}`);
    return;
  }
  if (action === "go") {
    go(el.dataset.hash);
    return;
  }
  if (action === "back") {
    const route = parseRoute();
    if ((route === "book" || route === "online") && state.step !== "day" && state.step !== "sent") {
      if (state.step === "form") state.step = "minute";
      else if (state.step === "minute") state.step = "hour";
      else state.step = "day";
      render();
      return;
    }
    go("#/");
    return;
  }
  if (action === "month") {
    state.cursor = shiftMonth(state.cursor.year, state.cursor.month, Number(el.dataset.delta));
    state.picked = null;
    render();
    return;
  }
  if (action === "pick-day") {
    const y = Number(el.dataset.y);
    const m = Number(el.dataset.m);
    const d = Number(el.dataset.d);
    state.picked = { y, m, d };
    state.hour = null;
    state.minute = null;
    state.step = isWeekend(y, m, d) ? "day" : "hour";
    render();
    return;
  }
  if (action === "pick-hour") {
    state.hour = Number(el.dataset.hour);
    state.minute = null;
    state.step = "minute";
    render();
    return;
  }
  if (action === "pick-minute") {
    state.minute = Number(el.dataset.minute);
    state.errors = {};
    state.step = "form";
    render();
  }
}

function onInput(event) {
  if (event.target.name === "name") state.draftName = event.target.value;
  if (event.target.name === "phone") state.draftPhone = event.target.value;
}

function onSubmit(event) {
  const form = event.target.closest('form[data-form="book"]');
  if (!form) return;
  event.preventDefault();
  const name = form.name.value.replace(/[\r\n]+/g, " ").trim();
  const phone = normalizePhone(form.phone.value);
  state.draftName = form.name.value;
  state.draftPhone = form.phone.value;
  state.errors = { name: name.length < 1, phone: !validPhone(phone) };
  if (state.errors.name || state.errors.phone) {
    render();
    return;
  }
  const { y, m, d } = state.picked;
  const url = `https://wa.me/${CLINIC.whatsapp}?text=${encodeURIComponent(buildMessage(name, phone, y, m, d, state.hour, state.minute))}`;
  const payload = {
    name,
    phone,
    mode: state.mode,
    when: niceDate(y, m, d),
    time: clockLabel(state.hour, state.minute),
    url,
  };
  storeSet("kapoor-last", JSON.stringify(payload));
  state.sent = payload;
  state.step = "sent";
  render();
  window.open(url, "_blank", "noopener");
}

app.addEventListener("click", onClick);
app.addEventListener("input", onInput);
app.addEventListener("submit", onSubmit);
window.addEventListener("hashchange", render);
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
