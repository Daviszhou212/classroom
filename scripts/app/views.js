(function (window) {
  const CP = window.ClassroomPetApp;
  const { constants, state, dom, utils, model } = CP;
  const {
    BACKUP_REMINDER_INTERVAL,
    SEAT_LABEL,
    PIN_RULE_LABEL,
    PIN_HELP_TEXT,
    AWARD_REASON_TEMPLATES,
    PET_TYPES,
    AWARD_REVOCATION_WINDOW,
    FEEDBACK_MAX_LENGTH,
    FEEDBACK_PREVIEW_LIMIT,
    CLAIM_ROSTER_PAGE_SIZE
  } = constants;
  const { app } = state;
  const { mainEl, modalRootEl, modeIndicatorEl } = dom;
  const { escapeHtml, showToast, clamp, formatTime } = utils;
  const {
    getStudentById,
    getPetByStudentId,
    getStudentFoodInventoryEntries,
    getPetType,
    getPetIcon,
    getPetTypePreviewIcon,
    getPetTypeName,
    isPetClaimed,
    getPetReAdoptStatus,
    getPendingClaimStudents,
    getPetClaimSummary,
    getSortedStudents,
    getDisplayFocusContext,
    getSupervisedFeedVisitedStudentIds,
    getBulkSelectedStudentIds,
    getBulkGroupNames,
    formatBulkGroupLabel,
    getOpenAwardBatches,
    getFeedbackEntries,
    getAwardBatchSummary,
    getAwardBatchStatus,
    getAwardEntryStatus,
    getAwardEntryRemainingText,
    getAwardBatchRemainingText,
    getXpProgress
  } = model;
  const DISPLAY_INTERACTION_COPY = {
    greet: {
      reaction: "你好呀！",
      message: (studentName, petTypeName) => `${studentName} 向${petTypeName}打了个招呼，${petTypeName}马上精神起来了。`
    },
    encourage: {
      reaction: "继续加油！",
      message: (studentName, petTypeName) => `${studentName} 给${petTypeName}送上鼓励，${petTypeName}看起来更有干劲了。`
    }
  };

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

  function clearBulkPointsDraft() {
    app.ui.bulkPointsDraft = "";
  }

  function toggleBulkPointsDraft(points) {
    const value = Number(points);
    if (!Number.isFinite(value) || value <= 0) return;
    app.ui.bulkPointsDraft = Number(app.ui.bulkPointsDraft || 0) === value ? "" : String(value);
  }

  function isTeacherManagementView(view = app.view) {
    return typeof view === "string" && view.startsWith("teacher");
  }

  function clearDisplayInteraction(options = {}) {
    if (state.displayInteractionResetTimer) {
      clearTimeout(state.displayInteractionResetTimer);
      state.displayInteractionResetTimer = null;
    }
    app.ui.displayInteraction = {
      studentId: null,
      type: "",
      reaction: "",
      message: "",
      stamp: 0
    };
    if (options.syncDom) {
      syncDisplayInteractionDom();
    }
    if (options.render) {
      render();
    }
  }

  function getActiveDisplayInteraction(focus = getDisplayFocusContext()) {
    if (
      !focus.hasFocus ||
      !app.ui.displayInteraction ||
      app.ui.displayInteraction.studentId !== focus.student.id
    ) {
      return null;
    }
    return app.ui.displayInteraction;
  }

  function getDisplayInteractionButtonClass(type, activeInteraction) {
    if (type === "greet") {
      return activeInteraction && activeInteraction.type === type ? "primary" : "ghost";
    }
    if (type === "encourage") {
      return activeInteraction && activeInteraction.type === type ? "accent" : "ghost";
    }
    return "ghost";
  }

  function renderDisplayInteractionBubble(activeInteraction) {
    if (!activeInteraction) return "";
    return `<div class="display-focus-reaction-bubble">${escapeHtml(activeInteraction.reaction)}</div>`;
  }

  function renderDisplayInteractionFeedback(activeInteraction) {
    if (!activeInteraction) {
      return `<p class="display-focus-interaction-empty">点一下按钮，给宠物一个课堂互动反馈。</p>`;
    }
    return `
      <div class="display-focus-interaction-feedback">
        <strong>${escapeHtml(activeInteraction.reaction)}</strong>
        <p>${escapeHtml(activeInteraction.message)}</p>
      </div>
    `;
  }

  function syncDisplayInteractionDom() {
    if (app.view !== "display-view") return false;
    const focus = getDisplayFocusContext();
    if (!focus.hasFocus) return false;

    const focusCard = document.querySelector(".display-focus-card");
    if (!focusCard) return false;

    const activeInteraction = getActiveDisplayInteraction(focus);
    const visualEl = focusCard.querySelector("[data-display-interaction-visual]");
    const bubbleSlotEl = focusCard.querySelector("[data-display-interaction-bubble]");
    const feedbackSlotEl = focusCard.querySelector("[data-display-interaction-feedback]");
    const greetButtonEl = focusCard.querySelector('[data-action="display-greet"]');
    const encourageButtonEl = focusCard.querySelector('[data-action="display-encourage"]');

    if (visualEl) {
      visualEl.classList.toggle("is-interacting", Boolean(activeInteraction));
      visualEl.classList.toggle("is-greet", Boolean(activeInteraction && activeInteraction.type === "greet"));
      visualEl.classList.toggle("is-encourage", Boolean(activeInteraction && activeInteraction.type === "encourage"));
    }

    if (bubbleSlotEl) {
      bubbleSlotEl.innerHTML = renderDisplayInteractionBubble(activeInteraction);
    }

    if (feedbackSlotEl) {
      feedbackSlotEl.innerHTML = renderDisplayInteractionFeedback(activeInteraction);
    }

    if (greetButtonEl) {
      greetButtonEl.className = getDisplayInteractionButtonClass("greet", activeInteraction);
    }

    if (encourageButtonEl) {
      encourageButtonEl.className = getDisplayInteractionButtonClass("encourage", activeInteraction);
    }

    return true;
  }

  function triggerDisplayInteraction(type) {
    const focus = getDisplayFocusContext();
    const config = DISPLAY_INTERACTION_COPY[type];
    if (!focus.hasFocus || !config) return;

    app.ui.displayInteraction = {
      studentId: focus.student.id,
      type,
      reaction: config.reaction,
      message: config.message(focus.student.name, getPetTypeName(focus.pet)),
      stamp: Date.now()
    };

    if (state.displayInteractionResetTimer) {
      clearTimeout(state.displayInteractionResetTimer);
    }
    state.displayInteractionResetTimer = setTimeout(() => {
      clearDisplayInteraction({ syncDom: true });
    }, 2600);

    syncDisplayInteractionDom();
  }

  function refreshPetVariantSessionSeed() {
    app.ui.petVariantSessionSeed = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setView(view, params = {}) {
    if (view === "teacher-rewards") {
      view = app.auth.teacher ? "teacher-students" : "teacher-dashboard";
    }
    if (app.auth.teacher && isTeacherManagementView() && (view === "home" || view === "display-view")) {
      showToast("请先退出教师模式", "warning");
      return false;
    }
    const leavingTeacherStudents = app.view === "teacher-students" && view !== "teacher-students";
    const leavingDisplay = app.view === "display-view" && view !== "display-view";
    const leavingSupervisedFeed = app.view === "supervised-feed-view" && view !== "supervised-feed-view";
    const leavingPetClaim = app.view === "teacher-pet-claim" && view !== "teacher-pet-claim";
    if (leavingTeacherStudents) {
      clearBulkPointsDraft();
    }
    if (app.view === "teacher-dashboard" && view !== "teacher-dashboard") {
      closeFeedbackModal();
    }
    if (leavingDisplay) {
      app.ui.displaySearch = "";
      app.ui.displayPage = 0;
      app.ui.displaySelectedId = null;
      app.ui.displayFreeze = false;
      clearDisplayInteraction();
    }
    if (leavingSupervisedFeed) {
      resetSupervisedFeedSession();
    }
    if (leavingPetClaim) {
      app.ui.claimRosterPage = 0;
      app.ui.claimDraftPetTypeId = null;
      app.ui.claimPendingStudentId = null;
    }
    const routeChanged =
      app.view !== view ||
      JSON.stringify(app.params || {}) !== JSON.stringify(params || {});
    if (routeChanged) {
      refreshPetVariantSessionSeed();
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
    closeFeedbackModal({ clearDraft: true });
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

  function updateTeacherHeaderActions() {
    const teacherHomeBtn = document.getElementById("teacherHomeBtn");
    if (!teacherHomeBtn) return;

    const showTeacherHomeBtn =
      app.auth.teacher &&
      app.view !== "teacher-dashboard" &&
      (isTeacherManagementView(app.view) || app.view === "supervised-feed-view");
    teacherHomeBtn.hidden = !showTeacherHomeBtn;
    teacherHomeBtn.disabled = !showTeacherHomeBtn;
  }

  function resetSupervisedFeedSession() {
    app.ui.supervisedFeedSessionActive = false;
    app.ui.supervisedFeedStudentId = null;
    app.ui.supervisedFeedVisitedStudentIds = [];
    app.ui.supervisedFeedFedStudentIds = [];
    app.ui.supervisedFeedReAdoptDraftTypeId = null;
    app.ui.supervisedFeedReAdoptExpanded = false;
  }

  function startSupervisedFeedSession() {
    app.ui.supervisedFeedSessionActive = true;
    app.ui.supervisedFeedStudentId = null;
    app.ui.supervisedFeedVisitedStudentIds = [];
    app.ui.supervisedFeedFedStudentIds = [];
    app.ui.supervisedFeedReAdoptDraftTypeId = null;
    app.ui.supervisedFeedReAdoptExpanded = false;
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

  function getSupervisedFeedFedStudentIds() {
    const studentIds = new Set(app.data.students.map((student) => student.id));
    const fedIds = Array.isArray(app.ui.supervisedFeedFedStudentIds) ? app.ui.supervisedFeedFedStudentIds : [];
    return fedIds.filter((id, index, list) => studentIds.has(id) && list.indexOf(id) === index);
  }

  function markSupervisedFeedFed(studentId) {
    if (!studentId) return;
    const fedIds = getSupervisedFeedFedStudentIds();
    if (fedIds.includes(studentId)) {
      app.ui.supervisedFeedFedStudentIds = fedIds;
      return;
    }
    app.ui.supervisedFeedFedStudentIds = [...fedIds, studentId];
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
    app.ui.supervisedFeedReAdoptExpanded = false;
    render();
  }

  function leaveSupervisedFeedStudent() {
    app.ui.supervisedFeedStudentId = null;
    app.ui.supervisedFeedReAdoptDraftTypeId = null;
    app.ui.supervisedFeedReAdoptExpanded = false;
    render();
  }

  function openSupervisedFeedReAdopt() {
    if (!app.auth.teacher || !app.ui.supervisedFeedSessionActive || !app.ui.supervisedFeedStudentId) {
      showToast("请先由老师开启对应学生的班会喂养回合", "warning");
      return;
    }
    app.ui.supervisedFeedReAdoptExpanded = true;
    render();
  }

  function cancelSupervisedFeedReAdopt() {
    app.ui.supervisedFeedReAdoptExpanded = false;
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

    app.ui.supervisedFeedReAdoptExpanded = true;
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
    clearDisplayInteraction();
    setDisplayMotion("enter");
    app.ui.displaySelectedId = studentId;
    app.ui.displayFreeze = true;
    (CP.preserveScrollPosition || ((updateFn) => updateFn()))(render);
  }

  function closeDisplayFocus() {
    if (!app.ui.displaySelectedId) return;
    clearDisplayInteraction();
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
    clearDisplayInteraction();
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

  function getBackupRiskStatus(now = Date.now()) {
    const lastBackupAt = Number(app.data.config.lastBackupAt || 0);
    if (!lastBackupAt) {
      return {
        code: "never",
        label: "从未备份",
        className: "is-danger",
        message: "当前业务主数据主要保存在浏览器本地，建议先导出一份完整 JSON 备份。"
      };
    }
    if (now - lastBackupAt >= BACKUP_REMINDER_INTERVAL) {
      return {
        code: "stale",
        label: "超过 7 天未备份",
        className: "is-warning",
        message: `最近完整 JSON 备份：${getLastBackupText()}。建议立即重新导出一份完整备份。`
      };
    }
    return {
      code: "recent",
      label: "最近已备份",
      className: "is-safe",
      message: `最近完整 JSON 备份：${getLastBackupText()}。当前仍建议在重要操作前再次备份。`
    };
  }

  function shouldShowBackupReminder() {
    const lastBackupAt = Number(app.data.config.lastBackupAt || 0);
    return !lastBackupAt || Date.now() - lastBackupAt >= BACKUP_REMINDER_INTERVAL;
  }

  function renderBackupConfirmHint() {
    return `
      <p class="field-hint backup-confirm-hint">点击后请务必检查浏览器下载列表或目标文件夹，确认备份文件真的保存了。</p>
    `;
  }

  function renderBackupReminder() {
    if (!shouldShowBackupReminder()) return "";
    const status = getBackupRiskStatus();

    return `
      <section class="section banner-section" data-backup-reminder-section>
        <div class="banner-card">
          <div>
            <span class="badge backup-status-pill ${status.className}" data-backup-reminder-badge>${status.label}</span>
            <h2>当前数据保存在这台电脑的浏览器里</h2>
            <p data-backup-reminder-message>${escapeHtml(status.message)}</p>
          </div>
          <div class="form-actions">
            <button class="primary" data-action="export-data">立即备份</button>
          </div>
          ${renderBackupConfirmHint()}
        </div>
      </section>
    `;
  }

  function renderDataSafetySection() {
    const status = getBackupRiskStatus();
    return `
      <section class="section data-safety-section" data-backup-safety-card>
        <div class="section-header">
          <h2>数据安全</h2>
          <span class="pill backup-status-pill ${status.className}" data-backup-risk-label>${status.label}</span>
        </div>
        <p class="notice data-safety-notice" data-backup-risk-message>
          当前业务主数据主要保存在浏览器本地。清理站点数据、换浏览器、换电脑或更改打开方式，都可能导致数据不可恢复。
        </p>
        <div class="pill-list">
          <span class="pill" data-last-backup-pill>最近完整 JSON 备份：${escapeHtml(getLastBackupText())}</span>
        </div>
        <p class="field-hint data-safety-hint">${escapeHtml(status.message)}</p>
        <div class="form-actions">
          <button class="primary" data-action="export-data">立即备份</button>
          <button class="ghost" data-action="go-import">进入导入导出</button>
        </div>
        ${renderBackupConfirmHint()}
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

  function renderPetClaimProgressPills(summary = getPetClaimSummary()) {
    if (!summary.total) {
      return "";
    }
    return `
      <div class="pill-list">
        <span class="pill">已认领 ${summary.claimedCount}/${summary.total}</span>
        <span class="pill">${summary.pendingCount ? `待认领 ${summary.pendingCount}` : "全班已完成认领"}</span>
      </div>
    `;
  }

  function renderClaimStatusBanner() {
    const summary = getPetClaimSummary();
    if (!summary.total || summary.completed) {
      return "";
    }
    return `
      <section class="section claim-status-banner">
        <div class="section-header">
          <h2>宠物认领未完成</h2>
          <span class="pill">已认领 ${summary.claimedCount}/${summary.total}</span>
        </div>
        <p class="notice">当前还有 ${summary.pendingCount} 名学生待认领。完成前，班会喂养、展示模式、学生查看和学生详情都会保持锁定。</p>
        <div class="form-actions">
          <button class="accent" data-action="go-pet-claim">去完成宠物认领</button>
          <button class="ghost" data-action="go-students">查看学生名单</button>
        </div>
      </section>
    `;
  }

  function getAwardBatchStatusClass(code) {
    if (code === "revocable") return "is-revocable";
    if (code === "insufficient_points") return "is-insufficient";
    if (code === "missing_student") return "is-missing";
    if (code === "expired") return "is-expired";
    return "";
  }

  function renderAwardBatchEntry(batch, entry) {
    const status = getAwardEntryStatus(entry);
    const student = getStudentById(entry.studentId);
    const studentLabel = student
      ? `${student.name}（${SEAT_LABEL} ${student.seatNo}${student.group ? ` / ${student.group}` : ""}）`
      : "学生已删除";

    return `
      <div class="award-batch-entry ${getAwardBatchStatusClass(status.code)}">
        <div class="award-batch-entry-head">
          <div class="award-batch-entry-copy">
            <strong>${escapeHtml(studentLabel)}</strong>
            <p>+${entry.points} 分${entry.reason ? ` · ${escapeHtml(entry.reason)}` : ""}</p>
          </div>
          <div class="award-batch-entry-badges">
            <span class="badge">${escapeHtml(status.label)}</span>
            <span class="pill">${escapeHtml(getAwardEntryRemainingText(entry))}</span>
          </div>
        </div>
        <div class="form-actions compact-actions award-batch-entry-actions">
          <button
            class="${status.code === "revocable" ? "accent small" : "ghost small"}"
            data-action="revoke-award-entry"
            data-batch-id="${batch.id}"
            data-entry-id="${entry.id}"
            ${status.code === "revocable" ? "" : "disabled"}
          >
            ${status.code === "revocable" ? "撤销这条加分" : status.label}
          </button>
        </div>
      </div>
    `;
  }

  function renderAwardBatchSection(options = {}) {
    const title = options.title || "近 7 天加分记录";
    const pageSize = 3;
    const awardBatches = getOpenAwardBatches();
    const totalPages = Math.max(1, Math.ceil(awardBatches.length / pageSize));
    const page = clamp(Number(app.ui.awardBatchPage) || 0, 0, totalPages - 1);
    app.ui.awardBatchPage = page;
    const start = page * pageSize;
    const visibleBatches = awardBatches.slice(start, start + pageSize);
    const hasPagination = awardBatches.length > pageSize;

    return `
      <section class="section">
        <div class="section-header">
          <h2>${escapeHtml(title)}</h2>
          <span class="pill">固定 ${Math.round(AWARD_REVOCATION_WINDOW / (24 * 60 * 60 * 1000))} 天撤销窗口</span>
        </div>
        <p class="notice">加分仍按批次分组展示，但撤销改为逐条处理。同批里某一条过期、学生已删除或积分不足时，不会阻塞其他条目继续撤销。</p>
        ${visibleBatches.length
          ? `
            <div class="grid cols-3 award-batch-grid">
              ${visibleBatches
                .map((batch) => {
                  const status = getAwardBatchStatus(batch);
                  const summary = getAwardBatchSummary(batch);
                  const blockedCount = summary.expiredCount + summary.missingCount + summary.insufficientCount;
                  return `
                    <article class="card award-batch-card ${getAwardBatchStatusClass(status.code)}">
                      <div class="award-batch-card-head">
                        <span class="badge">${escapeHtml(status.label)}</span>
                        <span class="pill">${escapeHtml(getAwardBatchRemainingText(batch))}</span>
                      </div>
                      <h3>${escapeHtml(formatTime(batch.createdAt))}</h3>
                      <p>理由：${escapeHtml(batch.reason)}</p>
                      <div class="pill-list award-batch-summary">
                        <span class="pill">共 ${summary.totalCount} 条</span>
                        <span class="pill">可撤销 ${summary.revocableCount} 条</span>
                        <span class="pill">已撤销 ${summary.revokedCount} 条</span>
                        ${blockedCount ? `<span class="pill">受阻 ${blockedCount} 条</span>` : ""}
                      </div>
                      <div class="award-batch-entry-list">
                        ${(Array.isArray(batch.entries) ? batch.entries : [])
                          .map((entry) => renderAwardBatchEntry(batch, entry))
                          .join("")}
                      </div>
                    </article>
                  `;
                })
                .join("")}
            </div>
            ${hasPagination
              ? `
                <div class="award-batch-pagination">
                  <p class="field-hint">第 ${page + 1} / ${totalPages} 页，每页最多展示 ${pageSize} 个批次。当前显示 ${start + 1}-${start + visibleBatches.length} / ${awardBatches.length} 个批次。</p>
                  <div class="form-actions compact-actions">
                    <button class="ghost small" data-action="award-batch-prev-page" ${page === 0 ? "disabled" : ""}>上一页</button>
                    <button class="ghost small" data-action="award-batch-next-page" ${page >= totalPages - 1 ? "disabled" : ""}>下一页</button>
                  </div>
                </div>
              `
              : ""}
          `
          : `<p class="notice">当前还没有可查看的加分撤销记录。</p>`}
      </section>
    `;
  }

  function renderMultilineText(value) {
    return escapeHtml(value).replace(/\r?\n/g, "<br />");
  }

  function renderFeedbackHistory(feedbackEntries = getFeedbackEntries(FEEDBACK_PREVIEW_LIMIT)) {
    if (!feedbackEntries.length) {
      return `<p class="notice">还没有保存过反馈，提交后会显示在这里。</p>`;
    }

    return `
      <div class="feedback-entry-list">
        ${feedbackEntries
          .map((entry) => `
            <article class="feedback-entry-card">
              <div class="feedback-entry-head">
                <span class="badge">教师反馈</span>
                <time datetime="${new Date(entry.createdAt).toISOString()}">${escapeHtml(formatTime(entry.createdAt))}</time>
              </div>
              <p>${renderMultilineText(entry.message)}</p>
            </article>
          `)
          .join("")}
      </div>
    `;
  }

  function getFeedbackFileSessionState() {
    const session = state.feedbackFileSession || {};
    const supported = session.supported === true;
    return {
      supported,
      mode: session.mode || (supported ? "picker" : "download"),
      fileName: session.fileName || "",
      lastWriteStatus: session.lastWriteStatus || "idle",
      lastWriteName: session.lastWriteName || "",
      lastError: session.lastError || ""
    };
  }

  function renderFeedbackBackupStatusCard() {
    const status = getBackupRiskStatus();
    return `
      <div class="feedback-status-head">
        <h3>完整备份</h3>
        <span class="pill backup-status-pill ${status.className}">${status.label}</span>
      </div>
      <p>${escapeHtml(status.message)}</p>
      <div class="pill-list">
        <span class="pill">最近完整 JSON 备份：${escapeHtml(getLastBackupText())}</span>
      </div>
      <div class="form-actions compact-actions">
        <button class="ghost small" type="button" data-action="feedback-backup-now">立即备份</button>
      </div>
      ${renderBackupConfirmHint()}
    `;
  }

  function renderFeedbackFileStatusCard() {
    const session = getFeedbackFileSessionState();
    let label = "当前环境将回退为下载";
    let className = "is-warning";
    let description = "当前浏览器或打开方式不支持持续写入同一文件。提交反馈时会自动下载单条 JSONL 文件。";
    let detail = "";
    let actionHtml = "";

    if (session.supported && session.mode === "file" && session.fileName) {
      label = "已绑定同一文件持续写入";
      className = "is-safe";
      description = `当前文件：${session.fileName}。后续提交会继续向这个文件末尾追加 JSONL。`;
      detail =
        session.lastWriteStatus === "written"
          ? `上次提交已写入：${session.lastWriteName || session.fileName}`
          : "当前页面会话内会继续复用这个文件。";
      actionHtml = `
        <div class="form-actions compact-actions">
          <button class="ghost small" type="button" data-action="feedback-select-file">更换保存文件</button>
        </div>
      `;
    } else if (session.supported) {
      label = "尚未绑定保存文件";
      className = "is-neutral";
      description = "当前环境支持持续写入同一文件。首次提交会先提示选择文件；若取消或写入失败，会自动回退为下载单条 JSONL 文件。";
      if (session.lastWriteStatus === "downloaded") {
        detail = `上次提交已回退下载：${session.lastWriteName}`;
      } else if (session.lastWriteStatus === "browser_only") {
        detail = `上次提交仅保存到浏览器：${session.lastError || "本地文件未保存"}`;
      } else if (session.lastWriteStatus === "error") {
        detail = `最近一次文件写入失败：${session.lastError || "请重新选择保存文件"}`;
      }
      actionHtml = `
        <div class="form-actions compact-actions">
          <button class="ghost small" type="button" data-action="feedback-select-file">选择保存文件</button>
        </div>
      `;
    } else if (session.lastWriteStatus === "downloaded") {
      detail = `上次提交已下载：${session.lastWriteName}`;
    } else if (session.lastWriteStatus === "browser_only") {
      detail = `上次提交仅保存到浏览器：${session.lastError || "本地文件未保存"}`;
    }

    return `
      <div class="feedback-status-head">
        <h3>反馈文件</h3>
        <span class="pill backup-status-pill ${className}">${escapeHtml(label)}</span>
      </div>
      <p>${escapeHtml(description)}</p>
      ${detail ? `<p class="field-hint">${escapeHtml(detail)}</p>` : ""}
      ${actionHtml}
    `;
  }

  function createFeedbackModalHtml() {
    return `
      <div class="modal-overlay" data-action="close-feedback-modal">
        <div
          class="modal-card feedback-modal"
          data-action="noop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedbackModalTitle"
          >
          <div class="feedback-modal-header">
            <div class="feedback-modal-copy">
              <span class="badge">教师模式</span>
              <h2 id="feedbackModalTitle">反馈建议</h2>
              <p>反馈会先保存到浏览器，并尝试同步落到本地 JSONL 文件；完整业务数据仍建议定期导出 JSON 备份。</p>
            </div>
            <span class="pill">最多 ${FEEDBACK_MAX_LENGTH} 字</span>
          </div>

          <div class="feedback-status-grid">
            <section class="feedback-status-card" data-feedback-backup-panel></section>
            <section class="feedback-status-card" data-feedback-file-panel></section>
          </div>

          <form class="feedback-form" data-action="submit-feedback">
            <div>
              <label for="feedbackMessage">建议内容</label>
              <textarea
                id="feedbackMessage"
                name="feedbackMessage"
                rows="6"
                maxlength="${FEEDBACK_MAX_LENGTH}"
                placeholder="例如：希望在教师模式里增加……"
                required
              ></textarea>
            </div>
            <p class="field-hint">提交后会立即写入浏览器本地数据，并按当前环境尝试同步保存到本地 JSONL 文件。</p>
            <div class="form-actions">
              <button class="primary" type="submit">提交反馈</button>
              <button class="ghost" type="button" data-action="close-feedback-modal">关闭</button>
            </div>
          </form>

          <section class="feedback-history">
            <div class="section-header feedback-history-header">
              <h3>最近反馈</h3>
              <span class="pill" data-feedback-count>暂无记录</span>
            </div>
            <div data-feedback-history></div>
          </section>
        </div>
      </div>
    `;
  }

  function cacheFeedbackModalRefs() {
    if (!modalRootEl) return null;
    const overlayEl = modalRootEl.querySelector(".modal-overlay");
    const modalCardEl = modalRootEl.querySelector(".feedback-modal");
    const formEl = modalRootEl.querySelector('.feedback-form[data-action="submit-feedback"]');
    const textareaEl = modalRootEl.querySelector("#feedbackMessage");
    const countEl = modalRootEl.querySelector("[data-feedback-count]");
    const historyEl = modalRootEl.querySelector("[data-feedback-history]");
    const backupPanelEl = modalRootEl.querySelector("[data-feedback-backup-panel]");
    const filePanelEl = modalRootEl.querySelector("[data-feedback-file-panel]");

    if (!overlayEl || !modalCardEl || !formEl || !textareaEl || !countEl || !historyEl || !backupPanelEl || !filePanelEl) {
      state.feedbackModalRefs = null;
      return null;
    }

    state.feedbackModalRefs = {
      overlayEl,
      modalCardEl,
      formEl,
      textareaEl,
      countEl,
      historyEl,
      backupPanelEl,
      filePanelEl
    };
    return state.feedbackModalRefs;
  }

  function syncBackupStatusDom() {
    const status = getBackupRiskStatus();
    const reminderSectionEls = Array.from(document.querySelectorAll("[data-backup-reminder-section]"));
    reminderSectionEls.forEach((sectionEl) => {
      sectionEl.hidden = !shouldShowBackupReminder();
      const badgeEl = sectionEl.querySelector("[data-backup-reminder-badge]");
      const messageEl = sectionEl.querySelector("[data-backup-reminder-message]");
      if (badgeEl) {
        badgeEl.className = `badge backup-status-pill ${status.className}`;
        badgeEl.textContent = status.label;
      }
      if (messageEl) {
        messageEl.textContent = status.message;
      }
    });

    const riskLabelEls = Array.from(document.querySelectorAll("[data-backup-risk-label]"));
    riskLabelEls.forEach((labelEl) => {
      labelEl.className = `pill backup-status-pill ${status.className}`;
      labelEl.textContent = status.label;
    });

    const riskMessageEls = Array.from(document.querySelectorAll("[data-backup-risk-message]"));
    riskMessageEls.forEach((messageEl) => {
      if (messageEl.classList.contains("data-safety-notice")) {
        messageEl.textContent = "当前业务主数据主要保存在浏览器本地。清理站点数据、换浏览器、换电脑或更改打开方式，都可能导致数据不可恢复。";
      } else {
        messageEl.textContent = status.message;
      }
    });

    const lastBackupEls = Array.from(document.querySelectorAll("[data-last-backup-pill]"));
    lastBackupEls.forEach((pillEl) => {
      pillEl.textContent = `最近完整 JSON 备份：${getLastBackupText()}`;
    });

    return true;
  }

  function syncFeedbackModalDom(options = {}) {
    if (!app.ui.feedbackModalOpen || !modalRootEl) return false;
    const refs = state.feedbackModalRefs || cacheFeedbackModalRefs();
    if (!refs) return false;

    const feedbackEntries = getFeedbackEntries(FEEDBACK_PREVIEW_LIMIT);
    refs.countEl.textContent = feedbackEntries.length ? `最近 ${feedbackEntries.length} 条` : "暂无记录";
    refs.historyEl.innerHTML = renderFeedbackHistory(feedbackEntries);
    refs.backupPanelEl.innerHTML = renderFeedbackBackupStatusCard();
    refs.filePanelEl.innerHTML = renderFeedbackFileStatusCard();

    const nextDraft = String(options.draft ?? app.ui.feedbackDraft ?? "");
    if (refs.textareaEl.value !== nextDraft) {
      refs.textareaEl.value = nextDraft;
    }

    if (options.focusInput) {
      requestAnimationFrame(() => {
        const activeRefs = state.feedbackModalRefs || cacheFeedbackModalRefs();
        if (!activeRefs) return;
        activeRefs.textareaEl.focus();
        const end = activeRefs.textareaEl.value.length;
        activeRefs.textareaEl.setSelectionRange(end, end);
      });
    }

    return true;
  }

  function openFeedbackModal(options = {}) {
    if (!app.auth.teacher || app.view !== "teacher-dashboard" || !modalRootEl) {
      return false;
    }

    app.ui.feedbackModalOpen = true;
    if (!state.feedbackModalRefs) {
      modalRootEl.innerHTML = createFeedbackModalHtml();
      cacheFeedbackModalRefs();
    }
    syncFeedbackModalDom({
      draft: String(app.ui.feedbackDraft || ""),
      focusInput: options.focusInput !== false
    });
    syncBackupStatusDom();
    return true;
  }

  function closeFeedbackModal(options = {}) {
    app.ui.feedbackModalOpen = false;
    if (options.clearDraft) {
      app.ui.feedbackDraft = "";
    }
    state.feedbackModalRefs = null;
    if (modalRootEl) {
      modalRootEl.innerHTML = "";
    }
  }

  function render() {
    updateHeaderButtons();
    updateTeacherHeaderActions();
    const displayFreeze = app.ui.displayFreeze;

    if (app.view === "teacher-rewards") {
      app.view = app.auth.teacher ? "teacher-students" : "teacher-dashboard";
    }

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
      case "teacher-pet-claim":
        setModeIndicator("宠物认领");
        mainEl.innerHTML = renderTeacherPetClaim();
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

    if (app.view === "teacher-dashboard" && app.auth.teacher && app.ui.feedbackModalOpen) {
      openFeedbackModal({ focusInput: false });
    } else {
      closeFeedbackModal();
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

  function renderTeacherStudents() {
    const students = getSortedStudents();
    const editing = app.ui.editingStudentId ? getStudentById(app.ui.editingStudentId) : null;
    const claimSummary = getPetClaimSummary();
    const selectedIds = getBulkSelectedStudentIds();
    const selectedIdSet = new Set(selectedIds);
    const selectedCount = selectedIds.length;
    const bulkPointsDraft = Number(app.ui.bulkPointsDraft || 0);
    const groupNames = getBulkGroupNames();
    const filteredIds = students.map((student) => student.id);

    return `
      ${renderClaimStatusBanner()}
      ${renderAwardBatchSection()}
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
          <p class="field-hint">拼音搜索会自动生成，无需手动填写拼音或英文名。${claimSummary.total ? "新增学生后会进入待认领状态，认领完成前正式流程会被锁定。" : ""}</p>
          <div class="form-actions">
            <button class="primary" type="submit">${editing ? "保存修改" : "添加学生"}</button>
            ${editing ? `<button class="ghost" type="button" data-action="cancel-edit">取消编辑</button>` : ""}
          </div>
        </form>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>学生列表</h2>
        </div>
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
        ${selectedCount ? `
          <div class="bulk-toolbar bulk-award-panel">
            <div class="section-header">
              <h2>批量加分</h2>
              <span class="pill">统一给已选学生发放同样的奖励</span>
            </div>
            <div class="form-actions compact-actions">
              <button class="${bulkPointsDraft === 1 ? "primary" : "ghost"} small" data-action="bulk-quick-award" data-points="1">已选学生 +1</button>
              <button class="${bulkPointsDraft === 2 ? "primary" : "ghost"} small" data-action="bulk-quick-award" data-points="2">已选学生 +2</button>
              <button class="${bulkPointsDraft === 5 ? "primary" : "ghost"} small" data-action="bulk-quick-award" data-points="5">已选学生 +5</button>
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
          </div>
        ` : ""}
        ${students.length ? `
          <table class="table">
            <thead>
              <tr>
                <th class="select-col">选择</th>
                <th>${SEAT_LABEL}</th>
                <th>姓名</th>
                <th>分组</th>
                <th>宠物状态</th>
                <th>积分</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${students
                .map((student) => {
                  const pet = getPetByStudentId(student.id);
                  const claimed = isPetClaimed(pet);
                  return `
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
                  <td>
                    <span class="pill ${claimed ? "" : "claim-pending-pill"}">${claimed ? `已认领 · ${escapeHtml(getPetTypeName(pet))}` : "待认领"}</span>
                  </td>
                  <td>${student.points || 0}</td>
                  <td>
                    <div class="table-actions">
                      <button class="text" data-action="${claimed ? "view-student" : "go-pet-claim"}" data-id="${student.id}">${claimed ? "详情" : "认领"}</button>
                      <button class="text" data-action="edit-student" data-id="${student.id}">编辑</button>
                      <button class="text" data-action="delete-student" data-id="${student.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `;
                })
                .join("")}
            </tbody>
          </table>
        ` : `<p class="notice">还没有学生，请先添加。</p>`}
      </section>
    `;
  }

  function renderTeacherPetClaim() {
    const students = getSortedStudents({ ignoreSearch: true });
    const pendingStudents = getPendingClaimStudents();
    const claimSummary = getPetClaimSummary();

    if (!students.length) {
      return `
        <section class="section">
          <div class="section-header">
            <h2>宠物认领</h2>
            <button class="ghost" data-action="go-dashboard">返回仪表盘</button>
          </div>
          <p class="notice">还没有学生名单。请先导入 CSV，或到学生管理中手动添加学生，再回来完成宠物认领。</p>
          <div class="form-actions">
            <button class="accent" data-action="go-import">导入学生名单</button>
            <button class="ghost" data-action="go-students">学生管理</button>
          </div>
        </section>
      `;
    }

    const draftPetType = PET_TYPES.find((type) => type.id === app.ui.claimDraftPetTypeId) || null;
    if (!draftPetType) {
      app.ui.claimDraftPetTypeId = null;
    }

    const pendingConfirmStudent = pendingStudents.find((student) => student.id === app.ui.claimPendingStudentId) || null;
    if (!pendingConfirmStudent) {
      app.ui.claimPendingStudentId = null;
    }

    if (!pendingStudents.length) {
      app.ui.claimRosterPage = 0;
      app.ui.claimPendingStudentId = null;
      return `
        <section class="section">
          <div class="section-header">
            <h2>宠物认领</h2>
            <span class="pill">已完成</span>
          </div>
          <p class="notice">全班宠物认领已完成。现在可以进入班会喂养、展示模式和学生查看。</p>
          ${renderPetClaimProgressPills(claimSummary)}
        </section>

        <section class="section">
          <div class="section-header">
            <h2>学生认领列表</h2>
            <span class="pill">全班已完成</span>
          </div>
          <p class="notice">当前没有待认领学生，无需继续在本页操作。</p>
        </section>
      `;
    }

    const routedPendingStudent = pendingStudents.find((student) => student.id === app.params.id) || null;
    const focusedStudent = pendingConfirmStudent || routedPendingStudent || null;
    const rosterPageSize = CLAIM_ROSTER_PAGE_SIZE || 32;
    const totalRosterPages = Math.max(1, Math.ceil(pendingStudents.length / rosterPageSize));
    const focusedStudentIndex = focusedStudent ? pendingStudents.findIndex((student) => student.id === focusedStudent.id) : -1;
    const fallbackRosterPage = clamp(Number(app.ui.claimRosterPage) || 0, 0, totalRosterPages - 1);
    const rosterPage =
      focusedStudentIndex >= 0 ? clamp(Math.floor(focusedStudentIndex / rosterPageSize), 0, totalRosterPages - 1) : fallbackRosterPage;
    app.ui.claimRosterPage = rosterPage;
    const rosterStart = rosterPage * rosterPageSize;
    const visibleRosterStudents = pendingStudents.slice(rosterStart, rosterStart + rosterPageSize);
    const hasRosterPagination = pendingStudents.length > rosterPageSize;
    const hasPendingConfirmation = Boolean(draftPetType && pendingConfirmStudent);
    const toolSummaryText = pendingConfirmStudent
      ? `已为 ${escapeHtml(pendingConfirmStudent.name)} 选定 ${escapeHtml(draftPetType ? draftPetType.name : "")}，点击“确认认领”后生效。`
      : draftPetType
        ? `当前宠物为 ${escapeHtml(draftPetType.name)}，请点下方待认领学生姓名进入待确认。`
        : "先选择一种宠物，再点下方待认领学生姓名进入待确认。";
    const guideBadgeText = draftPetType ? `当前宠物 ${escapeHtml(draftPetType.name)}` : "先选择宠物";
    const pendingBadgeText = pendingConfirmStudent ? `待确认 ${escapeHtml(pendingConfirmStudent.name)}` : "未选择学生";

    return `
      <section class="section">
        <div class="section-header">
          <h2>宠物认领</h2>
          <span class="pill">${claimSummary.completed ? "已完成" : "初始化必做"}</span>
        </div>
        <p class="notice">导入学生后，请先陪学生完成宠物认领。完成前，班会喂养、展示模式、学生查看和学生详情都会保持锁定。</p>
        ${renderPetClaimProgressPills(claimSummary)}
      </section>

      <section class="section">
        <div class="section-header">
          <h2>学生认领列表</h2>
          <span class="pill">待认领 ${pendingStudents.length}</span>
        </div>
        <div class="claim-tool-panel">
          <div class="claim-tool-summary">
            <div class="claim-tool-pills">
              <span class="pill claim-tool-pill">${guideBadgeText}</span>
              <span class="pill claim-tool-pill">${pendingBadgeText}</span>
              ${hasRosterPagination ? `<span class="pill">第 ${rosterPage + 1} / ${totalRosterPages} 页</span>` : ""}
            </div>
            <p class="notice claim-tool-note">${toolSummaryText}</p>
          </div>
          <div class="claim-roster-toolbar">
            ${hasRosterPagination
              ? `
                <div class="form-actions compact-actions claim-roster-pagination">
                  <button class="ghost small" data-action="claim-roster-prev-page" ${rosterPage === 0 ? "disabled" : ""}>上一页</button>
                  <button class="ghost small" data-action="claim-roster-next-page" ${rosterPage >= totalRosterPages - 1 ? "disabled" : ""}>下一页</button>
                </div>
              `
              : ""}
            <div class="form-actions compact-actions claim-tool-actions">
              <button class="accent" data-action="confirm-claim-student" ${hasPendingConfirmation ? "" : "disabled"}>确认认领</button>
              <button class="ghost" data-action="cancel-claim-student" ${pendingConfirmStudent ? "" : "disabled"}>取消</button>
            </div>
          </div>
        </div>
        <div class="claim-pet-draft-grid">
          ${PET_TYPES.map((type) => `
            <button
              type="button"
              class="claim-pet-draft${draftPetType && draftPetType.id === type.id ? " is-selected" : ""}"
              data-action="select-claim-pet-type"
              data-id="${type.id}"
            >
              <img class="claim-pet-draft-thumb" src="${getPetTypePreviewIcon(type.id)}" alt="" aria-hidden="true" />
              <span class="claim-pet-draft-label">${escapeHtml(type.name)}</span>
            </button>
          `).join("")}
        </div>
        <div class="claim-roster-grid" role="list">
          ${visibleRosterStudents
            .map((student) => {
              const active = focusedStudent && focusedStudent.id === student.id;
              return `
                <button
                  type="button"
                  class="claim-roster-name is-pending${active ? " is-selected" : ""}"
                  data-action="queue-claim-student"
                  data-id="${student.id}"
                  role="listitem"
                  title="${escapeHtml(student.name)}"
                  aria-label="${escapeHtml(`${student.name}，待认领`)}"
                >
                  <span class="claim-roster-name-text">${escapeHtml(student.name)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>当前认领状态</h2>
          <span class="pill">${draftPetType ? `当前宠物 ${escapeHtml(draftPetType.name)}` : "等待选择宠物"}</span>
        </div>
        <p class="notice">
          ${pendingConfirmStudent
            ? `当前待确认学生是 ${escapeHtml(pendingConfirmStudent.name)}。确认后会立即完成认领，并保留本次选中的宠物类型以便继续批量操作。`
            : draftPetType
              ? `当前宠物已选为 ${escapeHtml(draftPetType.name)}。请继续在上方待认领矩阵中点一个学生姓名。`
              : "请先在上方选择一种宠物，再从待认领矩阵中点学生姓名。"}
        </p>
      </section>

      ${""
        ? selectedClaimed
          ? `
            <section class="section">
              <div class="section-header">
                <h2>${escapeHtml(selectedStudent.name)} 的认领结果</h2>
                <span class="pill">已认领</span>
              </div>
              <p class="notice">已完成首次认领。进入班会喂养后，在首次有效喂养前还可以改 1 次宠物。</p>
              <div class="pet-card">
                <div class="pet-visual">
                  <img src="${getPetIcon(selectedPet)}" alt="宠物" />
                  <div class="badge">等级 ${selectedPet.level}</div>
                </div>
                <div class="stat-grid">
                  <div class="stat-row">
                    <span class="stat-label">姓名：${escapeHtml(selectedStudent.name)}（${SEAT_LABEL} ${escapeHtml(selectedStudent.seatNo)}）</span>
                    <span class="pill">积分余额：${selectedStudent.points || 0}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">宠物：${escapeHtml(getPetTypeName(selectedPet))}</span>
                    <span class="pill">认领时间：${escapeHtml(formatTime(selectedPet.claimedAt || selectedPet.updatedAt))}</span>
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
            </section>
          `
          : `
            <section class="section">
              <div class="section-header">
                <h2>为 ${escapeHtml(selectedStudent.name)} 选择宠物</h2>
                <span class="pill claim-pending-pill">待认领</span>
              </div>
              <p class="notice">请学生先完成正式认领。认领后，在首次有效喂养前仍可改 1 次宠物。</p>
              <div class="grid cols-3 supervised-feed-type-grid">
                ${PET_TYPES.map((type) => `
                  <article class="card supervised-feed-type-card claim-type-card">
                    <img src="${getPetTypePreviewIcon(type.id)}" alt="${escapeHtml(type.name)}" />
                    <h3>${escapeHtml(type.name)}</h3>
                    <p>认领后不会随机更换，可在首次喂养前再改 1 次。</p>
                    <button
                      class="accent"
                      data-action="claim-pet"
                      data-id="${selectedStudent.id}"
                      data-pet-type="${type.id}"
                    >
                      认领这个宠物
                    </button>
                  </article>
                `).join("")}
              </div>
            </section>
          `
        : ""}
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
        <h2>最近流水</h2>
        ${renderLedgerTable(ledger)}
      </section>
    `;
  }

  function renderTeacherImport() {
    return `
      ${renderBackupReminder()}
      ${renderClaimStatusBanner()}
      <section class="section">
        <h2>导出备份</h2>
        <p>备份文件会保存学生、宠物、积分、流水、教师反馈和系统设置。</p>
        <div class="pill-list">
          <span class="pill">最近一次备份：${escapeHtml(getLastBackupText())}</span>
        </div>
        <button class="primary" data-action="export-data">立即备份</button>
        ${renderBackupConfirmHint()}
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
          </div>
        </form>
      </section>

      <section class="section">
        <h2>导入学生名单（CSV）</h2>
        <p class="notice">支持格式：${SEAT_LABEL},姓名,分组。第 4 列拼音/英文名可留空；确认后，系统会先自动下载一份当前备份文件，再继续导入。导入成功后，需要先完成宠物认领，才会开放正式使用流程。</p>
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
      ${renderClaimStatusBanner()}
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
        <p class="notice">这里只能查看宠物状态；加分由老师操作，喂养请在班会喂养模式中进行。</p>
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
          </div>
          <p class="notice">当前没有进行中的班会喂养会话，请从教师首页重新开启。</p>
        </section>
      `;
    }

    const students = getSortedStudents({ ignoreSearch: true });
    const visitedIds = getSupervisedFeedVisitedStudentIds();
    const visitedIdSet = new Set(visitedIds);
    const fedIdSet = new Set(getSupervisedFeedFedStudentIds());
    let selectedStudent = app.ui.supervisedFeedStudentId ? getStudentById(app.ui.supervisedFeedStudentId) : null;
    let pet = selectedStudent ? getPetByStudentId(selectedStudent.id) : null;

    if (app.ui.supervisedFeedStudentId && (!selectedStudent || !pet)) {
      app.ui.supervisedFeedStudentId = null;
      app.ui.supervisedFeedReAdoptDraftTypeId = null;
      app.ui.supervisedFeedReAdoptExpanded = false;
      selectedStudent = null;
      pet = null;
    }

    const hasFedThisSession = selectedStudent ? fedIdSet.has(selectedStudent.id) : false;
    const sessionHeader = `
      <section class="section supervised-feed-shell">
        <div class="supervised-feed-session">
          <div class="supervised-feed-session-copy">
            <span class="badge">班会喂养模式</span>
            <h2>${selectedStudent ? `${escapeHtml(selectedStudent.name)} 的回合` : "请同学选择自己"}</h2>
            <p>
              ${selectedStudent
                ? hasFedThisSession
                  ? "本轮已完成喂养。你可以继续兑换食物并从背包里再喂，或直接返回名单继续下一位。"
                  : "可以先兑换多份食物，再从背包里选择要喂的食物；也可以本次先不喂、继续攒分后返回名单。"
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
          <p class="notice">请学生按学号顺序点击自己的卡片进入。本轮已轮到的同学会被标记，但仍可再次进入。</p>
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
    const reAdoptExpanded = reAdoptStatus.available && app.ui.supervisedFeedReAdoptExpanded === true;
    const inventoryEntries = getStudentFoodInventoryEntries(selectedStudent.id);
    const reAdoptSection = reAdoptStatus.available
      ? `
        <section class="section">
          <div class="section-header">
            <h2>首次喂养前可改一次宠物</h2>
            <span class="pill">每人仅 1 次</span>
          </div>
          <p class="notice">${escapeHtml(reAdoptStatus.message)}</p>
          <div class="supervised-feed-re-adopt-prompt">
            <div class="form-actions compact-actions supervised-feed-re-adopt-prompt-actions">
              <button class="ghost" data-action="cancel-supervised-re-adopt">先不改宠物</button>
              <button class="${reAdoptExpanded ? "primary" : "accent"}" data-action="open-supervised-re-adopt">
                ${reAdoptExpanded ? "继续选择新宠物" : "我要改宠物"}
              </button>
            </div>
          </div>
          ${reAdoptExpanded
            ? `
              <div class="grid cols-3 supervised-feed-type-grid">
                ${PET_TYPES.map((type) => {
                  const isCurrent = type.id === pet.petType;
                  const isSelected = type.id === reAdoptDraftTypeId;
                  return `
                    <article class="card supervised-feed-type-card${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}">
                      <img src="${getPetTypePreviewIcon(type.id)}" alt="${escapeHtml(type.name)}" />
                      <h3>${escapeHtml(type.name)}</h3>
                      <p>${isCurrent ? "这是你当前的宠物" : "可以把当前宠物改成这个类型"}</p>
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
                <button class="ghost" data-action="cancel-supervised-re-adopt">取消改宠物</button>
                <button
                  class="${selectedReAdoptType ? "accent" : "ghost"}"
                  data-action="confirm-supervised-re-adopt"
                  ${selectedReAdoptType ? "" : "disabled"}
                >
                  确认改宠物
                </button>
              </div>
            `
            : ""}
        </section>
      `
      : `
        <section class="section">
          <div class="section-header">
            <h2>首次喂养前可改一次宠物</h2>
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
            ${hasFedThisSession ? "" : `<button class="ghost" data-action="skip-supervised-feed">本次先不喂，继续攒分</button>`}
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
          <h2>兑换食物</h2>
          <span class="pill">${reAdoptStatus.available ? "如想改宠物，建议先改再兑换食物" : "先兑换，再从背包喂养"}</span>
        </div>
        <p class="notice">兑换后会进入你的长期食物背包。本次不喂也会保留，下次班会喂养还能继续使用。</p>
        <div class="grid cols-3">
          ${app.data.catalog
            .map((item) => {
              const disabled = (selectedStudent.points || 0) < item.pricePoints;
              const ownedQuantity =
                inventoryEntries.find((entry) => entry.catalogId === item.id)?.quantity || 0;
              return `
                <div class="card supervised-feed-food-card">
                  <h3>${escapeHtml(item.name)}</h3>
                  <p>价格：${item.pricePoints} 积分</p>
                  <p>效果：${formatEffects(item.effects)}</p>
                  <p>背包已有：${ownedQuantity} 份</p>
                  <button
                    class="${disabled ? "ghost" : "accent"}"
                    data-action="buy-food"
                    data-id="${item.id}"
                    ${disabled ? "disabled" : ""}
                  >
                    ${disabled ? "积分不足" : "兑换 1 份"}
                  </button>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>我的食物背包</h2>
          <span class="pill">长期库存</span>
        </div>
        <p class="notice">从背包里选择要喂的食物，每次喂食会消耗 1 份库存，并真正改变宠物状态。</p>
        ${inventoryEntries.length
          ? `
            <div class="grid cols-3 supervised-feed-inventory-grid">
              ${inventoryEntries
                .map((entry) => {
                  const item = entry.item;
                  return `
                    <div class="card supervised-feed-food-card supervised-feed-inventory-card">
                      <h3>${escapeHtml(item.name)}</h3>
                      <p>库存：${entry.quantity} 份</p>
                      <p>效果：${formatEffects(item.effects)}</p>
                      <button
                        class="accent"
                        data-action="supervised-feed"
                        data-id="${item.id}"
                      >
                        喂食 1 份
                      </button>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
          : `<p class="notice">背包还是空的，先去上方兑换食物。</p>`}
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
    const activeInteraction = getActiveDisplayInteraction(focus);
    const interactionVisualClass = activeInteraction
      ? ` is-interacting is-${activeInteraction.type}`
      : "";
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
                <div class="display-focus-visual${interactionVisualClass}" data-display-interaction-visual>
                  <div class="display-focus-reaction-slot" data-display-interaction-bubble>
                    ${renderDisplayInteractionBubble(activeInteraction)}
                  </div>
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
                    <h3>互动区</h3>
                    <span class="pill">只读互动</span>
                  </div>
                  <p>这里的互动不会修改积分或宠物数值，只用于课堂展示时的即时反馈。</p>
                  <div class="display-focus-interaction-actions">
                    <button
                      class="${getDisplayInteractionButtonClass("greet", activeInteraction)}"
                      type="button"
                      data-action="display-greet"
                    >
                      打招呼
                    </button>
                    <button
                      class="${getDisplayInteractionButtonClass("encourage", activeInteraction)}"
                      type="button"
                      data-action="display-encourage"
                    >
                      鼓励一下
                    </button>
                  </div>
                  <div class="display-focus-interaction-status" data-display-interaction-feedback>
                    ${renderDisplayInteractionFeedback(activeInteraction)}
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
    const renderDisplayHeader = ({ badgeText, countText, showSearch = true }) => `
      <div class="display-header">
        <div class="display-header-back">
          <button class="ghost" data-action="go-home">返回主页</button>
          <div class="badge">${badgeText}</div>
        </div>
        ${showSearch ? `
          <div class="display-header-search">
            <div class="display-search">
              <span class="search-label">搜索</span>
              <input id="displaySearch" placeholder="姓名 / 拼音 / ${SEAT_LABEL}" value="${escapeHtml(searchTerm)}" />
              <button class="ghost small" data-action="clear-display-search">清除</button>
            </div>
          </div>
        ` : ""}
        <div class="display-header-meta">
          <div class="pill">${countText}</div>
        </div>
      </div>
    `;
    if (!allStudents.length) {
      return `
        <section class="section display-stage" data-freeze="${app.ui.displayFreeze ? "true" : "false"}">
          <div class="display-board">
            ${renderDisplayHeader({
              badgeText: "展示模式",
              countText: "共 0 名",
              showSearch: false
            })}
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
            ${renderDisplayHeader({
              badgeText: "展示模式 · 搜索结果",
              countText: "共 0 名"
            })}
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
          ${renderDisplayHeader({
            badgeText: `展示模式 · 第 ${page + 1} / ${totalPages} 页`,
            countText: `共 ${students.length} 名${searchTerm ? "（已筛选）" : ""}`
          })}
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
              const actionLabelMap = {
                award: "加分",
                award_revoke: "撤销加分",
                claim_pet: "宠物认领",
                buy_food: "兑换食物",
                feed: "喂食",
                re_adopt: "改宠物"
              };
              const actionLabel = actionLabelMap[entry.type] || "记录";
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
              const change = [actionLabel, delta, effect].filter(Boolean).join(" · ") || "-";
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

  function renderSetupChecklist() {
    const claimSummary = getPetClaimSummary();
    if (claimSummary.completed) return "";

    const hasStudents = claimSummary.total > 0;

    return `
      <section class="section setup-checklist-section">
        <div class="section-header">
          <h2>初始步骤</h2>
          <span class="pill">先完成一次班级初始化</span>
        </div>
        <div class="grid cols-3 setup-checklist-grid">
          <div class="card task-card setup-task-card">
            <span class="badge setup-step-badge">第 1 步</span>
            <h3>导入学生名单</h3>
            <p>推荐优先使用 CSV 批量导入；如果暂时没有表格，也可以先进入学生管理手动逐个添加。</p>
            <div class="form-actions setup-task-actions">
              <button class="primary setup-task-button" type="button" data-action="pick-students-csv">去导入</button>
              <button class="ghost setup-task-button" type="button" data-action="go-students">学生管理</button>
            </div>
            <input
              class="setup-file-input"
              type="file"
              name="quickStudentCsv"
              accept=".csv,text/csv"
              tabindex="-1"
              aria-hidden="true"
            />
          </div>
          <div class="card task-card setup-task-card">
            <span class="badge setup-step-badge">第 2 步</span>
            <h3>检查学生列表</h3>
            <p>确认姓名、学号、分组都正确。</p>
            <button class="ghost setup-task-button" data-action="go-students">查看学生</button>
          </div>
          <div class="card task-card setup-task-card">
            <span class="badge setup-step-badge">第 3 步</span>
            <h3>完成宠物认领</h3>
            <p>${hasStudents ? `当前已认领 ${claimSummary.claimedCount}/${claimSummary.total}，请先陪学生完成宠物认领。` : "导入学生后，系统会为每位学生建立待认领的宠物档案。"}</p>
            <div class="form-actions setup-task-actions">
              <button class="accent setup-task-button" data-action="go-pet-claim" ${hasStudents ? "" : "disabled"}>宠物认领</button>
              <button class="ghost setup-task-button" data-action="go-students">学生管理</button>
            </div>
          </div>
          <div class="card task-card setup-task-card">
            <span class="badge setup-step-badge">第 4 步</span>
            <h3>开始课堂使用</h3>
            <p>全员认领完成后，才能进入班会喂养、展示模式和学生查看等正式流程。</p>
            <div class="form-actions setup-task-actions">
              <button class="ghost setup-task-button" data-action="go-supervised-feed" ${claimSummary.completed ? "" : "disabled"}>班会喂养</button>
              <button class="ghost setup-task-button" data-action="go-display" ${claimSummary.completed ? "" : "disabled"}>展示模式</button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderTeacherDashboard() {
    const claimSummary = getPetClaimSummary();
    const recentLedger = app.data.ledger.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
    return `
      ${renderBackupReminder()}
      ${renderDataSafetySection()}
      ${renderClaimStatusBanner()}
      ${renderSetupChecklist()}
      <section class="section">
        <h2>教师仪表盘</h2>
        <div class="grid cols-3">
          <div class="card">
            <span class="badge">学生数量</span>
            <h3>${app.data.students.length}</h3>
            <p>每位学生都会创建宠物档案；未认领前不会随机分配宠物。</p>
          </div>
          <div class="card">
            <span class="badge">认领进度</span>
            <h3>${claimSummary.total ? `${claimSummary.claimedCount}/${claimSummary.total}` : "-"}</h3>
            <p>${claimSummary.total ? (claimSummary.completed ? "全班已完成宠物认领。" : `还有 ${claimSummary.pendingCount} 名学生待认领。`) : "导入学生后开始认领。"}</p>
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
          <button
            class="${claimSummary.total && !claimSummary.completed ? "accent" : "ghost"}"
            data-action="go-pet-claim"
            ${claimSummary.completed ? "disabled" : ""}
          >${claimSummary.completed ? "宠物认领已完成" : "宠物认领"}</button>
          <button class="accent" data-action="go-supervised-feed">班会喂养</button>
          <button class="ghost" data-action="go-import">导入导出</button>
          <button class="ghost" data-action="go-settings">系统设置</button>
          <button class="ghost" data-action="open-feedback-modal">反馈建议</button>
        </div>
      </section>

      ${renderAwardBatchSection({ title: "近 7 天加分记录" })}

      <section class="section">
        <h2>最近流水</h2>
        ${renderLedgerTable(recentLedger)}
      </section>
    `;
  }

  Object.assign(CP.views, {
    setAuthError,
    isValidPin,
    getAuthErrorMessage,
    updateAuthError,
    clearBulkPointsDraft,
    toggleBulkPointsDraft,
    setView,
    setModeIndicator,
    logoutTeacher,
    updateHeaderButtons,
    resetSupervisedFeedSession,
    startSupervisedFeedSession,
    markSupervisedFeedVisited,
    markSupervisedFeedFed,
    selectSupervisedFeedStudent,
    leaveSupervisedFeedStudent,
    openSupervisedFeedReAdopt,
    cancelSupervisedFeedReAdopt,
    selectSupervisedFeedReAdoptType,
    endSupervisedFeedSession,
    openDisplayFocus,
    closeDisplayFocus,
    stepDisplayFocus,
    clearDisplayInteraction,
    syncDisplayInteractionDom,
    triggerDisplayInteraction,
    shouldIgnoreDisplayHotkeyTarget,
    setDisplayMotion,
    getLastBackupText,
    shouldShowBackupReminder,
    renderBackupReminder,
    syncBackupStatusDom,
    openFeedbackModal,
    closeFeedbackModal,
    syncFeedbackModalDom,
    renderSetupChecklist,
    formatEffects,
    renderXpProgress,
    render,
    renderHome,
    renderTeacherLogin,
    renderTeacherDashboard,
    renderTeacherStudents,
    renderTeacherPetClaim,
    renderTeacherStudentDetail,
    renderTeacherImport,
    renderTeacherSettings,
    renderStudentView,
    renderSupervisedFeedView,
    renderDisplayView,
    renderLedgerTable
  });
})(window);
