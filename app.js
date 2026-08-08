/* ============================================================
   PLAN DE RÉVISION — logique de l'application
   Tout est stocké en local (localStorage) : rien ne quitte le
   téléphone, aucun serveur, aucun compte.
   ============================================================ */

// ---------- 1. Le référentiel des modalités ----------
// C'est le cœur pédagogique de l'app : à chaque échéance (offset,
// en jours depuis la date du cours) correspond une modalité précise.
const MODALITIES = {
  dump: {
    label: "Brain dump + relecture",
    short: "Encodage",
    hint: "Écris sur une feuille tout ce que tu te rappelles du cours, sans regarder tes notes (5-10 min). Puis relis le cours et complète les trous d'une autre couleur.",
    color: "var(--c-dump)",
    tint: "var(--c-dump-tint)",
    offset: 1,
  },
  recall: {
    label: "Rappel actif",
    short: "Retrieval",
    hint: "Sans tes notes : réponds à 5-8 questions clés ou refais les flashcards du cours. Vérifie seulement après avoir répondu.",
    color: "var(--c-recall)",
    tint: "var(--c-recall-tint)",
    offset: 3,
  },
  feynman: {
    label: "Méthode Feynman",
    short: "Explication",
    hint: "Explique le concept à voix haute, comme à quelqu'un qui n'y connaît rien. Note où tu bloques ou où tu utilises du jargon, puis va combler ces trous dans le cours.",
    color: "var(--c-feynman)",
    tint: "var(--c-feynman-tint)",
    offset: 7,
  },
  interleave: {
    label: "Rappel entrelacé",
    short: "Interleaving",
    hint: "Mélange ce cours avec 2-3 autres cours et fais un mini quiz croisé. L'objectif : t'entraîner à distinguer les notions, pas juste à les réciter.",
    color: "var(--c-interleave)",
    tint: "var(--c-interleave-tint)",
    offset: 14,
  },
  apply: {
    label: "Application",
    short: "Transfert",
    hint: "Résous un exercice, un cas pratique ou une question d'annale qui mobilise ce concept dans un contexte nouveau.",
    color: "var(--c-apply)",
    tint: "var(--c-apply-tint)",
    offset: 30,
  },
  cumulative: {
    label: "Révision cumulative",
    short: "Consolidation",
    hint: "Revois ce cours avec l'ensemble du chapitre, si possible en conditions d'examen (auto-test chronométré, sans notes).",
    color: "var(--c-cumulative)",
    tint: "var(--c-cumulative-tint)",
    offset: 60,
  },
};
const MODALITY_ORDER = ["dump", "recall", "feynman", "interleave", "apply", "cumulative"];

// ---------- 2. Utilitaires de dates ----------
// On travaille uniquement avec des chaînes "YYYY-MM-DD" et de
// l'arithmétique en UTC, pour ne jamais se faire piéger par les
// fuseaux horaires ou l'heure d'été/hiver.
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.round(days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const A = Date.UTC(ay, am - 1, ad);
  const B = Date.UTC(by, bm - 1, bd);
  return Math.round((B - A) / 86400000);
}
function formatLong(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function formatShort(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}
function relativeDayLabel(dateStr) {
  const diff = daysBetween(todayStr(), dateStr);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === -1) return "hier";
  if (diff < 0) return `en retard de ${-diff} j`;
  return `dans ${diff} j`;
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---------- 3. Stockage local ----------
const STORAGE_KEY = "plan-revision-data-v1";
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { courses: [], settings: { showCumulative: true } };
    const parsed = JSON.parse(raw);
    if (!parsed.settings) parsed.settings = { showCumulative: true };
    return parsed;
  } catch (e) {
    console.error("Lecture localStorage impossible, on repart de zéro.", e);
    return { courses: [], settings: { showCumulative: true } };
  }
}
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Sauvegarde impossible :", e);
    showToast("⚠️ Sauvegarde impossible (stockage plein ou bloqué)");
  }
}

let state = loadData();

// ---------- 4. Le cœur de l'algorithme ----------
// Génère les révisions d'un cours à partir des offsets par défaut,
// en tenant compte du réglage "J+60 activé ou non".
function generateReviews(course) {
  const keys = MODALITY_ORDER.filter((k) => k !== "cumulative" || state.settings.showCumulative);
  return keys.map((key) => ({
    id: uid(),
    key,
    dueDate: addDays(course.courseDate, MODALITIES[key].offset * course.multiplier),
    status: "pending", // 'pending' | 'done'
    doneDate: null,
    rating: null, // 'facile' | 'moyen' | 'difficile'
  }));
}

