(function (window) {
  const CP = window.ClassroomPetApp;
  const { constants, state, dom, utils, model } = CP;
  const {
    BACKUP_REMINDER_INTERVAL,
    SEAT_LABEL,
    PIN_RULE_LABEL,
    PIN_HELP_TEXT,
    AWARD_REASON_TEMPLATES,
    PET_TYPES
  } = constants;
  const { app } = state;
  const { mainEl, modeIndicatorEl } = dom;
  const { escapeHtml, showToast, clamp, formatTime } = utils;
  const {
    getStudentById,
    getPetByStudentId,
    getPetType,
    getPetIcon,
    getPetTypeName,
    getPetReAdoptStatus,
    getSortedStudents,
    getDisplayFocusContext,
    getSupervisedFeedVisitedStudentIds,
    getBulkSelectedStudentIds,
    getBulkGroupNames,
    formatBulkGroupLabel,
    getLastUndoBatchSummary,
    getXpProgress
  } = model;

  function setAuthError(message = "") {
    const errorEl = document.getElementById("authError");
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.toggle("show", Boolean(message));
  }

  function isValidPin(pin) {
    return /^[a-zA-Z0-9]{4,8}$/.test(pin);
  }

  function getAuthErrorMessage(form, options = {}) {
    if (!form) return "";
    const strict = options.strict === true;
    const pin = form.pin ? form.pin.value.trim() : "";
    const pinConfirm = form.pinConfirm ? form.pinConfirm.value.trim() : "";
    const isSetPin = form.dataset.action === "set-pin";

    if (strict && !pin) return "请输入 PIN";
    if (pin && !isValidPin(pin)) return "PIN 只能包含字母和数字，长度为 4-8 位";

    if (isSetPin) {
      if (strict && !pinConfirm) return "请确认 PIN";
      if (pinConfirm && !isValidPin(pinConfirm)) return "PIN 只能包含字母和数字，长度为 4-8 位";
      const pinReady = isValidPin(pin);
      const confirmReady = isValidPin(pinConfirm);
      if (pinReady && confirmReady && pin !== pinConfirm) return "两次 PIN 不一致";
    }

    return "";
  }

  function updateAuthError(form, options = {}) {
    const message = getAuthErrorMessage(form, options);
    setAuthError(message);
    return !message;
  }

  function isTeacherManagementView(view = app.view) {
    return typeof view === "string" && view.startsWith("teacher");
  }

  function setView(view, params = {}) {
    if (app.auth.teacher && isTeacherManagementView() && (view === "home" || view === "display-view")) {
      showToast("请先退出教师模式", "warning");
      return false;
    }
    const leavingDisplay = app.view === "display-view" && view !== "display-view";
    const leavingSupervisedFeed = app.view === "supervised-feed-view" && view !== "supervised-feed-view";
    if (leavingDisplay) {
      app.ui.displaySearch = "";
      app.ui.displayPage = 0;
      app.ui.displaySelectedId = null;
      app.ui.displayFreeze = false;
    }
    if (leavingSupervisedFeed) {
      resetSupervisedFeedSession();
    }
    app.view = view;
    app.params = params;
    render();
    return true;
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

  function resetSupervisedFeedSession() {
    app.ui.supervisedFeedSessionActive = false;
    app.ui.supervisedFeedStudentId = null;
    app.ui.supervisedFeedVisitedStudentIds = [];
    app.ui.supervisedFeedReAdoptDraftTypeId = null;
  }

  function startSupervisedFeedSession() {
    app.ui.supervisedFeedSessionActive = true;
    app.ui.supervisedFeedStudentId = null;
    app.ui.supervisedFeedVisitedStudentIds = [];
    app.ui.supervisedFeedReAdoptDraftTypeId = null;
  }

  function markSupervisedFeedVisited(studentId) {
    if (!studentId) return;
    const visitedIds = getSupervisedFeedVisitedStudentIds();
    if (visitedIds.includes(studentId)) {
      app.ui.supervisedFeedVisitedStudentIds = visitedIds;
      return;
    }
    app.ui.supervisedFeedVisitedStudentIds = [...visitedIds, studentId];
  }

  function selectSupervisedFeedStudent(studentId) {
    const student = getStudentById(studentId);
    const pet = getPetByStudentId(studentId);
    if (!app.ui.supervisedFeedSessionActive || !student || !pet) {
      showToast("请先选择有效的学生", "warning");
      return;
    }
    markSupervisedFeedVisited(studentId);
    app.ui.supervisedFeedStudentId = studentId;
    app.ui.supervisedFeedReAdoptDraftTypeId = null;
    render();
  }

  function leaveSupervisedFeedStudent() {
    app.ui.supervisedFeedStudentId = null;
    app.ui.supervisedFeedReAdoptDraftTypeId = null;
    render();
  }

  function selectSupervisedFeedReAdoptType(typeId) {
    if (!app.auth.teacher || !app.ui.supervisedFeedSessionActive || !app.ui.supervisedFeedStudentId) {
      showToast("请先由老师开启班会喂养会话", "warning");
      return;
    }

    if (!PET_TYPES.some((type) => type.id === typeId)) {
      showToast("请选择有效的宠物类型", "warning");
      return;
    }

    app.ui.supervisedFeedReAdoptDraftTypeId = typeId;
    render();
  }

  function endSupervisedFeedSession() {
    if (!app.ui.supervisedFeedSessionActive) {
      setView("teacher-dashboard");
      return;
    }
    if (!confirm("确认结束本次班会喂养会话？结束后将返回教师模式。")) {
      return;
    }
    showToast("班会喂养会话已结束", "info");
    setView("teacher-dashboard");
  }

  function openDisplayFocus(studentId) {
    if (!studentId) return;
    setDisplayMotion("enter");
    app.ui.displaySelectedId = studentId;
    app.ui.displayFreeze = true;
    (CP.preserveScrollPosition || ((updateFn) => updateFn()))(render);
  }

  function closeDisplayFocus() {
    if (!app.ui.displaySelectedId) return;
    setDisplayMotion("");
    app.ui.displaySelectedId = null;
    app.ui.displayFreeze = true;
    (CP.preserveScrollPosition || ((updateFn) => updateFn()))(render);
  }

  function stepDisplayFocus(step) {
    const focus = getDisplayFocusContext();
    if (!focus.hasFocus) return;
    const nextStudent = focus.students[focus.index + step];
    if (!nextStudent) return;
    setDisplayMotion(step > 0 ? "next" : "prev");
    app.ui.displaySelectedId = nextStudent.id;
    app.ui.displayFreeze = true;
    (CP.preserveScrollPosition || ((updateFn) => updateFn()))(render);
  }

  function shouldIgnoreDisplayHotkeyTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tagName = target.tagName;
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  }

  function setDisplayMotion(motion) {
    app.ui.displayMotion = motion || "";
    if (state.displayMotionResetTimer) {
      clearTimeout(state.displayMotionResetTimer);
      state.displayMotionResetTimer = null;
    }
    if (!motion) return;
    state.displayMotionResetTimer = setTimeout(() => {
      app.ui.displayMotion = "";
      state.displayMotionResetTimer = null;
    }, 320);
  }

  function getLastBackupText() {
    return app.data.config.lastBackupAt ? formatTime(app.data.config.lastBackupAt) : "还没有备份";
  }

  function shouldShowBackupReminder() {
    const lastBackupAt = Number(app.data.config.lastBackupAt || 0);
    return !lastBackupAt || Date.now() - lastBackupAt >= BACKUP_REMINDER_INTERVAL;
  }

  function renderBackupReminder() {
    if (!shouldShowBackupReminder()) return "";

    return `
      <section class="section banner-section">
        <div class="banner-card">
          <div>
            <span class="badge">备份提醒</span>
            <h2>当前数据保存在这台电脑的浏览器里</h2>
            <p>建议定期导出一份备份文件。最近一次备份：${escapeHtml(getLastBackupText())}</p>
          </div>
          <div class="form-actions">
            <button class="primary" data-action="export-data">立即备份</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderSetupChecklist() {
    if (app.data.students.length > 0) return "";

    return `
      <section class="section">
        <div class="section-header">
          <h2>首次使用 3 步</h2>
          <span class="pill">先完成一次班级初始化</span>
        </div>
        <div class="grid cols-3">
          <div class="card task-card">
            <span class="badge">第 1 步</span>
            <h3>导入学生名单</h3>
            <p>推荐先从 CSV 导入，省去逐个录入的时间。</p>
            <button class="primary" data-action="go-import">去导入</button>
          </div>
          <div class="card task-card">
            <span class="badge">第 2 步</span>
            <h3>检查学生列表</h3>
            <p>确认姓名、座号/学号、分组都正确。</p>
            <button class="ghost" data-action="go-students">查看学生</button>
          </div>
          <div class="card task-card">
            <span class="badge">第 3 步</span>
            <h3>开始课堂使用</h3>
            <p>可以先给一位学生加分，再进入班会喂养模式体验首次重新领养与喂养。</p>
            <div class="form-actions">
              <button class="ghost" data-action="go-rewards">发放奖励</button>
              <button class="ghost" data-action="go-supervised-feed">班会喂养</button>
            </div>
          </div>
        </div>
      </section>
    `;
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

  function render() {
    updateHeaderButtons();
    const displayFreeze = app.ui.displayFreeze;

    if (app.view === "display-view") {
      document.body.classList.add("display-mode");
    } else {
      document.body.classList.remove("display-mode");
    }
    document.body.classList.toggle("supervised-feed-mode", app.view === "supervised-feed-view");
    document.body.classList.toggle(
      "display-modal-open",
      app.view === "display-view" && getDisplayFocusContext().hasFocus
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
        setModeIndicator("查看宠物");
        mainEl.innerHTML = renderStudentView();
        break;
      case "supervised-feed-view":
        setModeIndicator("班会喂养");
        mainEl.innerHTML = renderSupervisedFeedView();
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
    return `
      <section class="landing">
        <div class="landing-title-wrap">
          <img src="assets/pet.svg" alt="宠物图标" class="landing-icon" />
          <h1 class="landing-title">班级电子宠物管理系统</h1>
          <p class="landing-subtitle">请选择进入方式继续</p>
        </div>
        <div class="landing-card">
          <div class="landing-actions">
            <button class="primary" data-action="go-teacher">进入教师模式</button>
            <button class="accent" data-action="go-display">进入展示模式</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderTeacherLogin() {
    const pinState = CP.actions.getTeacherPinState();
    if (pinState === "unset") {
      return `
        <section class="landing landing-auth">
          <div class="landing-title-wrap">
            <img src="assets/pet.svg" alt="宠物图标" class="landing-icon" />
            <h1 class="landing-title">设置教师 PIN</h1>
            <p class="landing-subtitle">首次使用请先设置一个教师 PIN，用来保护管理入口</p>
          </div>
          <div class="landing-card">
            <form class="landing-form" data-action="set-pin">
              <div class="landing-field">
                <label>设置 PIN（${PIN_RULE_LABEL}）</label>
                <input type="password" name="pin" minlength="4" maxlength="8" autocomplete="new-password" required />
              </div>
              <div class="landing-field">
                <label>确认 PIN</label>
                <input type="password" name="pinConfirm" minlength="4" maxlength="8" autocomplete="new-password" required />
              </div>
              <button class="primary" type="submit">保存并进入教师模式</button>
            </form>
            <p class="landing-hint">${PIN_HELP_TEXT}</p>
            <p id="authError" class="landing-error" role="alert"></p>
            <div class="landing-links">
              <button class="text-link" type="button" data-action="go-home">返回主页</button>
            </div>
          </div>
        </section>
      `;
    }

    if (app.ui.authScreen === "recover") {
      return `
        <section class="landing landing-auth">
          <div class="landing-title-wrap">
            <img src="assets/pet.svg" alt="宠物图标" class="landing-icon" />
            <h1 class="landing-title">重新设置教师 PIN</h1>
            <p class="landing-subtitle">请输入恢复码，并设置新的教师 PIN</p>
          </div>
          <div class="landing-card">
            ${pinState === "corrupt" ? `<p class="notice">检测到教师 PIN 配置已损坏，请使用恢复码重新设置。</p>` : ""}
            <form class="landing-form" data-action="recover-pin">
              <div class="landing-field">
                <label>恢复码</label>
                <input type="password" name="recoveryCode" inputmode="numeric" autocomplete="one-time-code" required />
              </div>
              <div class="landing-field">
                <label>新 PIN（${PIN_RULE_LABEL}）</label>
                <input type="password" name="newPin" minlength="4" maxlength="8" autocomplete="new-password" required />
              </div>
              <div class="landing-field">
                <label>确认新 PIN</label>
                <input type="password" name="newPinConfirm" minlength="4" maxlength="8" autocomplete="new-password" required />
              </div>
              <button class="primary" type="submit">验证恢复码并重设 PIN</button>
            </form>
            <p class="landing-hint">${PIN_HELP_TEXT}</p>
            <p id="authError" class="landing-error" role="alert"></p>
            <div class="landing-links">
              <button class="text-link" type="button" data-action="go-auth-login">返回登录</button>
              <button class="text-link" type="button" data-action="go-home">返回主页</button>
            </div>
          </div>
        </section>
      `;
    }

    const isCorrupt = pinState === "corrupt";
    const loginDisabledAttr = isCorrupt ? "disabled" : "";
    const subtitle = isCorrupt ? "教师 PIN 配置已损坏，请使用恢复码重新设置" : "请输入教师 PIN 进入教师模式";
    return `
      <section class="landing landing-auth">
          <div class="landing-title-wrap">
            <img src="assets/pet.svg" alt="宠物图标" class="landing-icon" />
            <h1 class="landing-title">教师登录</h1>
            <p class="landing-subtitle">${subtitle}</p>
           </div>
        <div class="landing-card">
          ${isCorrupt ? `<p class="notice">教师 PIN 配置已损坏，请点击“重新设置 PIN”后输入恢复码修复。</p>` : ""}
          <form class="landing-form" data-action="login-pin">
            <div class="landing-field">
              <label>教师 PIN（${PIN_RULE_LABEL}）</label>
              <input
                type="password"
                name="pin"
                minlength="4"
                maxlength="8"
                autocomplete="current-password"
                ${loginDisabledAttr}
                ${isCorrupt ? 'placeholder="请先重新设置 PIN"' : ""}
                required
              />
            </div>
            <button class="primary" type="submit" ${loginDisabledAttr}>进入教师模式</button>
          </form>
          <p class="landing-hint">${isCorrupt ? "当前无法使用原 PIN 登录，请先完成恢复。" : PIN_HELP_TEXT}</p>
          <p id="authError" class="landing-error" role="alert"></p>
          <div class="landing-links">
            <button class="text-link" type="button" data-action="go-auth-recover">重新设置 PIN</button>
            <button class="text-link" type="button" data-action="go-home">返回主页</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderTeacherDashboard() {
    const recentLedger = app.data.ledger.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
    return `
      ${renderBackupReminder()}
      ${renderSetupChecklist()}
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
          <button class="accent" data-action="go-supervised-feed">班会喂养</button>
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
    const selectedIds = getBulkSelectedStudentIds();
    const selectedIdSet = new Set(selectedIds);
    const selectedCount = selectedIds.length;
    const groupNames = getBulkGroupNames();
    const filteredIds = students.map((student) => student.id);
    const hasUndoBatch = Boolean(app.data.meta.lastUndoBatch);

    return `
      ${hasUndoBatch ? `
        <section class="section undo-section">
          <div class="undo-banner">
            <div>
              <span class="badge">可撤销</span>
              <h2>最近一次批量加分可撤销</h2>
              <p>${escapeHtml(getLastUndoBatchSummary())}</p>
            </div>
            <div class="form-actions">
              <button class="ghost" data-action="undo-last-bulk-award">撤销最近一次批量操作</button>
            </div>
          </div>
        </section>
      ` : ""}
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
              <label>${SEAT_LABEL}</label>
              <input name="seatNo" required value="${editing ? escapeHtml(editing.seatNo) : ""}" />
            </div>
            <div>
              <label>分组（可选）</label>
              <input name="group" value="${editing ? escapeHtml(editing.group || "") : ""}" />
            </div>
          </div>
          <p class="field-hint">拼音搜索会自动生成，无需手动填写拼音或英文名。</p>
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
            <input id="studentSearch" placeholder="姓名 / 拼音 / ${SEAT_LABEL} / 分组" value="${escapeHtml(app.ui.studentSearch)}" />
          </div>
        </div>
        ${students.length ? `
          <div class="bulk-toolbar">
            <div class="bulk-toolbar-summary">
              <span class="badge">已选 ${selectedCount} 名</span>
              <span class="field-hint">搜索条件变化不会清空已选学生。</span>
            </div>
            <div class="bulk-toolbar-actions">
              <button class="ghost small" data-action="select-bulk-filtered" ${filteredIds.length ? "" : "disabled"}>全选当前筛选结果</button>
              ${groupNames
                .map(
                  (group) => `
                    <button class="ghost small" data-action="select-bulk-group" data-group="${escapeHtml(group)}">${escapeHtml(formatBulkGroupLabel(group))}</button>
                  `
                )
                .join("")}
              <button class="ghost small" data-action="clear-bulk-selection" ${selectedCount ? "" : "disabled"}>清空选择</button>
            </div>
          </div>
        ` : ""}
        <div class="section-header">
          <h2>学生列表</h2>
          <button class="primary" data-action="go-dashboard">返回仪表盘</button>
        </div>
        ${students.length ? `
          <table class="table">
            <thead>
              <tr>
                <th class="select-col">选择</th>
                <th>${SEAT_LABEL}</th>
                <th>姓名</th>
                <th>分组</th>
                <th>积分</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${students
                .map(
                  (student) => `
                <tr class="${selectedIdSet.has(student.id) ? "selected-row" : ""}">
                  <td class="select-cell">
                    <input
                      type="checkbox"
                      class="student-checkbox"
                      data-action="toggle-bulk-student"
                      data-id="${student.id}"
                      ${selectedIdSet.has(student.id) ? "checked" : ""}
                    />
                  </td>
                  <td>${escapeHtml(student.seatNo)}</td>
                  <td>${escapeHtml(student.name)}</td>
                  <td>${escapeHtml(student.group || "-")}</td>
                  <td>${student.points || 0}</td>
                  <td>
                    <div class="table-actions">
                      <button class="ghost small" data-action="quick-student-award" data-id="${student.id}" data-points="1">+1</button>
                      <button class="ghost small" data-action="quick-student-award" data-id="${student.id}" data-points="2">+2</button>
                      <button class="ghost small" data-action="quick-student-award" data-id="${student.id}" data-points="5">+5</button>
                      <button class="text" data-action="view-student" data-id="${student.id}">详情</button>
                      <button class="text" data-action="edit-student" data-id="${student.id}">编辑</button>
                      <button class="text" data-action="delete-student" data-id="${student.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        ` : `<p class="notice">还没有学生，请先添加。</p>`}
      </section>

      ${selectedCount ? `
        <section class="section">
          <div class="section-header">
            <h2>批量加分</h2>
            <span class="pill">统一给已选学生发放同样的奖励</span>
          </div>
          <div class="form-actions compact-actions">
            <button class="ghost small" data-action="bulk-quick-award" data-points="1">已选学生 +1</button>
            <button class="ghost small" data-action="bulk-quick-award" data-points="2">已选学生 +2</button>
            <button class="ghost small" data-action="bulk-quick-award" data-points="5">已选学生 +5</button>
          </div>
          <form data-action="bulk-award">
            <div class="form-row">
              <div>
                <label>自定义加分数值</label>
                <input
                  id="bulkPointsDraft"
                  name="bulkPoints"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="例如：3"
                  value="${escapeHtml(app.ui.bulkPointsDraft)}"
                />
              </div>
              <div>
                <label>理由模板</label>
                <select id="bulkReasonTemplateDraft" name="bulkReasonTemplate">
                  <option value="">请选择理由</option>
                  ${AWARD_REASON_TEMPLATES
                    .map(
                      (reason) => `
                        <option value="${escapeHtml(reason)}" ${app.ui.bulkReasonTemplateDraft === reason ? "selected" : ""}>${escapeHtml(reason)}</option>
                      `
                    )
                    .join("")}
                </select>
              </div>
              <div>
                <label>自定义理由（可选）</label>
                <input
                  id="bulkReasonCustomDraft"
                  name="bulkReasonCustom"
                  placeholder="例如：小组合作认真"
                  value="${escapeHtml(app.ui.bulkReasonCustomDraft)}"
                />
              </div>
            </div>
            <div class="form-actions">
              <button class="primary" type="submit">批量加分</button>
            </div>
          </form>
        </section>
      ` : ""}
    `;
  }

  function renderTeacherRewards() {
    const students = getSortedStudents();
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
                    <option value="${student.id}">${SEAT_LABEL} ${escapeHtml(student.seatNo)} ${escapeHtml(student.name)}</option>
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
                  ${AWARD_REASON_TEMPLATES.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join("")}
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
              <span class="stat-label">姓名：${escapeHtml(student.name)}（${SEAT_LABEL} ${escapeHtml(student.seatNo)}）</span>
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
      ${renderBackupReminder()}
      <section class="section">
        <h2>导出备份</h2>
        <p>备份文件会保存学生、宠物、积分、流水和系统设置。</p>
        <div class="pill-list">
          <span class="pill">最近一次备份：${escapeHtml(getLastBackupText())}</span>
        </div>
        <button class="primary" data-action="export-data">立即备份</button>
      </section>

      <section class="section">
        <h2>导入数据</h2>
        <p class="notice">导入会覆盖当前数据。确认后，系统会先自动下载一份当前备份文件，再继续导入。</p>
        <form data-action="import-data">
          <div class="form-row">
            <div>
              <label>选择备份 JSON 文件</label>
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
        <p class="notice">支持格式：${SEAT_LABEL},姓名,分组。第 4 列拼音/英文名可留空；确认后，系统会先自动下载一份当前备份文件，再继续导入。</p>
        <div class="pill-list">
          <span class="pill">示例：1,王晨曦,A</span>
          <span class="pill">示例：2,李一凡,</span>
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
      ${renderBackupReminder()}
      <section class="section">
        <h2>修改教师 PIN</h2>
        <form data-action="change-pin">
          <div class="form-row">
            <div>
              <label>当前 PIN</label>
              <input type="password" name="currentPin" autocomplete="current-password" required />
            </div>
            <div>
              <label>新 PIN（${PIN_RULE_LABEL}）</label>
              <input type="password" name="newPin" minlength="4" maxlength="8" autocomplete="new-password" required />
            </div>
          </div>
          <p class="field-hint">${PIN_HELP_TEXT}</p>
          <div class="form-actions">
            <button class="primary" type="submit">更新 PIN</button>
            <button class="ghost" type="button" data-action="go-dashboard">返回仪表盘</button>
          </div>
        </form>
      </section>

      <section class="section">
        <h2>系统信息</h2>
        <div class="pill-list">
          <span class="pill">数据版本 v${app.data.schemaVersion}</span>
          <span class="pill">升级阈值：每 ${app.data.config.rules.xpPerLevel} XP 提升 1 级</span>
          <span class="pill">最近一次备份：${escapeHtml(getLastBackupText())}</span>
        </div>
      </section>

      <section class="section">
        <h2>危险操作</h2>
        <p class="notice">清空会删除当前浏览器里的所有数据。确认后，系统会先自动下载一份备份文件。</p>
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
                  <span class="stat-label">${escapeHtml(selectedStudent.name)}（${SEAT_LABEL} ${escapeHtml(
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
        <h2>查看宠物</h2>
        <p class="notice">这里只能查看宠物状态；加分和喂养仍由老师操作。</p>
        ${students.length ? `
          <div class="grid cols-3">
            ${students
              .map(
                (student) => `
              <div class="card">
                <h3>${escapeHtml(student.name)}</h3>
                <p>${SEAT_LABEL}：${escapeHtml(student.seatNo)}${student.group ? ` · 分组 ${escapeHtml(student.group)}` : ""}</p>
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

  function renderSupervisedFeedView() {
    if (!app.auth.teacher) {
      return `
        <section class="section">
          <div class="section-header">
            <h2>班会喂养模式</h2>
            <button class="primary" data-action="go-dashboard">返回教师模式</button>
          </div>
          <p class="notice">请先进入教师模式，再由老师开启班会喂养会话。</p>
        </section>
      `;
    }

    if (!app.ui.supervisedFeedSessionActive) {
      return `
        <section class="section">
          <div class="section-header">
            <h2>班会喂养模式</h2>
            <button class="primary" data-action="go-dashboard">返回教师模式</button>
          </div>
          <p class="notice">当前没有进行中的班会喂养会话，请从教师首页重新开启。</p>
        </section>
      `;
    }

    const students = getSortedStudents({ ignoreSearch: true });
    const visitedIds = getSupervisedFeedVisitedStudentIds();
    const visitedIdSet = new Set(visitedIds);
    let selectedStudent = app.ui.supervisedFeedStudentId ? getStudentById(app.ui.supervisedFeedStudentId) : null;
    let pet = selectedStudent ? getPetByStudentId(selectedStudent.id) : null;

    if (app.ui.supervisedFeedStudentId && (!selectedStudent || !pet)) {
      app.ui.supervisedFeedStudentId = null;
      app.ui.supervisedFeedReAdoptDraftTypeId = null;
      selectedStudent = null;
      pet = null;
    }

    const sessionHeader = `
      <section class="section supervised-feed-shell">
        <div class="supervised-feed-session">
          <div class="supervised-feed-session-copy">
            <span class="badge">班会喂养模式</span>
            <h2>${selectedStudent ? `${escapeHtml(selectedStudent.name)} 的回合` : "请同学选择自己"}</h2>
            <p>
              ${selectedStudent
                ? "可以连续喂养多次，也可以本次先不喂、继续攒分后返回名单。"
                : "老师已开启受监督喂养会话。请学生从名单中选择自己，完成后返回名单，由老师手动结束会话。"}
            </p>
          </div>
          <div class="supervised-feed-session-meta">
            <span class="pill">本轮已轮到 ${visitedIds.length} / ${students.length} 人</span>
            <span class="pill">${selectedStudent ? `当前：${escapeHtml(selectedStudent.name)}` : "当前：等待选择"}</span>
            <button class="danger" data-action="end-supervised-feed-session">结束会话</button>
          </div>
        </div>
      </section>
    `;

    if (!students.length) {
      return `
        ${sessionHeader}
        <section class="section">
          <p class="notice">还没有学生，请先返回教师模式添加学生后再开启班会喂养。</p>
        </section>
      `;
    }

    if (!selectedStudent || !pet) {
      return `
        ${sessionHeader}
        <section class="section supervised-feed-shell">
          <p class="notice">请学生按座号顺序点击自己的卡片进入。本轮已轮到的同学会被标记，但仍可再次进入。</p>
          <div class="grid cols-3 supervised-feed-grid">
            ${students
              .map((student) => {
                const studentPet = getPetByStudentId(student.id);
                if (!studentPet) return "";
                const visited = visitedIdSet.has(student.id);
                return `
                  <article class="card supervised-feed-student-card${visited ? " is-visited" : ""}">
                    <div class="supervised-feed-card-head">
                      <h3>${escapeHtml(student.name)}</h3>
                      <span class="pill">${SEAT_LABEL} ${escapeHtml(student.seatNo)}</span>
                    </div>
                    <div class="pill-list">
                      <span class="pill">积分 ${student.points || 0}</span>
                      <span class="pill">宠物 ${escapeHtml(getPetTypeName(studentPet))}</span>
                      ${student.group ? `<span class="pill">分组 ${escapeHtml(student.group)}</span>` : ""}
                      <span class="pill${visited ? " supervised-feed-visited-pill" : ""}">
                        ${visited ? "本轮已轮到" : "等待选择"}
                      </span>
                    </div>
                    <button
                      class="${visited ? "ghost" : "accent"}"
                      data-action="select-supervised-feed-student"
                      data-id="${student.id}"
                    >
                      ${visited ? "再次进入" : "选择我"}
                    </button>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `;
    }

    const reAdoptStatus = getPetReAdoptStatus(selectedStudent.id, pet);
    const reAdoptDraftTypeId =
      app.ui.supervisedFeedReAdoptDraftTypeId &&
      app.ui.supervisedFeedReAdoptDraftTypeId !== pet.petType &&
      PET_TYPES.some((type) => type.id === app.ui.supervisedFeedReAdoptDraftTypeId)
        ? app.ui.supervisedFeedReAdoptDraftTypeId
        : null;
    const selectedReAdoptType = reAdoptDraftTypeId ? getPetType(reAdoptDraftTypeId) : null;
    const reAdoptSection = reAdoptStatus.available
      ? `
        <section class="section">
          <div class="section-header">
            <h2>一次重新领养机会</h2>
            <span class="pill">每人仅 1 次</span>
          </div>
          <p class="notice">${escapeHtml(reAdoptStatus.message)}</p>
          <div class="grid cols-3 supervised-feed-type-grid">
            ${PET_TYPES.map((type) => {
              const isCurrent = type.id === pet.petType;
              const isSelected = type.id === reAdoptDraftTypeId;
              return `
                <article class="card supervised-feed-type-card${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}">
                  <img src="${type.icon}" alt="${escapeHtml(type.name)}" />
                  <h3>${escapeHtml(type.name)}</h3>
                  <p>${isCurrent ? "这是你当前的宠物" : "可以改为这个宠物类型"}</p>
                  <button
                    class="${isCurrent ? "ghost" : isSelected ? "primary" : "accent"}"
                    data-action="select-supervised-feed-pet-type"
                    data-id="${type.id}"
                    ${isCurrent ? "disabled" : ""}
                  >
                    ${isCurrent ? "当前宠物" : isSelected ? "已选中" : "选这个"}
                  </button>
                </article>
              `;
            }).join("")}
          </div>
          <div class="form-actions compact-actions supervised-feed-re-adopt-actions">
            <span class="pill">${selectedReAdoptType ? `已选择：${escapeHtml(selectedReAdoptType.name)}` : "请先选择一种新的宠物"}</span>
            <button
              class="${selectedReAdoptType ? "accent" : "ghost"}"
              data-action="confirm-supervised-re-adopt"
              ${selectedReAdoptType ? "" : "disabled"}
            >
              确认重新领养
            </button>
          </div>
        </section>
      `
      : `
        <section class="section">
          <div class="section-header">
            <h2>一次重新领养机会</h2>
            <span class="pill">每人仅 1 次</span>
          </div>
          <p class="notice">${escapeHtml(reAdoptStatus.message)}</p>
        </section>
      `;

    return `
      ${sessionHeader}
      <section class="section">
        <div class="section-header">
          <h2>当前学生</h2>
          <div class="form-actions compact-actions">
            <button class="ghost" data-action="return-supervised-feed-roster">返回名单</button>
            <button class="ghost" data-action="skip-supervised-feed">本次先不喂，继续攒分</button>
          </div>
        </div>
        <div class="pet-card">
          <div class="pet-visual">
            <img src="${getPetIcon(pet)}" alt="宠物" />
            <div class="badge">等级 ${pet.level}</div>
          </div>
          <div class="stat-grid">
            <div class="stat-row">
              <span class="stat-label">姓名：${escapeHtml(selectedStudent.name)}（${SEAT_LABEL} ${escapeHtml(
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
      </section>

      ${reAdoptSection}

      <section class="section">
        <div class="section-header">
          <h2>选择食物</h2>
          <span class="pill">${reAdoptStatus.available ? "可先重新领养，再继续喂养" : "可以连续喂养多次"}</span>
        </div>
        <div class="grid cols-3">
          ${app.data.catalog
            .map((item) => {
              const disabled = (selectedStudent.points || 0) < item.pricePoints;
              return `
                <div class="card supervised-feed-food-card">
                  <h3>${escapeHtml(item.name)}</h3>
                  <p>价格：${item.pricePoints} 积分</p>
                  <p>效果：${formatEffects(item.effects)}</p>
                  <button
                    class="${disabled ? "ghost" : "accent"}"
                    data-action="supervised-feed"
                    data-id="${item.id}"
                    ${disabled ? "disabled" : ""}
                  >
                    ${disabled ? "积分不足" : "喂食"}
                  </button>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  function renderDisplayView() {
    const allStudents = getSortedStudents({ ignoreSearch: true });
    const searchTerm = app.ui.displaySearch.trim();
    let focus = getDisplayFocusContext();
    if (focus.invalidSelection) {
      app.ui.displaySelectedId = null;
      focus = getDisplayFocusContext();
    }

    const students = focus.students;
    const hasFocus = focus.hasFocus;
    const focusMotionClass = hasFocus && app.ui.displayMotion ? ` display-focus-card-${app.ui.displayMotion}` : "";
    const focusHtml = hasFocus
      ? `
        <div class="modal-overlay display-focus-overlay" data-action="close-display-modal">
          <div
            class="modal-card display-focus-card${focusMotionClass}"
            data-action="noop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="displayFocusTitle"
          >
            <div class="display-focus-shell">
              <section class="display-focus-hero">
                <div class="display-focus-badges">
                  <span class="badge">单人聚焦</span>
                  <span class="pill">宠物 ${escapeHtml(getPetTypeName(focus.pet))}</span>
                </div>
                <div class="display-focus-visual">
                  <img src="${getPetIcon(focus.pet)}" alt="${escapeHtml(focus.student.name)}的宠物" />
                  <div class="badge">等级 ${focus.pet.level}</div>
                </div>
              </section>
              <section class="display-focus-panel">
                <div class="display-focus-heading">
                  <h2 id="displayFocusTitle">${escapeHtml(focus.student.name)}</h2>
                  <p class="display-focus-subtitle">${SEAT_LABEL} ${escapeHtml(focus.student.seatNo)}</p>
                </div>
                <div class="display-focus-meta">
                  <span class="pill">积分 ${focus.student.points || 0}</span>
                  ${focus.student.group ? `<span class="pill">分组 ${escapeHtml(focus.student.group)}</span>` : ""}
                  <span class="pill">宠物 ${escapeHtml(getPetTypeName(focus.pet))}</span>
                </div>
                <div class="stat-grid">
                  ${renderXpProgress(focus.pet)}
                  <div class="stat-row">
                    <span class="stat-label">饥饿值</span>
                    <div class="progress"><span style="width:${focus.pet.hunger}%"></span></div>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">心情值</span>
                    <div class="progress"><span style="width:${focus.pet.mood}%"></span></div>
                  </div>
                </div>
                <div class="display-focus-interaction">
                  <div class="display-focus-interaction-head">
                    <h3>互动区（即将开放）</h3>
                    <span class="pill">首版仅展示</span>
                  </div>
                  <p>这里会承载课堂展示时学生与宠物的即时互动反馈。</p>
                  <div class="display-focus-placeholder-actions">
                    <button class="ghost" type="button" disabled>喂一口</button>
                    <button class="ghost" type="button" disabled>打招呼</button>
                    <button class="ghost" type="button" disabled>鼓励一下</button>
                  </div>
                </div>
              </section>
            </div>
            <div class="display-focus-nav">
              <button class="ghost" type="button" data-action="display-prev-student" ${focus.hasPrev ? "" : "disabled"}>
                上一位
              </button>
              <button class="ghost" type="button" data-action="display-next-student" ${focus.hasNext ? "" : "disabled"}>
                下一位
              </button>
              <button class="primary" type="button" data-action="close-display-modal">返回看板</button>
            </div>
          </div>
        </div>
      `
      : "";
    if (!allStudents.length) {
      return `
        <section class="section display-stage" data-freeze="${app.ui.displayFreeze ? "true" : "false"}">
          <div class="display-board">
            <div class="display-card">
              <h2>暂无学生</h2>
              <p>请先在教师模式添加学生。</p>
              <button class="primary" data-action="go-home">返回主页</button>
            </div>
          </div>
          ${focusHtml}
        </section>
      `;
    }

    if (!students.length) {
      return `
        <section class="display-stage" data-freeze="${app.ui.displayFreeze ? "true" : "false"}">
          <div class="display-board">
            <div class="display-header">
              <div class="badge">展示模式 · 搜索结果</div>
              <div class="display-search">
                <span class="search-label">搜索</span>
                <input id="displaySearch" placeholder="姓名 / 拼音 / ${SEAT_LABEL}" value="${escapeHtml(searchTerm)}" />
                <button class="ghost small" data-action="clear-display-search">清除</button>
              </div>
              <div class="pill">共 0 名</div>
            </div>
            <div class="display-card compact">
              <h2>未找到匹配的学生</h2>
              <p>请尝试更短的姓名，或清除搜索条件。</p>
              <div class="display-actions">
                <button class="ghost" data-action="clear-display-search">清除搜索</button>
                <button class="ghost" data-action="go-home">返回主页</button>
              </div>
            </div>
          </div>
          ${focusHtml}
        </section>
      `;
    }

    const pageSize = app.ui.displayPageSize || 6;
    const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
    const page = clamp(app.ui.displayPage, 0, totalPages - 1);
    app.ui.displayPage = page;

    const start = page * pageSize;
    const slice = students.slice(start, start + pageSize);
    const cardsHtml = slice
      .map((student) => {
        const pet = getPetByStudentId(student.id);
        if (!pet) return "";
        return `
          <article
            class="display-card compact display-focus-trigger"
            tabindex="0"
            role="button"
            aria-haspopup="dialog"
            aria-label="查看 ${escapeHtml(student.name)} 的宠物聚焦展示"
            data-action="open-display-modal"
            data-id="${student.id}"
          >
            <div class="display-title">
              <h3>${escapeHtml(student.name)}</h3>
              <span class="pill">${SEAT_LABEL} ${escapeHtml(student.seatNo)}</span>
            </div>
            <div class="display-meta">
              <span class="pill">宠物 ${escapeHtml(getPetTypeName(pet))}</span>
              <span class="pill">等级 ${pet.level}</span>
              <span class="pill">积分 ${student.points || 0}</span>
            </div>
            <div class="display-visual">
              <img src="${getPetIcon(pet)}" alt="${escapeHtml(student.name)}的宠物" />
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
          </article>
        `;
      })
      .join("");

    return `
      <section class="display-stage${hasFocus ? " display-stage--focus-active" : ""}" data-freeze="${app.ui.displayFreeze ? "true" : "false"}">
        <div class="display-board" ${hasFocus ? 'aria-hidden="true"' : ""}>
          <div class="display-header">
            <div class="badge">展示模式 · 第 ${page + 1} / ${totalPages} 页</div>
            <div class="display-search">
              <span class="search-label">搜索</span>
              <input id="displaySearch" placeholder="姓名 / 拼音 / ${SEAT_LABEL}" value="${escapeHtml(searchTerm)}" />
              <button class="ghost small" data-action="clear-display-search">清除</button>
            </div>
            <div class="pill">共 ${students.length} 名${searchTerm ? "（已筛选）" : ""}</div>
          </div>
          <div class="display-grid">
            ${cardsHtml}
          </div>
          <div class="display-actions">
            <button class="ghost" data-action="display-prev-page" ${page === 0 ? "disabled" : ""}>上一页</button>
            <button class="ghost" data-action="display-next-page" ${page >= totalPages - 1 ? "disabled" : ""}>下一页</button>
            <button class="ghost" data-action="go-home">返回主页</button>
          </div>
        </div>
        ${focusHtml}
      </section>
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
              const studentName = student ? `${student.name} (${SEAT_LABEL} ${student.seatNo})` : "-";
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
              const change = [delta, effect].filter(Boolean).join(" · ") || (entry.type === "re_adopt" ? "重新领养" : "-");
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

  Object.assign(CP.views, {
    setAuthError,
    isValidPin,
    getAuthErrorMessage,
    updateAuthError,
    setView,
    setModeIndicator,
    logoutTeacher,
    updateHeaderButtons,
    resetSupervisedFeedSession,
    startSupervisedFeedSession,
    markSupervisedFeedVisited,
    selectSupervisedFeedStudent,
    leaveSupervisedFeedStudent,
    selectSupervisedFeedReAdoptType,
    endSupervisedFeedSession,
    openDisplayFocus,
    closeDisplayFocus,
    stepDisplayFocus,
    shouldIgnoreDisplayHotkeyTarget,
    setDisplayMotion,
    getLastBackupText,
    shouldShowBackupReminder,
    renderBackupReminder,
    renderSetupChecklist,
    formatEffects,
    renderXpProgress,
    render,
    renderHome,
    renderTeacherLogin,
    renderTeacherDashboard,
    renderTeacherStudents,
    renderTeacherRewards,
    renderTeacherStudentDetail,
    renderTeacherImport,
    renderTeacherSettings,
    renderStudentView,
    renderSupervisedFeedView,
    renderDisplayView,
    renderLedgerTable
  });
})(window);
