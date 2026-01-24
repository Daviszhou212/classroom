
const STORAGE_KEY = "class-pet-mvp";

const DEFAULT_DATA = {
  schemaVersion: 1,
  students: [],
  pets: [],
  ledger: [],
  catalog: [
    {
      id: "food-apple",
      name: "苹果",
      pricePoints: 5,
      effects: { hunger: 15, mood: 3, xp: 2 }
    },
    {
      id: "food-bread",
      name: "面包",
      pricePoints: 8,
      effects: { hunger: 25, mood: 2, xp: 3 }
    },
    {
      id: "food-milk",
      name: "牛奶",
      pricePoints: 10,
      effects: { hunger: 20, mood: 6, xp: 4 }
    }
  ],
  config: {
    teacherPinHash: "",
    rules: {
      xpPerLevel: 50,
      defaultHunger: 60,
      defaultMood: 60
    }
  }
};

const PET_TYPES = [
  { id: "dog", name: "小狗", icon: "assets/pets/dog.svg" },
  { id: "cat", name: "小猫", icon: "assets/pets/cat.svg" },
  { id: "rabbit", name: "小兔", icon: "assets/pets/rabbit.svg" },
  { id: "hamster", name: "仓鼠", icon: "assets/pets/hamster.svg" },
  { id: "turtle", name: "小乌龟", icon: "assets/pets/turtle.svg" },
  { id: "fish", name: "小鱼", icon: "assets/pets/fish.svg" },
  { id: "bird", name: "小鸟", icon: "assets/pets/bird.svg" }
];

const app = {
  data: null,
  view: "home",
  params: {},
  auth: {
    teacher: false
  },
  ui: {
    studentSearch: "",
    editingStudentId: null,
    studentSelectedId: null,
    displayPage: 0,
    displayPageSize: 16,
    displaySearch: "",
    displaySelectedId: null,
    displayFreeze: false,
    displaySearchComposing: false
  }
};

const mainEl = document.getElementById("main");
const toastEl = document.getElementById("toast");
const modeIndicatorEl = document.getElementById("modeIndicator");
const headerActionsEl = document.getElementById("headerActions");

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return clone(DEFAULT_DATA);
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeData(parsed);
  } catch (err) {
    console.error(err);
    return clone(DEFAULT_DATA);
  }
}

function normalizeData(data) {
  const normalized = clone(DEFAULT_DATA);
  normalized.schemaVersion = data.schemaVersion || DEFAULT_DATA.schemaVersion;
  normalized.students = Array.isArray(data.students) ? data.students : [];
  normalized.pets = Array.isArray(data.pets) ? data.pets : [];
  normalized.ledger = Array.isArray(data.ledger) ? data.ledger : [];
  normalized.catalog =
    Array.isArray(data.catalog) && data.catalog.length > 0
      ? data.catalog
      : DEFAULT_DATA.catalog;
  normalized.config = {
    ...DEFAULT_DATA.config,
    ...(data.config || {})
  };
  normalized.config.rules = {
    ...DEFAULT_DATA.config.rules,
    ...((data.config || {}).rules || {})
  };

  normalized.students = normalized.students.map((student) => ({
    points: 0,
    group: "",
    alias: "",
    ...student
  }));

  return normalized;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.data));
}

function syncData() {
  const studentIds = new Set(app.data.students.map((s) => s.id));
  app.data.pets = app.data.pets.filter((pet) => studentIds.has(pet.studentId));

  for (const student of app.data.students) {
    if (!app.data.pets.find((pet) => pet.studentId === student.id)) {
      app.data.pets.push(createPetForStudent(student));
    }
  }
  app.data.pets.forEach(ensurePetType);
  saveData();
}

function createPetForStudent(student) {
  const now = Date.now();
  return {
    id: makeId("pet"),
    studentId: student.id,
    petType: pickPetTypeId(),
    petName: `${student.name}的小伙伴`,
    level: 1,
    xp: 0,
    hunger: app.data.config.rules.defaultHunger,
    mood: app.data.config.rules.defaultMood,
    updatedAt: now
  };
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(4)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message, type = "info") {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  setTimeout(() => {
    toastEl.className = "toast";
  }, 2400);
}

function setAuthError(message = "") {
  const errorEl = document.getElementById("authError");
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.toggle("show", Boolean(message));
}

function getAuthErrorMessage(form, options = {}) {
  if (!form) return "";
  const strict = options.strict === true;
  const pin = form.pin ? form.pin.value.trim() : "";
  const pinConfirm = form.pinConfirm ? form.pinConfirm.value.trim() : "";
  const isSetPin = form.dataset.action === "set-pin";

  if (strict && !pin) return "请输入 PIN";
  if (pin && /[^a-zA-Z0-9]/.test(pin)) return "PIN 只能包含英文和数字";
  if (pin.length > 0 && (pin.length < 4 || pin.length > 8)) return "PIN 长度需为 4-8 位";

  if (isSetPin) {
    if (strict && !pinConfirm) return "请确认 PIN";
    if (pinConfirm && /[^a-zA-Z0-9]/.test(pinConfirm)) return "PIN 只能包含英文和数字";
    if (pinConfirm.length > 0 && (pinConfirm.length < 4 || pinConfirm.length > 8)) return "PIN 长度需为 4-8 位";
    const pinReady = pin.length >= 4 && pin.length <= 8;
    const confirmReady = pinConfirm.length >= 4 && pinConfirm.length <= 8;
    if (pinReady && confirmReady && pin !== pinConfirm) return "两次 PIN 不一致";
  }

  return "";
}

function updateAuthError(form, options = {}) {
  const message = getAuthErrorMessage(form, options);
  setAuthError(message);
  return !message;
}

function setView(view, params = {}) {
  const leavingDisplay = app.view === "display-view" && view !== "display-view";
  if (leavingDisplay) {
    app.ui.displaySearch = "";
    app.ui.displayPage = 0;
    app.ui.displaySelectedId = null;
    app.ui.displayFreeze = false;
  }
  app.view = view;
  app.params = params;
  render();
}

function setModeIndicator(text) {
  modeIndicatorEl.textContent = `模式：${text}`;
}

function logoutTeacher() {
  app.auth.teacher = false;
  sessionStorage.removeItem("teacherAuthed");
  showToast("已退出教师模式", "info");
  setView("home");
}