// Recalcule les dates des révisions PAS ENCORE FAITES d'un cours,
// à partir de la date du cours et du multiplicateur courant.
// Les révisions déjà faites gardent leur historique intact : on
// n'écrit jamais le passé, seulement le futur.
function recomputeSchedule(course) {
  course.reviews.forEach((r) => {
    if (r.status === "pending") {
      r.dueDate = addDays(course.courseDate, MODALITIES[r.key].offset * course.multiplier);
    }
  });
}

// Le multiplicateur adapte l'espacement à la difficulté ressentie,
// un peu comme le "easiness factor" d'un algorithme SM-2 mais en
// beaucoup plus simple : difficile => on resserre les prochaines
// échéances, facile => on les espace davantage. Le classement des
// modalités (dump -> recall -> feynman -> ...) ne change jamais,
// seul le tempo s'ajuste.
function applyRating(course, review, rating) {
  review.status = "done";
  review.doneDate = todayStr();
  review.rating = rating;

  if (rating === "difficile") course.multiplier = Math.max(0.5, course.multiplier * 0.75);
  else if (rating === "facile") course.multiplier = Math.min(1.8, course.multiplier * 1.25);
  // 'moyen' -> le multiplicateur ne bouge pas

  recomputeSchedule(course);
}

// ---------- 5. Actions sur les données ----------
function addCourse(title, subject, courseDate, notes) {
  const course = {
    id: uid(),
    title: title.trim(),
    subject: subject.trim(),
    courseDate,
    notes: notes.trim(),
    multiplier: 1,
    createdAt: Date.now(),
    reviews: [],
  };
  course.reviews = generateReviews(course);
  state.courses.push(course);
  saveData();
  return course;
}
function deleteCourse(courseId) {
  state.courses = state.courses.filter((c) => c.id !== courseId);
  saveData();
}
function findCourse(courseId) {
  return state.courses.find((c) => c.id === courseId);
}
function findReview(course, reviewId) {
  return course.reviews.find((r) => r.id === reviewId);
}
function postponeReview(course, review) {
  // Si la révision était déjà en retard, "reporter" la replace à demain
  // (pas juste +1 jour dans le passé, ce qui obligerait à cliquer plusieurs fois).
  const base = review.dueDate < todayStr() ? todayStr() : review.dueDate;
  review.dueDate = addDays(base, 1);
  saveData();
}

// Toutes les révisions en attente, à plat, avec une référence au cours.
function allPendingReviews() {
  const out = [];
  state.courses.forEach((course) => {
    course.reviews.forEach((r) => {
      if (r.status === "pending") out.push({ course, review: r });
    });
  });
  return out;
}

// ---------- 6. Rendu : vue "Aujourd'hui" ----------
function renderToday() {
  const pending = allPendingReviews();
  const overdue = pending.filter((x) => x.review.dueDate < todayStr()).sort((a, b) => a.review.dueDate.localeCompare(b.review.dueDate));
  const dueToday = pending.filter((x) => x.review.dueDate === todayStr());
  const dueSoonCount = dueToday.length + overdue.length;

  const hero = document.getElementById("today-hero");
  hero.innerHTML = `
    <div class="big-count">${dueSoonCount}<small>${dueSoonCount > 1 ? "révisions à faire" : "révision à faire"}</small></div>
    <div class="sub">${formatLong(todayStr())}</div>
    ${dueSoonCount > 10 ? `<div class="load-warning">📌 Grosse journée : commence par ce qui est en retard, et n'hésite pas à « reporter » ce qui peut attendre un jour.</div>` : ""}
  `;

  const list = document.getElementById("today-list");
  list.innerHTML = "";

  if (dueSoonCount === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="big-emoji">🌿</span>
        <h3>Rien à réviser aujourd'hui</h3>
        <p>Ajoute le cours que tu viens de faire avec le bouton “+”.</p>
      </div>`;
    return;
  }

  if (overdue.length) {
    list.appendChild(sectionLabel(`En retard`, overdue.length, true));
    overdue.forEach((x) => list.appendChild(reviewCard(x.course, x.review)));
  }
  if (dueToday.length) {
    list.appendChild(sectionLabel(`Aujourd'hui`, dueToday.length, false));
    dueToday.forEach((x) => list.appendChild(reviewCard(x.course, x.review)));
  }
}

function sectionLabel(text, count, overdue) {
  const div = document.createElement("div");
  div.className = "section-label" + (overdue ? " overdue" : "");
  div.innerHTML = `${text} <span class="count-chip">${count}</span>`;
  return div;
}

