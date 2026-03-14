(function (window) {
  const CP = window.ClassroomPetApp;
  const { constants, state, dom, utils, model, views, actions } = CP;
  const { DEFAULT_DATA, SEAT_LABEL, PIN_RULE_LABEL, RECOVERY_CODE } = constants;
  const { app } = state;
  const { mainEl, modalRootEl } = dom;
  const { clone, clamp, showToast } = utils;
  const {
    loadData,
    saveData,
    syncData,
    getStudentById,
    getPetByStudentId,
    getSortedStudents,
    getDisplayStudents,
    getBulkSelectedStudentIds,
    setBulkSelectedStudentIds,
    toggleBulkSelectedStudent,
    selectBulkStudents,
    clearBulkSelection,
    generateAlias,
    createPetForStudent
  } = model;
  const {
    setAuthError,
    updateAuthError,
    isValidPin,
    clearBulkPointsDraft,
    toggleBulkPointsDraft,
    setView,
    logoutTeacher,
    startSupervisedFeedSession,
    selectSupervisedFeedStudent,
    selectSupervisedFeedReAdoptType,
    leaveSupervisedFeedStudent,
    endSupervisedFeedSession,
    openDisplayFocus,
    closeDisplayFocus,
    stepDisplayFocus,
    triggerDisplayInteraction,
    shouldIgnoreDisplayHotkeyTarget,
    openFeedbackModal,
    closeFeedbackModal,
    syncBackupStatusDom,
    syncFeedbackModalDom,
    render
  } = views;
  const {
    initFeedbackFileSession,
    exportData,
    confirmWithAutoBackup,
    hashPin,
    getTeacherPinState,
    bulkAwardStudents,
    revokeAwardEntry,
    selectFeedbackSaveFile,
    submitFeedback,
    buyFoodForStudent,
    feedStudent,
    reAdoptPetForStudent,
    importData,
    importStudentsCsv
  } = actions;

  function bindEvents() {
    document.getElementById("homeBtn").addEventListener("click", () => setView("home"));
    document.getElementById("teacherBtn").addEventListener("click", () => setView("teacher-dashboard"));
    document.getElementById("displayBtn").addEventListener("click", () => setView("display-view"));
    const teacherHomeBtn = document.getElementById("teacherHomeBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    if (teacherHomeBtn) teacherHomeBtn.addEventListener("click", () => setView("teacher-dashboard"));
    if (logoutBtn) logoutBtn.addEventListener("click", () => logoutTeacher());

    mainEl.addEventListener("click", async (event) => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      switch (action) {
        case "go-home":
          app.ui.authScreen = "login";
          setView("home");
          break;
        case "go-teacher":
        case "go-dashboard":
          if (!app.auth.teacher) {
            app.ui.authScreen = "login";
          }
          setView("teacher-dashboard");
          break;
        case "go-auth-recover":
          app.ui.authScreen = "recover";
          render();
          break;
        case "go-auth-login":
          app.ui.authScreen = "login";
          render();
          break;
        case "go-students":
          if (!app.auth.teacher) {
            setView("teacher-dashboard");
            return;
          }
          setView("teacher-students");
          break;
        case "pick-students-csv": {
          if (!app.auth.teacher) {
            setView("teacher-dashboard");
            return;
          }
          const setupCard = actionEl.closest(".setup-task-card");
          const fileInput = setupCard ? setupCard.querySelector('input[name="quickStudentCsv"]') : null;
          if (!fileInput) {
            showToast("未找到 CSV 导入入口，请刷新后重试", "warning");
            return;
          }
          fileInput.value = "";
          fileInput.click();
          break;
        }
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
        case "open-feedback-modal":
          if (!app.auth.teacher) {
            setView("teacher-dashboard");
            return;
          }
          openFeedbackModal();
          break;
        case "go-student":
          setView("student-view");
          break;
        case "go-supervised-feed":
          if (!app.auth.teacher) {
            setView("teacher-dashboard");
            return;
          }
          if (!app.data.students.length) {
            showToast("当前还没有学生记录，请先添加或导入学生名单", "warning");
            return;
          }
          startSupervisedFeedSession();
          setView("supervised-feed-view");
          break;
        case "go-display":
          setView("display-view");
          break;
        case "logout-teacher":
          app.ui.authScreen = "login";
          logoutTeacher();
          break;
        case "toggle-bulk-student":
          toggleBulkSelectedStudent(actionEl.dataset.id, actionEl.checked);
          if (!getBulkSelectedStudentIds().length) {
            clearBulkPointsDraft();
          }
          render();
          break;
        case "select-bulk-filtered":
          selectBulkStudents(getSortedStudents().map((student) => student.id));
          render();
          break;
        case "select-bulk-group":
          selectBulkStudents(
            app.data.students
              .filter((student) => String(student.group || "").trim() === actionEl.dataset.group)
              .map((student) => student.id)
          );
          render();
          break;
        case "clear-bulk-selection":
          clearBulkSelection();
          clearBulkPointsDraft();
          render();
          break;
        case "bulk-quick-award": {
          const delta = Number(actionEl.dataset.points || 0);
          toggleBulkPointsDraft(delta);
          render();
          break;
        }
        case "award-batch-prev-page":
          app.ui.awardBatchPage = Math.max(0, Number(app.ui.awardBatchPage || 0) - 1);
          render();
          break;
        case "award-batch-next-page":
          app.ui.awardBatchPage = Number(app.ui.awardBatchPage || 0) + 1;
          render();
          break;
        case "revoke-award-entry":
          revokeAwardEntry(actionEl.dataset.batchId, actionEl.dataset.entryId);
          render();
          break;
        case "edit-student":
          app.ui.editingStudentId = actionEl.dataset.id;
          setView("teacher-students");
          break;
        case "cancel-edit":
          app.ui.editingStudentId = null;
          render();
          break;
        case "delete-student": {
          const student = getStudentById(actionEl.dataset.id);
          const studentLabel = student
            ? `${student.name}（${SEAT_LABEL} ${student.seatNo}）`
            : "该学生";
          if (!confirm(`确认删除 ${studentLabel} 及其宠物档案吗？`)) return;
          app.data.students = app.data.students.filter((item) => item.id !== actionEl.dataset.id);
          app.data.pets = app.data.pets.filter((pet) => pet.studentId !== actionEl.dataset.id);
          setBulkSelectedStudentIds(getBulkSelectedStudentIds().filter((id) => id !== actionEl.dataset.id));
          if (!getBulkSelectedStudentIds().length) {
            clearBulkPointsDraft();
          }
          saveData();
          render();
          showToast("已删除学生", "warning");
          break;
        }
        case "view-student":
          setView("teacher-student-detail", { id: actionEl.dataset.id });
          break;
        case "select-supervised-feed-student":
          selectSupervisedFeedStudent(actionEl.dataset.id);
          break;
        case "select-supervised-feed-pet-type":
          selectSupervisedFeedReAdoptType(actionEl.dataset.id);
          break;
        case "confirm-supervised-re-adopt":
          reAdoptPetForStudent(app.ui.supervisedFeedStudentId, app.ui.supervisedFeedReAdoptDraftTypeId);
          render();
          break;
        case "return-supervised-feed-roster":
        case "skip-supervised-feed":
          leaveSupervisedFeedStudent();
          break;
        case "buy-food":
          if (!app.auth.teacher || !app.ui.supervisedFeedSessionActive || !app.ui.supervisedFeedStudentId) {
            showToast("请先由老师开启班会喂养会话", "warning");
            return;
          }
          buyFoodForStudent(app.ui.supervisedFeedStudentId, actionEl.dataset.id);
          render();
          break;
        case "supervised-feed":
          if (!app.auth.teacher || !app.ui.supervisedFeedSessionActive || !app.ui.supervisedFeedStudentId) {
            showToast("请先由老师开启班会喂养会话", "warning");
            return;
          }
          feedStudent(app.ui.supervisedFeedStudentId, actionEl.dataset.id);
          render();
          break;
        case "end-supervised-feed-session":
          endSupervisedFeedSession();
          break;
        case "select-student":
          app.ui.studentSelectedId = actionEl.dataset.id;
          render();
          break;
        case "open-display-modal":
          openDisplayFocus(actionEl.dataset.id);
          break;
        case "close-student-modal":
          app.ui.studentSelectedId = null;
          render();
          break;
        case "close-display-modal":
          closeDisplayFocus();
          break;
        case "display-prev-student":
          stepDisplayFocus(-1);
          break;
        case "display-next-student":
          stepDisplayFocus(1);
          break;
        case "display-greet":
          triggerDisplayInteraction("greet");
          break;
        case "display-encourage":
          triggerDisplayInteraction("encourage");
          break;
        case "noop":
          break;
        case "export-data":
          exportData();
          render();
          break;
        case "reset-data":
          if (
            !confirmWithAutoBackup(
              "确认清空当前浏览器里的所有数据吗？系统会先自动下载一份备份文件，此操作不可撤销。",
              "pre-reset"
            )
          ) {
            return;
          }
          app.data = clone(DEFAULT_DATA);
          app.ui = {
            ...app.ui,
            authScreen: "login",
            studentSearch: "",
            editingStudentId: null,
            studentSelectedId: null,
            bulkSelectedStudentIds: [],
            bulkPointsDraft: "",
            bulkReasonTemplateDraft: "",
            bulkReasonCustomDraft: "",
            awardBatchPage: 0,
            displaySearch: "",
            displayPage: 0,
            displaySelectedId: null,
            displayMotion: "",
            displayFreeze: false,
            supervisedFeedSessionActive: false,
            supervisedFeedStudentId: null,
            supervisedFeedVisitedStudentIds: [],
            supervisedFeedReAdoptDraftTypeId: null,
            feedbackModalOpen: false,
            feedbackDraft: ""
          };
          closeFeedbackModal({ clearDraft: true });
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

    if (modalRootEl) {
      modalRootEl.addEventListener("click", async (event) => {
        const actionEl = event.target.closest("[data-action]");
        if (!actionEl) return;
        switch (actionEl.dataset.action) {
          case "close-feedback-modal":
            closeFeedbackModal();
            break;
          case "feedback-select-file": {
            const result = await selectFeedbackSaveFile();
            syncFeedbackModalDom({ draft: app.ui.feedbackDraft });
            if (result.ok) {
              showToast(`已绑定反馈文件：${result.fileName}`, "info");
            } else if (result.status === "unsupported") {
              showToast("当前环境不支持持续写入同一文件，提交时会自动下载 JSONL 文件", "warning");
            } else if (result.status === "error") {
              showToast("选择保存文件失败，将在提交时自动回退为下载", "warning");
            }
            break;
          }
          case "feedback-backup-now":
            exportData();
            syncBackupStatusDom();
            syncFeedbackModalDom({ draft: app.ui.feedbackDraft });
            break;
          case "noop":
            break;
          default:
            break;
        }
      });

      modalRootEl.addEventListener("submit", async (event) => {
        const form = event.target;
        if (form.dataset.action !== "submit-feedback") return;
        event.preventDefault();

        if (!app.auth.teacher) {
          closeFeedbackModal();
          setView("teacher-dashboard");
          return;
        }

        const message = form.feedbackMessage.value;
        const result = await submitFeedback(message);
        if (!result.ok) {
          showToast(result.message, result.type || "warning");
          app.ui.feedbackDraft = String(message || "");
          return;
        }

        app.ui.feedbackDraft = "";
        showToast(result.message, result.type || "info");
        syncFeedbackModalDom({
          draft: "",
          focusInput: true
        });
      });

      modalRootEl.addEventListener("input", (event) => {
        if (event.target.id === "feedbackMessage") {
          app.ui.feedbackDraft = event.target.value;
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (app.ui.feedbackModalOpen && event.key === "Escape") {
        event.preventDefault();
        closeFeedbackModal();
        return;
      }

      const actionEl =
        event.target && typeof event.target.closest === "function"
          ? event.target.closest('[data-action="open-display-modal"]')
          : null;
      if (actionEl && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openDisplayFocus(actionEl.dataset.id);
        return;
      }

      if (app.view !== "display-view" || !model.getDisplayFocusContext().hasFocus) {
        return;
      }
      if (shouldIgnoreDisplayHotkeyTarget(event.target)) {
        return;
      }

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          closeDisplayFocus();
          break;
        case "ArrowLeft":
          event.preventDefault();
          stepDisplayFocus(-1);
          break;
        case "ArrowRight":
          event.preventDefault();
          stepDisplayFocus(1);
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
          if (!updateAuthError(form, { strict: true })) {
            return;
          }
          app.data.config.teacherPinHash = await hashPin(pin);
          saveData();
          app.auth.teacher = true;
          app.ui.authScreen = "login";
          sessionStorage.setItem("teacherAuthed", "1");
          setAuthError("");
          showToast("PIN 设置成功", "info");
          setView("teacher-dashboard");
          break;
        }
        case "login-pin": {
          const pinState = getTeacherPinState();
          if (pinState === "corrupt") {
            setAuthError("教师 PIN 配置已损坏，请先点击“重新设置 PIN”");
            return;
          }
          if (pinState === "unset") {
            setAuthError("请先设置教师 PIN");
            return;
          }
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
          app.ui.authScreen = "login";
          sessionStorage.setItem("teacherAuthed", "1");
          setAuthError("");
          showToast("欢迎进入教师模式", "info");
          setView("teacher-dashboard");
          break;
        }
        case "recover-pin": {
          const recoveryCode = form.recoveryCode.value.trim();
          const newPin = form.newPin.value.trim();
          const newPinConfirm = form.newPinConfirm.value.trim();
          if (!recoveryCode) {
            setAuthError("请输入恢复码");
            return;
          }
          if (recoveryCode !== RECOVERY_CODE) {
            setAuthError("恢复码不正确");
            return;
          }
          if (!newPin) {
            setAuthError("请输入新 PIN");
            return;
          }
          if (!isValidPin(newPin)) {
            setAuthError("PIN 只能包含字母和数字，长度为 4-8 位");
            return;
          }
          if (!newPinConfirm) {
            setAuthError("请确认新 PIN");
            return;
          }
          if (!isValidPin(newPinConfirm)) {
            setAuthError("PIN 只能包含字母和数字，长度为 4-8 位");
            return;
          }
          if (newPin !== newPinConfirm) {
            setAuthError("两次 PIN 不一致");
            return;
          }
          app.data.config.teacherPinHash = await hashPin(newPin);
          saveData();
          app.auth.teacher = true;
          app.ui.authScreen = "login";
          sessionStorage.setItem("teacherAuthed", "1");
          setAuthError("");
          showToast("PIN 已重新设置", "info");
          setView("teacher-dashboard");
          break;
        }
        case "change-pin": {
          if (getTeacherPinState() === "corrupt") {
            showToast("教师 PIN 配置已损坏，请退出后使用恢复码重新设置", "danger");
            return;
          }
          const currentPin = form.currentPin.value.trim();
          const newPin = form.newPin.value.trim();
          if (!isValidPin(newPin)) {
            showToast(`新 PIN 需为 ${PIN_RULE_LABEL}`, "warning");
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
          const alias = generateAlias(name);
          if (!name || !seatNo) {
            showToast(`姓名和${SEAT_LABEL}必填`, "warning");
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
              id: utils.makeId("student"),
              name,
              seatNo,
              group,
              alias,
              points: 0,
              foodInventory: []
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
        case "bulk-award": {
          const selectedIds = getBulkSelectedStudentIds();
          const points = Number(form.bulkPoints.value);
          const reason = form.bulkReasonCustom.value.trim() || form.bulkReasonTemplate.value || "加分";
          const success = bulkAwardStudents(selectedIds, points, reason);
          if (success) {
            clearBulkPointsDraft();
            form.reset();
          }
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
        if (authForm && (authForm.dataset.action === "login-pin" || authForm.dataset.action === "set-pin" || authForm.dataset.action === "recover-pin")) {
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
      if (event.target.id === "bulkPointsDraft") {
        app.ui.bulkPointsDraft = event.target.value;
        preserveInputFocus("bulkPointsDraft", render);
      }
      if (event.target.id === "bulkReasonCustomDraft") {
        app.ui.bulkReasonCustomDraft = event.target.value;
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

    mainEl.addEventListener("change", (event) => {
      if (event.target.name === "quickStudentCsv") {
        if (!app.auth.teacher) {
          event.target.value = "";
          setView("teacher-dashboard");
          return;
        }
        if (!event.target.files.length) {
          event.target.value = "";
          return;
        }
        // 教师首页第 1 步直接复用现有 CSV 导入逻辑。
        importStudentsCsv(event.target.files[0]);
        event.target.value = "";
        return;
      }
      if (event.target.id === "bulkReasonTemplateDraft") {
        app.ui.bulkReasonTemplateDraft = event.target.value;
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
    initFeedbackFileSession();
    syncData();
    bindEvents();
    render();
  }

  CP.preserveInputFocus = preserveInputFocus;
  CP.preserveScrollPosition = preserveScrollPosition;
  CP.events = {
    bindEvents,
    preserveInputFocus,
    preserveScrollPosition
  };
  CP.init = init;
})(window);