function updateHeaderButtons() {
  const buttons = [
    { id: "homeBtn", view: "home" },
    { id: "teacherBtn", view: "teacher-dashboard" },
    { id: "displayBtn", view: "display-view" }
  ];
  buttons.forEach((btn) => {
    const el = document.getElementById(btn.id);
    if (!el) return;
    const isActive = app.view === btn.view;
    el.classList.toggle("primary", isActive);
    el.classList.toggle("ghost", !isActive);
  });
}

function getStudentById(id) {
  return app.data.students.find((student) => student.id === id);
}

function getPetByStudentId(studentId) {
  return app.data.pets.find((pet) => pet.studentId === studentId);
}

function getPetType(typeId) {
  return PET_TYPES.find((type) => type.id === typeId) || PET_TYPES[0];
}

function pickPetTypeId() {
  const index = Math.floor(Math.random() * PET_TYPES.length);
  return PET_TYPES[index].id;
}

function ensurePetType(pet) {
  if (!pet.petType || !PET_TYPES.some((type) => type.id === pet.petType)) {
    pet.petType = pickPetTypeId();
  }
}

function getPetIcon(pet) {
  return getPetType(pet.petType).icon;
}

function getPetTypeName(pet) {
  return getPetType(pet.petType).name;
}

function getSortedStudents(options = {}) {
  const term = options.ignoreSearch ? "" : app.ui.studentSearch.trim();
  return app.data.students
    .filter((student) => {
      if (!term) return true;
      return (
        student.name.includes(term) ||
        String(student.seatNo).includes(term) ||
        String(student.group || "").includes(term) ||
        String(student.alias || "").includes(term)
      );
    })
    .sort((a, b) => {
      const aSeat = Number(a.seatNo);
      const bSeat = Number(b.seatNo);
      if (!Number.isNaN(aSeat) && !Number.isNaN(bSeat)) {
        return aSeat - bSeat;
      }
      return String(a.seatNo).localeCompare(String(b.seatNo), "zh-CN");
    });
}

function getDisplayStudents() {
  const term = app.ui.displaySearch.trim();
  const list = getSortedStudents({ ignoreSearch: true });
  if (!term) return list;
  return list.filter((student) => matchDisplaySearch(term, student));
}