function reviewCard(course, review) {
  const mod = MODALITIES[review.key];
  const card = document.createElement("div");
  card.className = "review-card";
  card.style.setProperty("--tag-color", mod.color);
  card.style.setProperty("--tag-tint", mod.tint);
  card.innerHTML = `
    <div class="modality-row">
      <span class="modality-badge">${mod.label}</span>
      <span class="day-tag">${relativeDayLabel(review.dueDate)}</span>
    </div>
    <p class="course-title">${escapeHtml(course.title)}</p>
    <div class="subject-tag">${escapeHtml(course.subject)}</div>
    <div class="modality-hint">${mod.hint}</div>
    <div class="actions">
      <button class="rate-btn facile" data-act="facile">Facile</button>
      <button class="rate-btn moyen" data-act="moyen">Moyen</button>
      <button class="rate-btn difficile" data-act="difficile">Difficile</button>
      <button class="rate-btn postpone" data-act="postpone">Reporter +1j</button>
    </div>
  `;
  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "postpone") {
        postponeReview(course, review);
        showToast("Reporté à demain");
      } else {
        applyRating(course, review, act);
        saveData();
        showToast("✓ Révision faite — bravo");
      }
      renderAll();
    });
  });
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 7. Rendu : vue "Cours" ----------
function renderCourses() {
  const list = document.getElementById("courses-list");
  list.innerHTML = "";
  if (state.courses.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="big-emoji">📚</span>
        <h3>Aucun cours pour l'instant</h3>
        <p>Chaque cours que tu ajoutes génère automatiquement son plan de révision.</p>
      </div>`;
    return;
  }
  const sorted = [...state.courses].sort((a, b) => b.courseDate.localeCompare(a.courseDate));
  sorted.forEach((course) => {
    const done = course.reviews.filter((r) => r.status === "done").length;
    const total = course.reviews.length;
    const row = document.createElement("div");
    row.className = "course-row";
    row.innerHTML = `
      ${progressRing(done, total)}
      <div>
        <p class="row-title">${escapeHtml(course.title)}</p>
        <div class="row-meta">${escapeHtml(course.subject)} · appris le ${formatShort(course.courseDate)} · ${done}/${total} étapes</div>
      </div>
      <span class="chevron">›</span>
    `;
    row.addEventListener("click", () => openCourseDetail(course.id));
    list.appendChild(row);
  });
}

function progressRing(done, total) {
  const size = 40, stroke = 4, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  const offset = c * (1 - frac);
  return `
    <svg class="progress-ring" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" style="fill:none;stroke:var(--mist);stroke-width:${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" style="fill:none;stroke:var(--forest);stroke-width:${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
}

// ---------- 8. Rendu : détail d'un cours ----------
let currentDetailId = null;
function openCourseDetail(courseId) {
  currentDetailId = courseId;
  switchView("detail");
  renderDetail();
}
function renderDetail() {
  const course = findCourse(currentDetailId);
  if (!course) { switchView("courses"); return; }

  document.getElementById("detail-header").innerHTML = `
    <span class="subject-pill">${escapeHtml(course.subject)}</span>
    <h2>${escapeHtml(course.title)}</h2>
    <div class="meta-line">Appris le ${formatLong(course.courseDate)}${course.notes ? " · " + escapeHtml(course.notes) : ""}</div>
  `;

  document.getElementById("detail-curve").innerHTML = forgettingCurveSVG(course);

  const tl = document.getElementById("detail-timeline");
  tl.innerHTML = "";
  course.reviews.forEach((r) => {
    const mod = MODALITIES[r.key];
    const item = document.createElement("div");
    item.className = "timeline-item" + (r.status === "done" ? " done" : "");
    item.style.setProperty("--tag-color", mod.color);
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div>
        <div class="t-modality">${mod.label}</div>
        <div class="t-date">${r.status === "done" ? "fait le " + formatShort(r.doneDate) : formatLong(r.dueDate)}</div>
      </div>
      ${r.rating ? `<div class="t-rating">${r.rating}</div>` : ""}
    `;
    tl.appendChild(item);
  });
}

// Le "signature element" de l'app : une courbe de l'oubli en
// dents de scie. Chaque révision réussie remonte la rétention et
// APLATIT la pente suivante (on oublie plus lentement la fois
// d'après) — c'est exactement le principe qu'on est en train
// d'appliquer, rendu visible.
function forgettingCurveSVG(course) {
  const W = 500, H = 150, padX = 16, padY = 22;
  const keys = course.reviews.map((r) => r.key);
  const offsets = [0, ...keys.map((k) => MODALITIES[k].offset)];
  const maxOffset = offsets[offsets.length - 1] || 60;

  const xFor = (offset) => padX + (Math.log(offset + 1) / Math.log(maxOffset + 1)) * (W - padX * 2);
  const baseline = H - padY; // rétention basse
  const peak = padY; // rétention haute (juste après révision)

  let path = `M ${xFor(0)} ${peak}`;
  const points = [{ x: xFor(0), y: peak, key: null, done: true }];
  let decayK = 0.9;

  for (let i = 1; i < offsets.length; i++) {
    const x0 = offsets[i - 1], x1 = offsets[i];
    const steps = 14;
    for (let s = 1; s <= steps; s++) {
      const off = x0 + ((x1 - x0) * s) / steps;
      const y = baseline - (baseline - peak) * Math.exp((-decayK * (off - x0)) / (x1 - x0 || 1));
      path += ` L ${xFor(off).toFixed(1)} ${y.toFixed(1)}`;
    }
    // remontée verticale au moment de la révision (rappel réussi)
    path += ` L ${xFor(x1).toFixed(1)} ${peak}`;
    const review = course.reviews[i - 1];
    points.push({ x: xFor(x1), y: peak, key: review.key, done: review.status === "done" });
    decayK *= 0.55; // la pente s'aplatit : on oublie plus lentement
  }

  // On passe les couleurs via l'attribut "style" (pas fill="var(...)" en
  // brut) pour que la résolution des variables CSS soit fiable sur Safari iOS.
  const dots = points
    .filter((p) => p.key)
    .map((p) => {
      const mod = MODALITIES[p.key];
      const fillColor = p.done ? mod.color : "var(--paper-card)";
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y}" r="5.5" style="fill:${fillColor};stroke:${mod.color};stroke-width:2"/>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">
      <path d="${path}" style="fill:none;stroke:var(--forest);stroke-width:2.5" stroke-linejoin="round"/>
      ${dots}
    </svg>
    <div class="curve-caption">Courbe de l'oubli — chaque révision réussie aplatit la pente suivante</div>
  `;
}

// ---------- 9. Rendu : calendrier ----------
let calCursor = new Date(); // mois affiché
let calSelectedDate = todayStr();

function renderCalendar() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  document.getElementById("cal-label").textContent = calCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const weekdaysEl = document.getElementById("cal-weekdays");
  weekdaysEl.innerHTML = ["L", "M", "M", "J", "V", "S", "D"].map((d) => `<div class="cal-weekday">${d}</div>`).join("");

  const firstOfMonth = new Date(Date.UTC(y, m, 1));
  const startOffset = (firstOfMonth.getUTCDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  // map date -> Set des modalités présentes (uniquement en attente)
  const byDate = {};
  allPendingReviews().forEach(({ review }) => {
    const key = review.dueDate;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(review.key);
  });

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  const totalCells = startOffset + daysInMonth;
  const rows = Math.ceil(totalCells / 7) * 7;

  for (let i = 0; i < rows; i++) {
    const dayNum = i - startOffset + 1;
    const cell = document.createElement("div");
    if (dayNum < 1 || dayNum > daysInMonth) {
      cell.className = "cal-day muted";
      cell.innerHTML = "&nbsp;";
      grid.appendChild(cell);
      continue;
    }
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    cell.className = "cal-day";
    if (dateStr === todayStr()) cell.classList.add("today");
    if (dateStr === calSelectedDate) cell.classList.add("selected");

    const mods = (byDate[dateStr] || []).slice(0, 4);
    const dotsHtml = mods.length ? `<div class="cal-dots">${mods.map((k) => `<span class="cal-dot" style="background:${MODALITIES[k].color}"></span>`).join("")}</div>` : "";
    cell.innerHTML = `<span>${dayNum}</span>${dotsHtml}`;
    cell.addEventListener("click", () => {
      calSelectedDate = dateStr;
      renderCalendar();
    });
    grid.appendChild(cell);
  }

  // légende
  document.getElementById("cal-legend").innerHTML = MODALITY_ORDER.filter((k) => k !== "cumulative" || state.settings.showCumulative)
    .map((k) => `<div class="legend-item"><span class="legend-dot" style="background:${MODALITIES[k].color}"></span>${MODALITIES[k].short}</div>`)
    .join("");

  renderCalDayDetail(byDate);
}

function renderCalDayDetail(byDate) {
  const el = document.getElementById("cal-day-detail");
  const items = allPendingReviews().filter((x) => x.review.dueDate === calSelectedDate);
  el.innerHTML = `<div class="section-label">${formatLong(calSelectedDate)} <span class="count-chip">${items.length}</span></div>`;
  if (!items.length) {
    el.innerHTML += `<div class="empty-state" style="padding:20px 20px 10px;"><p>Aucune révision ce jour-là.</p></div>`;
    return;
  }
  items.forEach((x) => el.appendChild(reviewCard(x.course, x.review)));
}

// ---------- 10. Rendu : réglages ----------
function renderSettings() {
  const t = document.getElementById("toggle-cumulative");
  t.classList.toggle("on", state.settings.showCumulative);

  const el = document.getElementById("settings-modalities");
  el.innerHTML = MODALITY_ORDER.map((k) => {
    const mod = MODALITIES[k];
    return `<div class="settings-row">
      <div>
        <div class="s-title">J+${mod.offset} · ${mod.label}</div>
        <div class="s-desc">${mod.hint}</div>
      </div>
    </div>`;
  }).join("");
}

// ---------- 11. Navigation ----------
function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");

  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  const tabBtn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (tabBtn) tabBtn.classList.add("active");

  const titles = { today: "Aujourd'hui", calendar: "Calendrier", courses: "Mes cours", detail: "Détail", settings: "Réglages" };
  document.getElementById("top-title").textContent = titles[name] || "";

  const fab = document.getElementById("fab-add");
  fab.style.display = name === "today" || name === "courses" ? "flex" : "none";

  const tabBar = document.querySelector(".tab-bar");
  tabBar.style.display = name === "detail" || name === "settings" ? "none" : "flex";
}

function renderAll() {
  renderToday();
  renderCourses();
  renderCalendar();
  if (currentDetailId) renderDetail();
  renderSettings();
  refreshSubjectList();
}

function refreshSubjectList() {
  const subjects = [...new Set(state.courses.map((c) => c.subject).filter(Boolean))];
  document.getElementById("subject-list").innerHTML = subjects.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("");
}

// ---------- 12. Toast ----------
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- 13. Câblage des événements ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.tab));
});
document.getElementById("btn-settings").addEventListener("click", () => switchView("settings"));
document.getElementById("btn-back-settings").addEventListener("click", () => switchView("today"));
document.getElementById("btn-back-detail").addEventListener("click", () => { currentDetailId = null; switchView("courses"); });