function normalizeSearchText(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (!text.normalize) return text;
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getNameInitials(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.map((part) => part[0]).join("");
}

function matchDisplaySearch(term, student) {
  const keyword = normalizeSearchText(term);
  if (!keyword) return true;
  const fields = [
    student.name,
    student.seatNo,
    student.group,
    student.alias
  ];
  const joined = normalizeSearchText(fields.filter(Boolean).join(" "));
  if (joined.includes(keyword)) return true;
  const initials = normalizeSearchText(getNameInitials(student.name));
  return initials.includes(keyword);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatEffects(effects) {
  const parts = [];
  if (effects.hunger) {
    const value = Math.abs(effects.hunger);
    const sign = effects.hunger >= 0 ? "-" : "+";
    parts.push(`饥饿 ${sign}${value}`);
  }
  if (effects.mood) parts.push(`心情 +${effects.mood}`);
  if (effects.xp) parts.push(`XP +${effects.xp}`);
  return parts.join(" / ") || "无";
}

function computeLevel(xp) {
  const per = app.data.config.rules.xpPerLevel || 50;
  return Math.floor(xp / per) + 1;
}

function getXpProgress(xp) {
  const per = Number(app.data.config.rules.xpPerLevel) || 50;
  const safePer = per > 0 ? per : 50;
  const total = Math.max(0, Number(xp) || 0);
  const current = total % safePer;
  const percent = safePer ? Math.round((current / safePer) * 100) : 0;
  return {
    total,
    current,
    per: safePer,
    percent: Math.max(0, Math.min(100, percent))
  };
}

function renderXpProgress(pet, options = {}) {
  const progress = getXpProgress(pet.xp);
  const label = options.compact
    ? `经验 ${progress.current}/${progress.per}`
    : `经验值 XP：${pet.xp}（本级 ${progress.current}/${progress.per}）`;
  return `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      <div class="progress"><span style="width:${progress.percent}%"></span></div>
    </div>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addLedgerEntry(entry) {
  app.data.ledger.push({
    id: makeId("ledger"),
    operator: "teacher",
    ...entry
  });
}

async function hashPin(pin) {
  if (window.crypto && window.crypto.subtle) {
    const data = new TextEncoder().encode(pin);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 0;
  for (let i = 0; i < pin.length; i += 1) {
    hash = (hash << 5) - hash + pin.charCodeAt(i);
    hash |= 0;
  }
  return `legacy-${hash}`;
}
function render() {
  updateHeaderButtons();
  const displayFreeze = app.ui.displayFreeze;

  if (app.view === "display-view") {
    document.body.classList.add("display-mode");
  } else {
    document.body.classList.remove("display-mode");
  }
  document.body.classList.toggle(
    "display-modal-open",
    app.view === "display-view" && Boolean(app.ui.displaySelectedId)
  );
  const isTeacherLogin = app.view === "teacher-dashboard" && !app.auth.teacher;
  document.body.classList.toggle("auth-mode", isTeacherLogin);
  document.body.classList.toggle("home-mode", app.view === "home");
  const isTeacherSection = app.view.startsWith("teacher");
  document.body.classList.toggle("teacher-mode", app.auth.teacher && isTeacherSection);
  document.body.classList.toggle("teacher-students-mode", app.view === "teacher-students");

  switch (app.view) {
    case "home":
      setModeIndicator("主页");
      mainEl.innerHTML = renderHome();
      break;
    case "teacher-dashboard":
      if (!app.auth.teacher) {
        setModeIndicator("教师登录");
        mainEl.innerHTML = renderTeacherLogin();
        setAuthError("");
      } else {
        setModeIndicator("教师模式");
        mainEl.innerHTML = renderTeacherDashboard();
      }
      break;
    case "teacher-students":
      setModeIndicator("学生管理");
      mainEl.innerHTML = renderTeacherStudents();
      break;
    case "teacher-rewards":
      setModeIndicator("发放奖励");
      mainEl.innerHTML = renderTeacherRewards();
      break;
    case "teacher-student-detail":
      setModeIndicator("学生详情");
      mainEl.innerHTML = renderTeacherStudentDetail();
      break;
    case "teacher-import":
      setModeIndicator("导入导出");
      mainEl.innerHTML = renderTeacherImport();
      break;
    case "teacher-settings":
      setModeIndicator("系统设置");
      mainEl.innerHTML = renderTeacherSettings();
      break;
    case "student-view":
      setModeIndicator("学生展示");
      mainEl.innerHTML = renderStudentView();
      break;
    case "display-view":
      setModeIndicator("展示模式");
      mainEl.innerHTML = renderDisplayView();
      break;
    default:
      setModeIndicator("主页");
      mainEl.innerHTML = renderHome();
      break;
  }

  if (displayFreeze) {
    app.ui.displayFreeze = false;
  }
}

function renderHome() {
  const showDisplayEntry = !app.auth.teacher;
  return `
    <section class="landing">
      <div class="landing-title-wrap">
        <img src="assets/pet.svg" alt="宠物图标" class="landing-icon" />
        <h1 class="landing-title">班级电子宠物管理系统</h1>
        <p class="landing-subtitle">请选择进入方式继续</p>
      </div>
      <div class="landing-card">
        <div class="landing-actions">
          <button class="primary" data-action="go-teacher">教师登录</button>
          ${showDisplayEntry ? `<button class="accent" data-action="go-display">进入展示模式</button>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderTeacherLogin() {
  const hasPin = Boolean(app.data.config.teacherPinHash);
  if (!hasPin) {
    return `
      <section class="landing landing-auth">
        <div class="landing-title-wrap">
          <img src="assets/pet.svg" alt="宠物图标" class="landing-icon" />
          <h1 class="landing-title">设置教师 PIN</h1>
          <p class="landing-subtitle">首次使用请设置 PIN 以保护管理入口</p>
        </div>
        <div class="landing-card">
          <form class="landing-form" data-action="set-pin">
            <div class="landing-field">
              <label>设置 PIN（4-8 位英文或数字）</label>
              <input type="password" name="pin" minlength="4" maxlength="8" required />
            </div>
            <div class="landing-field">
              <label>确认 PIN</label>
              <input type="password" name="pinConfirm" minlength="4" maxlength="8" required />
            </div>
            <button class="primary" type="submit">保存并进入教师模式</button>
          </form>
          <p id="authError" class="landing-error" role="alert"></p>
          <div class="landing-links">
            <button class="text-link" type="button" data-action="go-home">返回主页</button>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="landing landing-auth">
      <div class="landing-title-wrap">
        <img src="assets/pet.svg" alt="宠物图标" class="landing-icon" />
        <h1 class="landing-title">教师登录</h1>
        <p class="landing-subtitle">请输入教师 PIN 进入管理模式</p>
      </div>
      <div class="landing-card">
        <form class="landing-form" data-action="login-pin">
          <div class="landing-field">
            <label>教师 PIN（4-8 位英文或数字）</label>
            <input type="password" name="pin" minlength="4" maxlength="8" required />
          </div>
          <button class="primary" type="submit">进入教师模式</button>
        </form>
        <p id="authError" class="landing-error" role="alert"></p>
        <div class="landing-links">
          <button class="text-link" type="button" data-action="go-home">返回主页</button>
        </div>
      </div>
    </section>
  `;
}

function renderTeacherDashboard() {
  const recentLedger = app.data.ledger.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  return `
    <section class="section">
      <h2>教师仪表盘</h2>
      <div class="grid cols-3">
        <div class="card">
          <span class="badge">学生数量</span>
          <h3>${app.data.students.length}</h3>
          <p>每位学生自动拥有一个宠物档案。</p>
        </div>
        <div class="card">
          <span class="badge">流水记录</span>
          <h3>${app.data.ledger.length}</h3>
          <p>奖励/喂养等操作全部进入流水。</p>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>快捷入口</h2>
      <div class="form-actions">
        <button class="primary" data-action="go-students">学生管理</button>
        <button class="primary" data-action="go-rewards">发放奖励</button>
        <button class="ghost" data-action="go-import">导入导出</button>
        <button class="ghost" data-action="go-settings">系统设置</button>
      </div>
    </section>

    <section class="section">
      <h2>最近流水</h2>
      ${renderLedgerTable(recentLedger)}
    </section>
  `;
}

function renderTeacherStudents() {
  const students = getSortedStudents();
  const editing = app.ui.editingStudentId ? getStudentById(app.ui.editingStudentId) : null;
  return `
    <section class="section">
      <h2>${editing ? "编辑学生" : "新增学生"}</h2>
      <form data-action="save-student">
        ${editing ? `<input type="hidden" name="studentId" value="${editing.id}" />` : ""}
        <div class="form-row">
          <div>
            <label>姓名</label>
            <input name="name" required value="${editing ? escapeHtml(editing.name) : ""}" />
          </div>
          <div>
            <label>学号</label>
            <input name="seatNo" required value="${editing ? escapeHtml(editing.seatNo) : ""}" />
          </div>
          <div>
            <label>分组（可选）</label>
            <input name="group" value="${editing ? escapeHtml(editing.group || "") : ""}" />
          </div>
          <div>
            <label>拼音/英文名（可选）</label>
            <input name="alias" value="${editing ? escapeHtml(editing.alias || "") : ""}" />
          </div>
        </div>
        <div class="form-actions">
          <button class="primary" type="submit">${editing ? "保存修改" : "添加学生"}</button>
          ${editing ? `<button class="ghost" type="button" data-action="cancel-edit">取消编辑</button>` : ""}
        </div>
      </form>
    </section>

    <section class="section">
      <div class="form-row">
        <div>
          <label>搜索/过滤</label>
          <input id="studentSearch" placeholder="姓名 / 拼音 / 学号 / 分组" value="${escapeHtml(app.ui.studentSearch)}" />
        </div>
      </div>
      <div class="section-header">
        <h2>学生列表</h2>
        <button class="primary" data-action="go-dashboard">返回仪表盘</button>
      </div>
      ${students.length ? `
        <table class="table">
          <thead>
            <tr>
              <th>学号</th>
              <th>姓名</th>
              <th>分组</th>
              <th>拼音</th>
              <th>积分</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${students
              .map(
                (student) => `
              <tr>
                <td>${escapeHtml(student.seatNo)}</td>
                <td>${escapeHtml(student.name)}</td>
                <td>${escapeHtml(student.group || "-")}</td>
                <td>${escapeHtml(student.alias || "-")}</td>
                <td>${student.points || 0}</td>
                <td>
                  <button class="text" data-action="view-student" data-id="${student.id}">详情</button>
                  <button class="text" data-action="edit-student" data-id="${student.id}">编辑</button>
                  <button class="text" data-action="delete-student" data-id="${student.id}">删除</button>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      ` : `<p class="notice">还没有学生，请先添加。</p>`}
    </section>
  `;
}
function renderTeacherRewards() {
  const students = getSortedStudents();
  const reasons = ["课堂表现", "作业完成", "帮助同学", "纪律良好", "积极发言"];
  return `
    <section class="section">
      <h2>发放奖励（仅加分）</h2>
      ${students.length ? `
        <form data-action="award-points">
          <div class="form-row">
            <div>
              <label>选择学生</label>
              <select name="studentId" required>
                <option value="">请选择学生</option>
                ${students
                  .map(
                    (student) => `
                  <option value="${student.id}">学号 ${escapeHtml(student.seatNo)} ${escapeHtml(student.name)}</option>
                `
                  )
                  .join("")}
              </select>
            </div>
            <div>
              <label>加分数值</label>
              <input id="awardPoints" type="number" name="points" min="1" required />
              <div class="pill-list" style="margin-top:8px;">
                <button class="ghost small" type="button" data-action="quick-award" data-value="1">+1</button>
                <button class="ghost small" type="button" data-action="quick-award" data-value="2">+2</button>
                <button class="ghost small" type="button" data-action="quick-award" data-value="5">+5</button>
              </div>
            </div>
            <div>
              <label>理由模板</label>
              <select name="reasonTemplate">
                <option value="">请选择理由</option>
                ${reasons.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>自定义理由（可选）</label>
              <input name="reasonCustom" placeholder="例如：按时完成阅读任务" />
            </div>
          </div>
          <div class="form-actions">
            <button class="primary" type="submit">确认加分</button>
            <button class="ghost" type="button" data-action="go-dashboard">返回仪表盘</button>
          </div>
        </form>
      ` : `<p class="notice">暂无学生，请先添加学生。</p>`}
    </section>
  `;
}

function renderTeacherStudentDetail() {
  const student = getStudentById(app.params.id);
  if (!student) {
    return `
      <section class="section">
        <div class="section-header">
          <h2>学生详情</h2>
          <button class="primary" data-action="go-students">返回学生管理</button>
        </div>
        <p class="notice">未找到学生。</p>
      </section>
    `;
  }
  const pet = getPetByStudentId(student.id);
  const ledger = app.data.ledger
    .filter((entry) => entry.studentId === student.id)
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
  return `
    <section class="section">
      <div class="section-header">
        <h2>学生详情</h2>
        <button class="primary" data-action="go-students">返回学生管理</button>
      </div>
      <div class="pet-card">
        <div class="pet-visual">
          <img src="${getPetIcon(pet)}" alt="宠物" />
          <div class="badge">等级 ${pet.level}</div>
        </div>
        <div class="stat-grid">
          <div class="stat-row">
            <span class="stat-label">姓名：${escapeHtml(student.name)}（学号 ${escapeHtml(student.seatNo)}）</span>
            <span class="pill">积分余额：${student.points || 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">宠物：${escapeHtml(getPetTypeName(pet))}</span>
          </div>
          ${renderXpProgress(pet)}
          <div class="stat-row">
            <span class="stat-label">饥饿值</span>
            <div class="progress"><span style="width:${pet.hunger}%"></span></div>
          </div>
          <div class="stat-row">
            <span class="stat-label">心情值</span>
            <div class="progress"><span style="width:${pet.mood}%"></span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>喂养（教师代操作）</h2>
      <div class="grid cols-3">
        ${app.data.catalog
          .map((item) => {
            const disabled = (student.points || 0) < item.pricePoints;
            return `
            <div class="card">
              <h3>${escapeHtml(item.name)}</h3>
              <p>价格：${item.pricePoints} 积分</p>
              <p>效果：${formatEffects(item.effects)}</p>
              <button class="${disabled ? "ghost" : "accent"}" data-action="feed" data-id="${item.id}" ${disabled ? "disabled" : ""}>
                ${disabled ? "积分不足" : "喂食"}
              </button>
            </div>
          `;
          })
          .join("")}
      </div>
    </section>

    <section class="section">
      <h2>最近流水</h2>
      ${renderLedgerTable(ledger)}
    </section>
  `;
}

function renderTeacherImport() {
  return `
    <section class="section">
      <h2>导出数据</h2>
      <p>导出包含学生、宠物、积分、流水与配置的 JSON。</p>
      <button class="primary" data-action="export-data">导出 JSON</button>
    </section>

    <section class="section">
      <h2>导入数据</h2>
      <p class="notice">导入会覆盖当前数据，操作前请确认已备份。</p>
      <form data-action="import-data">
        <div class="form-row">
          <div>
            <label>选择 JSON 文件</label>
            <input type="file" name="importFile" accept="application/json" required />
          </div>
        </div>
        <div class="form-actions">
          <button class="accent" type="submit">导入并覆盖</button>
          <button class="ghost" type="button" data-action="go-dashboard">返回仪表盘</button>
        </div>
      </form>
    </section>

    <section class="section">
      <h2>导入学生名单（CSV）</h2>
      <p class="notice">支持格式：学号,姓名,分组,拼音（或 studentNo,name,group,alias）。导入会覆盖现有学生、宠物与流水。</p>
      <div class="pill-list">
        <span class="pill">示例：1,王晨曦,A,wangchenxi</span>
        <span class="pill">示例：2,李一凡,,liyifan</span>
      </div>
      <form data-action="import-students-csv">
        <div class="form-row">
          <div>
            <label>选择 CSV 文件</label>
            <input type="file" name="studentCsv" accept=".csv,text/csv" required />
          </div>
        </div>
        <div class="form-actions">
          <button class="accent" type="submit">导入名单</button>
          <a class="text-link" href="data-samples/students.csv" download>下载示例 CSV</a>
        </div>
      </form>
    </section>
  `;
}

function renderTeacherSettings() {
  return `
    <section class="section">
      <h2>修改教师 PIN</h2>
      <form data-action="change-pin">
        <div class="form-row">
          <div>
            <label>当前 PIN</label>
            <input type="password" name="currentPin" required />
          </div>
          <div>
            <label>新 PIN（4-8 位数字）</label>
            <input type="password" name="newPin" minlength="4" maxlength="8" required />
          </div>
        </div>
        <div class="form-actions">
          <button class="primary" type="submit">更新 PIN</button>
          <button class="ghost" type="button" data-action="go-dashboard">返回仪表盘</button>
        </div>
      </form>
    </section>

    <section class="section">
      <h2>系统信息</h2>
      <div class="pill-list">
        <span class="pill">Schema v${app.data.schemaVersion}</span>
        <span class="pill">升级阈值：每 ${app.data.config.rules.xpPerLevel} XP 提升 1 级</span>
      </div>
    </section>

    <section class="section">
      <h2>危险操作</h2>
      <p class="notice">清空会删除所有本地数据，请谨慎使用。</p>
      <button class="ghost" data-action="reset-data">清空所有数据</button>
    </section>
  `;
}
function renderStudentView() {
  const students = getSortedStudents();
  const selectedId = app.ui.studentSelectedId;
  const selectedStudent = selectedId ? getStudentById(selectedId) : null;
  const pet = selectedStudent ? getPetByStudentId(selectedStudent.id) : null;

  const modalHtml =
    selectedStudent && pet
      ? `
      <div class="modal-overlay" data-action="close-student-modal">
        <div class="modal-card" data-action="noop">
          <h2>宠物详情</h2>
          <div class="pet-card">
            <div class="pet-visual">
              <img src="${getPetIcon(pet)}" alt="宠物" />
              <div class="badge">等级 ${pet.level}</div>
            </div>
            <div class="stat-grid">
              <div class="stat-row">
                <span class="stat-label">${escapeHtml(selectedStudent.name)}（学号 ${escapeHtml(
                  selectedStudent.seatNo
                )}）</span>
                <span class="pill">积分余额：${selectedStudent.points || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">宠物：${escapeHtml(getPetTypeName(pet))}</span>
              </div>
              ${renderXpProgress(pet)}
              <div class="stat-row">
                <span class="stat-label">饥饿值</span>
                <div class="progress"><span style="width:${pet.hunger}%"></span></div>
              </div>
              <div class="stat-row">
                <span class="stat-label">心情值</span>
                <div class="progress"><span style="width:${pet.mood}%"></span></div>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="ghost" data-action="close-student-modal">关闭</button>
          </div>
        </div>
      </div>
    `
      : "";

  return `
    <section class="section">
      <h2>我的宠物</h2>
      <p class="notice">仅教师可进行喂养与积分操作。</p>
      ${students.length ? `
        <div class="grid cols-3">
          ${students
            .map(
              (student) => `
            <div class="card">
              <h3>${escapeHtml(student.name)}</h3>
              <p>学号：${escapeHtml(student.seatNo)}${student.group ? ` · 分组 ${escapeHtml(student.group)}` : ""}</p>
              <button class="ghost" data-action="select-student" data-id="${student.id}">选择</button>
            </div>
          `
            )
            .join("")}
        </div>
      ` : `<p class="notice">暂无学生，请先在教师模式添加。</p>`}
    </section>
    ${modalHtml}
  `;
}

function renderDisplayView() {
  const allStudents = getSortedStudents({ ignoreSearch: true });
  const students = getDisplayStudents();
  const searchTerm = app.ui.displaySearch.trim();
  const selectedId = app.ui.displaySelectedId;
  const selectedStudent = selectedId ? getStudentById(selectedId) : null;
  const selectedPet = selectedStudent ? getPetByStudentId(selectedStudent.id) : null;
  const modalHtml =
    selectedStudent && selectedPet
      ? `
      <div class="modal-overlay" data-action="close-display-modal">
        <div class="modal-card" data-action="noop">
          <h2>宠物详情</h2>
          <div class="pet-card">
            <div class="pet-visual">
              <img src="${getPetIcon(selectedPet)}" alt="宠物" />
              <div class="badge">等级 ${selectedPet.level}</div>
            </div>
            <div class="stat-grid">
              <div class="stat-row">
                <span class="stat-label">${escapeHtml(selectedStudent.name)}（学号 ${escapeHtml(
                  selectedStudent.seatNo
                )}）</span>
                <span class="pill">积分余额：${selectedStudent.points || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">宠物：${escapeHtml(getPetTypeName(selectedPet))}</span>
              </div>
              ${renderXpProgress(selectedPet)}
              <div class="stat-row">
                <span class="stat-label">饥饿值</span>
                <div class="progress"><span style="width:${selectedPet.hunger}%"></span></div>
              </div>
              <div class="stat-row">
                <span class="stat-label">心情值</span>
                <div class="progress"><span style="width:${selectedPet.mood}%"></span></div>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="ghost" data-action="close-display-modal">关闭</button>
          </div>
        </div>
      </div>
    `
      : "";
  if (!allStudents.length) {
    return `
      <section class="section display-stage" data-freeze="${app.ui.displayFreeze ? "true" : "false"}">
        <div class="display-card">
          <h2>暂无学生</h2>
          <p>请先在教师模式添加学生。</p>
          <button class="primary" data-action="go-home">返回主页</button>
        </div>
      </section>
      ${modalHtml}
    `;
  }

  if (!students.length) {
    return `
      <section class="display-stage" data-freeze="${app.ui.displayFreeze ? "true" : "false"}">
        <div class="display-header">
          <div class="badge">展示模式 · 搜索结果</div>
          <div class="display-search">
            <span class="search-label">搜索</span>
            <input id="displaySearch" placeholder="姓名 / 拼音 / 英文 / 学号" value="${escapeHtml(searchTerm)}" />
            <button class="ghost small" data-action="clear-display-search">清除</button>
          </div>
          <div class="pill">共 0 名</div>
        </div>
          <div class="display-card compact">
            <h2>未找到匹配的学生</h2>
            <p>请尝试更短的姓名，或清除搜索条件。</p>
            <div class="display-actions">
              <button class="ghost" data-action="clear-display-search">清除搜索</button>
              <button class="ghost" data-action="go-home">退出展示</button>
            </div>
          </div>
        </section>
        ${modalHtml}
    `;
  }

  const pageSize = app.ui.displayPageSize || 6;
  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const page = clamp(app.ui.displayPage, 0, totalPages - 1);
  app.ui.displayPage = page;

  const start = page * pageSize;
  const slice = students.slice(start, start + pageSize);

  return `
    <section class="display-stage" data-freeze="${app.ui.displayFreeze ? "true" : "false"}">
      <div class="display-header">
        <div class="badge">展示模式 · 第 ${page + 1} / ${totalPages} 页</div>
        <div class="display-search">
          <span class="search-label">搜索</span>
          <input id="displaySearch" placeholder="姓名 / 拼音 / 英文 / 学号" value="${escapeHtml(searchTerm)}" />
          <button class="ghost small" data-action="clear-display-search">清除</button>
        </div>
        <div class="pill">共 ${students.length} 名${searchTerm ? "（已筛选）" : ""}</div>
      </div>
      <div class="display-grid">
        ${slice
          .map((student) => {
            const pet = getPetByStudentId(student.id);
            return `
            <div class="display-card compact">
              <div class="display-title">
                <h3>${escapeHtml(student.name)}</h3>
                <span class="pill">学号 ${escapeHtml(student.seatNo)}</span>
              </div>
              <div class="display-meta">
                <span class="pill">宠物 ${escapeHtml(getPetTypeName(pet))}</span>
                <span class="pill">等级 ${pet.level}</span>
                <span class="pill">积分 ${student.points || 0}</span>
              </div>
              <div class="display-visual">
                <img src="${getPetIcon(pet)}" alt="宠物" data-action="open-display-modal" data-id="${student.id}" />
              </div>
              <div class="stat-row">
                <span class="stat-label">饥饿</span>
                <div class="progress"><span style="width:${pet.hunger}%"></span></div>
              </div>
              <div class="stat-row">
                <span class="stat-label">心情</span>
                <div class="progress"><span style="width:${pet.mood}%"></span></div>
              </div>
              ${renderXpProgress(pet, { compact: true })}
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="display-actions">
        <button class="ghost" data-action="display-prev-page" ${page === 0 ? "disabled" : ""}>上一页</button>
        <button class="ghost" data-action="display-next-page" ${page >= totalPages - 1 ? "disabled" : ""}>下一页</button>
        <button class="ghost" data-action="go-home">退出展示</button>
      </div>
    </section>
    ${modalHtml}
  `;
}

function renderLedgerTable(entries) {
  if (!entries.length) {
    return `<p class="notice">暂无流水记录。</p>`;
  }
  return `
    <table class="table">
      <thead>
        <tr>
          <th>时间</th>
          <th>学生</th>
          <th>变动</th>
          <th>理由</th>
          <th>操作者</th>
        </tr>
      </thead>
      <tbody>
        ${entries
          .map((entry) => {
            const student = getStudentById(entry.studentId);
            const studentName = student ? `${student.name} (学号 ${student.seatNo})` : "-";
            const delta = entry.deltaPoints
              ? `${entry.deltaPoints > 0 ? "+" : ""}${entry.deltaPoints}分`
              : "";
            const effect = [
              entry.deltaHunger ? `饥饿 ${entry.deltaHunger > 0 ? "+" : ""}${entry.deltaHunger}` : "",
              entry.deltaMood ? `心情 ${entry.deltaMood > 0 ? "+" : ""}${entry.deltaMood}` : "",
              entry.deltaXp ? `XP ${entry.deltaXp > 0 ? "+" : ""}${entry.deltaXp}` : ""
            ]
              .filter(Boolean)
              .join(" / ");
            const change = [delta, effect].filter(Boolean).join(" · ") || "-";
            return `
              <tr>
                <td>${formatTime(entry.timestamp)}</td>
                <td>${escapeHtml(studentName)}</td>
                <td>${escapeHtml(change)}</td>
                <td>${escapeHtml(entry.reason || "-")}</td>
                <td>${escapeHtml(entry.operator || "teacher")}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
function awardPoints(studentId, points, reason) {
  const student = getStudentById(studentId);
  if (!student) return;
  const delta = Number(points);
  if (!Number.isFinite(delta) || delta <= 0) {
    showToast("请输入有效的加分数值", "warning");
    return;
  }
  student.points = (student.points || 0) + delta;
  addLedgerEntry({
    timestamp: Date.now(),
    studentId: student.id,
    type: "award",
    deltaPoints: delta,
    reason
  });
  saveData();
  showToast("加分成功", "info");
}

function feedStudent(studentId, catalogId) {
  const student = getStudentById(studentId);
  const pet = getPetByStudentId(studentId);
  const item = app.data.catalog.find((food) => food.id === catalogId);
  if (!student || !pet || !item) return;
  if ((student.points || 0) < item.pricePoints) {
    showToast("积分不足，无法喂养", "warning");
    return;
  }
  const hungerEffect = Number(item.effects.hunger || 0);
  student.points -= item.pricePoints;
  pet.hunger = clamp(pet.hunger - hungerEffect, 0, 100);
  pet.mood = clamp(pet.mood + (item.effects.mood || 0), 0, 100);
  pet.xp += item.effects.xp || 0;
  const newLevel = computeLevel(pet.xp);
  const leveledUp = newLevel > pet.level;
  pet.level = newLevel;
  pet.updatedAt = Date.now();

  addLedgerEntry({
    timestamp: Date.now(),
    studentId: student.id,
    type: "feed",
    deltaPoints: -item.pricePoints,
    deltaHunger: -hungerEffect,
    deltaMood: item.effects.mood || 0,
    deltaXp: item.effects.xp || 0,
    reason: `喂食：${item.name}`
  });

  saveData();
  showToast(leveledUp ? "喂养成功，宠物升级！" : "喂养成功", "info");
}

function exportData() {
  const payload = JSON.stringify(app.data, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}`;
  a.href = url;
  a.download = `class-pet-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("已导出 JSON 文件", "info");
}

function validateImport(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    errors.push("文件内容不是有效 JSON 对象");
    return errors;
  }
  if (typeof data.schemaVersion !== "number") errors.push("缺少 schemaVersion");
  if (!Array.isArray(data.students)) errors.push("缺少 students 列表");
  if (!Array.isArray(data.pets)) errors.push("缺少 pets 列表");
  if (!Array.isArray(data.ledger)) errors.push("缺少 ledger 列表");
  if (!data.config || typeof data.config !== "object") errors.push("缺少 config");
  return errors;
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const errors = validateImport(parsed);
      if (errors.length) {
        showToast(`导入失败：${errors.join("；")}`, "danger");
        return;
      }
      if (!confirm("导入会覆盖当前数据，是否继续？")) {
        return;
      }
      app.data = normalizeData(parsed);
      syncData();
      app.ui.studentSelectedId = null;
      app.ui.editingStudentId = null;
      showToast("导入成功", "info");
      setView("teacher-dashboard");
    } catch (err) {
      console.error(err);
      showToast("导入失败：JSON 解析错误", "danger");
    }
  };
  reader.readAsText(file, "utf-8");
}

function parseStudentCsv(text) {
  const errors = [];
  if (!text) {
    errors.push("CSV 为空");
    return { students: [], errors };
  }
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    errors.push("CSV 为空");
    return { students: [], errors };
  }

  let startIndex = 0;
  const firstLine = lines[0];
  const header = firstLine.split(",").map((cell) => cell.trim().toLowerCase());
  const headerLine = firstLine.replace(/\s+/g, "");
  const hasHeader =
    header.some(
      (cell) =>
        cell.includes("seat") ||
        cell.includes("student") ||
        cell.includes("name") ||
        cell.includes("group") ||
        cell.includes("pinyin") ||
        cell.includes("alias") ||
        cell === "py"
    ) ||
    /学号|姓名|分组|拼音|英文/.test(headerLine);
  if (hasHeader) {
    startIndex = 1;
  }

  const students = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const parts = lines[i].split(",").map((cell) => cell.trim());
    const studentNo = parts[0] || "";
    const name = parts[1] || "";
    const group = parts[2] || "";
    const alias = parts[3] || "";
    if (!studentNo || !name) {
      errors.push(`第 ${i + 1} 行缺少学号或姓名`);
      continue;
    }
    students.push({
      id: makeId("student"),
      seatNo: studentNo,
      name,
      group,
      alias,
      points: 0
    });
  }

  if (!students.length) {
    errors.push("未解析到有效学生");
  }

  return { students, errors };
}

function importStudentsCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const { students, errors } = parseStudentCsv(text);
    if (errors.length) {
      showToast(`导入失败：${errors.slice(0, 2).join("；")}`, "danger");
      return;
    }
    if (!confirm("导入学生名单会覆盖现有学生、宠物与流水，是否继续？")) {
      return;
    }
    app.data.students = students;
    app.data.pets = [];
    app.data.ledger = [];
    syncData();
    showToast("学生名单导入成功", "info");
    setView("teacher-students");
  };
  reader.readAsText(file, "utf-8");
}

function bindEvents() {
  document.getElementById("homeBtn").addEventListener("click", () => setView("home"));
  document.getElementById("teacherBtn").addEventListener("click", () => setView("teacher-dashboard"));
  document.getElementById("displayBtn").addEventListener("click", () => setView("display-view"));
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => logoutTeacher());

  mainEl.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    switch (action) {
      case "go-home":
        setView("home");
        break;
      case "go-teacher":
      case "go-dashboard":
        setView("teacher-dashboard");
        break;
      case "go-students":
        if (!app.auth.teacher) {
          setView("teacher-dashboard");
          return;
        }
        setView("teacher-students");
        break;
      case "go-rewards":
        if (!app.auth.teacher) {
          setView("teacher-dashboard");
          return;
        }
        setView("teacher-rewards");
        break;
      case "go-import":
        if (!app.auth.teacher) {
          setView("teacher-dashboard");
          return;
        }
        setView("teacher-import");
        break;
      case "go-settings":
        if (!app.auth.teacher) {
          setView("teacher-dashboard");
          return;
        }
        setView("teacher-settings");
        break;
      case "go-student":
        setView("student-view");
        break;
      case "go-display":
        setView("display-view");
        break;
      case "logout-teacher":
        logoutTeacher();
        break;
      case "edit-student":
        app.ui.editingStudentId = actionEl.dataset.id;
        setView("teacher-students");
        break;
      case "cancel-edit":
        app.ui.editingStudentId = null;
        render();
        break;
      case "delete-student":
        if (!confirm("确认删除该学生及其宠物档案？")) return;
        app.data.students = app.data.students.filter((student) => student.id !== actionEl.dataset.id);
        app.data.pets = app.data.pets.filter((pet) => pet.studentId !== actionEl.dataset.id);
        app.data.ledger = app.data.ledger.filter((entry) => entry.studentId !== actionEl.dataset.id);
        saveData();
        render();
        showToast("已删除学生", "warning");
        break;
      case "view-student":
        setView("teacher-student-detail", { id: actionEl.dataset.id });
        break;
      case "feed":
        if (!app.auth.teacher) {
          showToast("仅教师可喂养", "warning");
          return;
        }
        feedStudent(app.params.id, actionEl.dataset.id);
        render();
        break;
      case "quick-award": {
        const input = document.getElementById("awardPoints");
        if (input) input.value = actionEl.dataset.value || "";
        break;
      }
      case "select-student":
        app.ui.studentSelectedId = actionEl.dataset.id;
        render();
        break;
      case "open-display-modal":
        app.ui.displaySelectedId = actionEl.dataset.id;
        app.ui.displayFreeze = true;
        preserveScrollPosition(render);
        break;
      case "close-student-modal":
        app.ui.studentSelectedId = null;
        render();
        break;
      case "close-display-modal":
        app.ui.displaySelectedId = null;
        app.ui.displayFreeze = true;
        preserveScrollPosition(render);
        break;
      case "noop":
        break;
      case "export-data":
        exportData();
        break;
      case "reset-data":
        if (!confirm("确认清空所有数据？此操作不可撤销。")) return;
        app.data = clone(DEFAULT_DATA);
        app.ui = {
          ...app.ui,
          studentSearch: "",
          editingStudentId: null,
          studentSelectedId: null,
          displaySearch: "",
          displayPage: 0,
          displaySelectedId: null,
          displayFreeze: false
        };
        app.auth.teacher = false;
        sessionStorage.removeItem("teacherAuthed");
        saveData();
        showToast("数据已清空", "warning");
        setView("home");
        break;
      case "display-prev-page": {
        const students = getDisplayStudents();
        if (!students.length) return;
        const totalPages = Math.max(1, Math.ceil(students.length / (app.ui.displayPageSize || 6)));
        app.ui.displayPage = clamp(app.ui.displayPage - 1, 0, totalPages - 1);
        render();
        break;
      }
      case "display-next-page": {
        const students = getDisplayStudents();
        if (!students.length) return;
        const totalPages = Math.max(1, Math.ceil(students.length / (app.ui.displayPageSize || 6)));
        app.ui.displayPage = clamp(app.ui.displayPage + 1, 0, totalPages - 1);
        render();
        break;
      }
      case "clear-display-search":
        app.ui.displaySearch = "";
        app.ui.displayPage = 0;
        render();
        break;
      default:
        break;
    }
  });

  mainEl.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form.dataset.action) return;
    event.preventDefault();

    switch (form.dataset.action) {
      case "set-pin": {
        const pin = form.pin.value.trim();
        const pinConfirm = form.pinConfirm.value.trim();
        if (!updateAuthError(form, { strict: true })) {
          return;
        }
        app.data.config.teacherPinHash = await hashPin(pin);
        saveData();
        app.auth.teacher = true;
        sessionStorage.setItem("teacherAuthed", "1");
        setAuthError("");
        showToast("PIN 设置成功", "info");
        setView("teacher-dashboard");
        break;
      }
      case "login-pin": {
        const pin = form.pin.value.trim();
        if (!updateAuthError(form, { strict: true })) {
          return;
        }
        const hash = await hashPin(pin);
        if (hash !== app.data.config.teacherPinHash) {
          setAuthError("PIN 不正确");
          return;
        }
        app.auth.teacher = true;
        sessionStorage.setItem("teacherAuthed", "1");
        setAuthError("");
        showToast("欢迎进入教师模式", "info");
        setView("teacher-dashboard");
        break;
      }
      case "change-pin": {
        const currentPin = form.currentPin.value.trim();
        const newPin = form.newPin.value.trim();
        if (!/^\d{4,8}$/.test(newPin)) {
          showToast("新 PIN 必须是 4-8 位数字", "warning");
          return;
        }
        const currentHash = await hashPin(currentPin);
        if (currentHash !== app.data.config.teacherPinHash) {
          showToast("当前 PIN 不正确", "danger");
          return;
        }
        app.data.config.teacherPinHash = await hashPin(newPin);
        saveData();
        showToast("PIN 已更新", "info");
        form.reset();
        break;
      }
      case "save-student": {
        const name = form.name.value.trim();
        const seatNo = form.seatNo.value.trim();
        const group = form.group.value.trim();
        const alias = form.alias ? form.alias.value.trim() : "";
        if (!name || !seatNo) {
          showToast("姓名和学号必填", "warning");
          return;
        }
        const studentId = form.studentId ? form.studentId.value : null;
        if (studentId) {
          const student = getStudentById(studentId);
          if (student) {
            const oldName = student.name;
            student.name = name;
            student.seatNo = seatNo;
            student.group = group;
            student.alias = alias;
            const pet = getPetByStudentId(student.id);
            if (pet && pet.petName.startsWith(oldName)) {
              pet.petName = `${student.name}的小伙伴`;
            }
          }
          app.ui.editingStudentId = null;
          showToast("学生信息已更新", "info");
        } else {
          const newStudent = {
            id: makeId("student"),
            name,
            seatNo,
            group,
            alias,
            points: 0
          };
          app.data.students.push(newStudent);
          app.data.pets.push(createPetForStudent(newStudent));
          showToast("学生已添加", "info");
        }
        saveData();
        form.reset();
        render();
        break;
      }
      case "award-points": {
        const studentId = form.studentId.value;
        const points = Number(form.points.value);
        const reason = form.reasonCustom.value.trim() || form.reasonTemplate.value || "加分";
        awardPoints(studentId, points, reason);
        form.reset();
        render();
        break;
      }
      case "import-data": {
        const fileInput = form.importFile;
        if (!fileInput.files.length) {
          showToast("请选择要导入的文件", "warning");
          return;
        }
        importData(fileInput.files[0]);
        form.reset();
        break;
      }
      case "import-students-csv": {
        if (!app.auth.teacher) {
          showToast("请先进入教师模式", "warning");
          return;
        }
        const fileInput = form.studentCsv;
        if (!fileInput.files.length) {
          showToast("请选择要导入的文件", "warning");
          return;
        }
        importStudentsCsv(fileInput.files[0]);
        form.reset();
        break;
      }
      default:
        break;
    }
  });

  mainEl.addEventListener("compositionstart", (event) => {
    if (event.target.id === "displaySearch") {
      app.ui.displaySearchComposing = true;
    }
  });

  mainEl.addEventListener("compositionend", (event) => {
    if (event.target.id === "displaySearch") {
      app.ui.displaySearchComposing = false;
      app.ui.displaySearch = event.target.value;
      app.ui.displayPage = 0;
      preserveInputFocus("displaySearch", render);
    }
  });

  mainEl.addEventListener("input", (event) => {
    if (app.view === "teacher-dashboard" && !app.auth.teacher) {
      const authForm = event.target.closest("form");
      if (authForm && (authForm.dataset.action === "login-pin" || authForm.dataset.action === "set-pin")) {
        const errorEl = document.getElementById("authError");
        if (errorEl && errorEl.classList.contains("show")) {
          setAuthError("");
        }
      }
    }
    if (event.target.id === "studentSearch") {
      app.ui.studentSearch = event.target.value;
      render();
    }
    if (event.target.id === "displaySearch") {
      if (event.isComposing || app.ui.displaySearchComposing) {
        app.ui.displaySearch = event.target.value;
        return;
      }
      app.ui.displaySearch = event.target.value;
      app.ui.displayPage = 0;
      preserveInputFocus("displaySearch", render);
    }
  });
}

function preserveInputFocus(inputId, updateFn) {
  const active = document.activeElement;
  const keepFocus = active && active.id === inputId;
  const start = keepFocus ? active.selectionStart : null;
  const end = keepFocus ? active.selectionEnd : null;
  updateFn();
  if (!keepFocus) return;
  requestAnimationFrame(() => {
    const next = document.getElementById(inputId);
    if (!next) return;
    next.focus();
    if (start !== null && end !== null) {
      next.setSelectionRange(start, end);
    }
  });
}

function preserveScrollPosition(updateFn) {
  const scrollTop = window.scrollY;
  updateFn();
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollTop, behavior: "auto" });
  });
}

function init() {
  app.data = loadData();
  app.auth.teacher = sessionStorage.getItem("teacherAuthed") === "1";
  syncData();
  bindEvents();
  render();
}

init();