document.getElementById("cal-prev").addEventListener("click", () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
  renderCalendar();
});

document.getElementById("toggle-cumulative").addEventListener("click", (e) => {
  state.settings.showCumulative = !state.settings.showCumulative;
  saveData();
  renderSettings();
  renderAll();
});

document.getElementById("btn-reset-data").addEventListener("click", () => {
  if (confirm("Supprimer tous les cours et toutes les révisions ? Cette action est irréversible.")) {
    state = { courses: [], settings: { showCumulative: true } };
    saveData();
    renderAll();
    switchView("today");
    showToast("Données réinitialisées");
  }
});

document.getElementById("btn-delete-course").addEventListener("click", () => {
  const course = findCourse(currentDetailId);
  if (course && confirm(`Supprimer « ${course.title} » et tout son plan de révision ?`)) {
    deleteCourse(course.id);
    currentDetailId = null;
    switchView("courses");
    renderAll();
    showToast("Cours supprimé");
  }
});

// -- Sheet "ajouter un cours" --
const sheetBackdrop = document.getElementById("sheet-backdrop");
function openAddSheet() {
  document.getElementById("f-date").value = todayStr();
  document.getElementById("f-title").value = "";
  document.getElementById("f-subject").value = "";
  document.getElementById("f-notes").value = "";
  sheetBackdrop.classList.add("open");
  setTimeout(() => document.getElementById("f-title").focus(), 250);
}
function closeAddSheet() { sheetBackdrop.classList.remove("open"); }

document.getElementById("fab-add").addEventListener("click", openAddSheet);
document.getElementById("btn-cancel-add").addEventListener("click", closeAddSheet);
sheetBackdrop.addEventListener("click", (e) => { if (e.target === sheetBackdrop) closeAddSheet(); });

document.getElementById("form-add-course").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("f-title").value;
  const subject = document.getElementById("f-subject").value;
  const date = document.getElementById("f-date").value || todayStr();
  const notes = document.getElementById("f-notes").value;
  if (!title.trim() || !subject.trim()) return;
  addCourse(title, subject, date, notes);
  closeAddSheet();
  renderAll();
  showToast("Plan de révision créé 🌱");
});

// ---------- 14. Démarrage ----------
renderAll();
switchView("today");

// Service worker : rend l'app utilisable hors-ligne une fois installée.
// (ne fonctionne que servi en http/https, pas en ouverture directe du fichier)
if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.log("SW non enregistré :", err));
  });
}
