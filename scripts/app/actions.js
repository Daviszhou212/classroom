(function (window) {
  const CP = window.ClassroomPetApp;
  const { constants, state, utils, model, views } = CP;
  const {
    SEAT_LABEL,
    PET_TYPES,
    AWARD_REVOCATION_WINDOW,
    FEEDBACK_MAX_LENGTH,
    FEEDBACK_STORAGE_LIMIT,
    FEEDBACK_FILE_DEFAULT_NAME
  } = constants;
  const { app } = state;
  const { makeId, clamp, showToast } = utils;
  const {
    saveData,
    sanitizeAlias,
    generateAlias,
    normalizeData,
    syncData,
    getStudentById,
    getCatalogItem,
    getPetByStudentId,
    getPetTypeName,
    isPetEligibleForReAdopt,
    getPetReAdoptStatus,
    addLedgerEntry,
    addAwardBatch,
    getAwardBatchById,
    getAwardBatchEntryById,
    getAwardEntryStatus,
    getFeedbackEntries,
    setBulkSelectedStudentIds,
    clearBulkSelection,
    computeLevel
  } = model;
  const { setView } = views;

  function getFeedbackFileSupport() {
    return Boolean(window.isSecureContext && typeof window.showSaveFilePicker === "function");
  }

  function initFeedbackFileSession() {
    const previous = state.feedbackFileSession || {};
    const supported = getFeedbackFileSupport();
    state.feedbackFileSession = {
      supported,
      mode: supported ? (previous.handle ? "file" : "picker") : "download",
      handle: supported ? previous.handle || null : null,
      fileName: supported ? previous.fileName || "" : "",
      lastWriteStatus: previous.lastWriteStatus || "idle",
      lastWriteName: previous.lastWriteName || "",
      lastError: previous.lastError || ""
    };
    return state.feedbackFileSession;
  }

  function setFeedbackFileSession(patch = {}) {
    const session = initFeedbackFileSession();
    state.feedbackFileSession = {
      ...session,
      ...patch
    };
    return state.feedbackFileSession;
  }

  function buildFeedbackJsonlLine(entry) {
    return `${JSON.stringify(entry)}\n`;
  }

  function buildFeedbackDownloadFileName(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
      date.getDate()
    ).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(
      2,
      "0"
    )}${String(date.getSeconds()).padStart(2, "0")}`;
    return `class-pet-feedback-${stamp}.jsonl`;
  }

  function downloadTextFile(text, fileName, type = "application/x-ndjson") {
    try {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return { ok: true, fileName };
    } catch (error) {
      console.error(error);
      return { ok: false, error };
    }
  }

  function downloadFeedbackEntry(entry) {
    return downloadTextFile(buildFeedbackJsonlLine(entry), buildFeedbackDownloadFileName(entry.createdAt));
  }

  async function selectFeedbackSaveFile() {
    const session = initFeedbackFileSession();
    if (!session.supported) {
      setFeedbackFileSession({
        mode: "download",
        handle: null,
        fileName: "",
        lastWriteStatus: "unsupported",
        lastError: ""
      });
      return { ok: false, status: "unsupported" };
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: FEEDBACK_FILE_DEFAULT_NAME,
        types: [
          {
            description: "JSON Lines",
            accept: {
              "application/x-ndjson": [".jsonl"],
              "application/json": [".jsonl"]
            }
          }
        ]
      });

      const fileName = handle.name || FEEDBACK_FILE_DEFAULT_NAME;
      setFeedbackFileSession({
        mode: "file",
        handle,
        fileName,
        lastWriteStatus: "selected",
        lastWriteName: fileName,
        lastError: ""
      });
      return { ok: true, status: "selected", fileName };
    } catch (error) {
      if (error && error.name === "AbortError") {
        setFeedbackFileSession({
          mode: "picker",
          handle: null,
          fileName: "",
          lastWriteStatus: "cancelled",
          lastWriteName: "",
          lastError: ""
        });
        return { ok: false, status: "cancelled" };
      }

      console.error(error);
      setFeedbackFileSession({
        mode: "picker",
        handle: null,
        fileName: "",
        lastWriteStatus: "error",
        lastWriteName: "",
        lastError: String((error && error.message) || error || "选择保存文件失败")
      });
      return { ok: false, status: "error", error };
    }
  }

  async function appendFeedbackEntryToFile(entry) {
    const session = initFeedbackFileSession();
    if (!session.supported || !session.handle) {
      return { ok: false, status: "not_ready" };
    }

    try {
      const file = await session.handle.getFile();
      const writable = await session.handle.createWritable({ keepExistingData: true });
      await writable.seek(file.size);
      await writable.write(buildFeedbackJsonlLine(entry));
      await writable.close();

      const fileName = session.handle.name || session.fileName || FEEDBACK_FILE_DEFAULT_NAME;
      setFeedbackFileSession({
        mode: "file",
        handle: session.handle,
        fileName,
        lastWriteStatus: "written",
        lastWriteName: fileName,
        lastError: ""
      });
      return { ok: true, status: "written", fileName };
    } catch (error) {
      console.error(error);
      setFeedbackFileSession({
        mode: session.supported ? "picker" : "download",
        handle: null,
        fileName: "",
        lastWriteStatus: "error",
        lastWriteName: "",
        lastError: String((error && error.message) || error || "写入反馈文件失败")
      });
      return { ok: false, status: "error", error };
    }
  }

  async function syncFeedbackEntryToLocalFile(entry) {
    const session = initFeedbackFileSession();

    if (session.supported) {
      if (session.handle) {
        const writeResult = await appendFeedbackEntryToFile(entry);
        if (writeResult.ok) {
          return { kind: "browser_and_file", fileName: writeResult.fileName };
        }
      } else {
        const selectionResult = await selectFeedbackSaveFile();
        if (selectionResult.ok) {
          const writeResult = await appendFeedbackEntryToFile(entry);
          if (writeResult.ok) {
            return { kind: "browser_and_file", fileName: writeResult.fileName };
          }
        }
      }
    }

    const downloadResult = downloadFeedbackEntry(entry);
    if (downloadResult.ok) {
      setFeedbackFileSession({
        mode: session.supported ? "picker" : "download",
        lastWriteStatus: "downloaded",
        lastWriteName: downloadResult.fileName,
        lastError: ""
      });
      return { kind: "browser_and_download", fileName: downloadResult.fileName };
    }

    setFeedbackFileSession({
      mode: session.supported ? "picker" : "download",
      lastWriteStatus: "browser_only",
      lastWriteName: "",
      lastError: String((downloadResult.error && downloadResult.error.message) || downloadResult.error || "下载反馈文件失败")
    });
    return { kind: "browser_only" };
  }

  function getFeedbackPersistenceToast(persistence) {
    if (!persistence || persistence.kind === "browser_only") {
      return {
        message: "反馈已保存到浏览器，本地文件未保存",
        type: "warning"
      };
    }
    if (persistence.kind === "browser_and_file") {
      return {
        message: "反馈已保存到浏览器，并已写入本地文件",
        type: "info"
      };
    }
    return {
      message: "反馈已保存到浏览器，并已下载本地 JSONL 文件",
      type: "info"
    };
  }

  function exportData(options = {}) {
    const now = Date.now();
    app.data.config.lastBackupAt = now;
    saveData();

    const payload = JSON.stringify(app.data, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date(now);
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
      date.getDate()
    ).padStart(2, "0")}`;
    const suffix = options.tag ? `-${options.tag}` : "";
    a.href = url;
    a.download = `class-pet-backup-${stamp}${suffix}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (!options.silent) {
      showToast("已开始下载备份，请务必检查文件确实已保存到本地。", "warning");
    }

    return {
      timestamp: now,
      fileName: a.download
    };
  }

  function confirmWithAutoBackup(message, tag) {
    if (!confirm(message)) {
      return false;
    }
    exportData({ tag, silent: true });
    return true;
  }

  async function submitFeedback(message) {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
      return {
        ok: false,
        message: "请先填写反馈内容",
        type: "warning"
      };
    }
    if (normalizedMessage.length > FEEDBACK_MAX_LENGTH) {
      return {
        ok: false,
        message: `反馈内容不能超过 ${FEEDBACK_MAX_LENGTH} 个字`,
        type: "warning"
      };
    }

    const nextEntry = {
      id: makeId("feedback"),
      message: normalizedMessage,
      createdAt: Date.now(),
      source: "teacher"
    };

    app.data.meta = {
      ...(app.data.meta || {})
    };
    app.data.meta.feedbackEntries = [nextEntry, ...getFeedbackEntries()].slice(0, FEEDBACK_STORAGE_LIMIT);
    saveData();

    const persistence = await syncFeedbackEntryToLocalFile(nextEntry);
    const toast = getFeedbackPersistenceToast(persistence);
    return {
      ok: true,
      entry: nextEntry,
      persistence,
      message: toast.message,
      type: toast.type
    };
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

  function isStoredTeacherPinHashValid(value) {
    const normalized = String(value ?? "").trim();
    return normalized === "" || /^[a-f0-9]{64}$/.test(normalized) || /^legacy--?\d+$/.test(normalized);
  }

  function getTeacherPinState() {
    const teacherPinHash = String(app.data?.config?.teacherPinHash ?? "").trim();
    if (!teacherPinHash) return "unset";
    return isStoredTeacherPinHashValid(teacherPinHash) ? "valid" : "corrupt";
  }

  function createAwardBatchRecord(studentIds, points, reason) {
    const now = Date.now();
    return {
      id: makeId("award-batch"),
      reason: String(reason || "加分").trim() || "加分",
      createdAt: now,
      entries: [...studentIds].map((studentId) => ({
        id: makeId("award-entry"),
        studentId,
        points,
        reason: String(reason || "加分").trim() || "加分",
        createdAt: now,
        revocableUntil: now + AWARD_REVOCATION_WINDOW,
        revokedAt: null,
        revokeReason: ""
      }))
    };
  }

  function bulkAwardStudents(studentIds, points, reason) {
    const delta = Number(points);
    const ids = [...new Set(studentIds)].filter(Boolean);
    if (!ids.length) {
      showToast("请先选择学生", "warning");
      return false;
    }
    if (!Number.isFinite(delta) || delta <= 0 || !Number.isInteger(delta)) {
      showToast("加分数值需为正整数", "warning");
      return false;
    }

    const students = ids.map((id) => getStudentById(id)).filter(Boolean);
    if (students.length !== ids.length) {
      setBulkSelectedStudentIds(students.map((student) => student.id));
      showToast("部分已选学生不存在，请重新确认后再试", "warning");
      return false;
    }

    const batch = addAwardBatch(createAwardBatchRecord(ids, delta, reason));
    if (!batch) {
      showToast("创建加分批次失败，请稍后重试", "danger");
      return false;
    }

    batch.entries.forEach((entry) => {
      const student = getStudentById(entry.studentId);
      if (!student) return;
      student.points = (student.points || 0) + delta;
      addLedgerEntry({
        timestamp: batch.createdAt,
        studentId: student.id,
        type: "award",
        deltaPoints: delta,
        reason: batch.reason,
        batchId: batch.id,
        awardEntryId: entry.id
      });
    });

    saveData();
    clearBulkSelection({ clearDrafts: true });
    showToast(`已为 ${students.length} 名学生各加 ${delta} 分`, "info");
    return true;
  }

  function revokeAwardEntry(batchId, entryId) {
    const batch = getAwardBatchById(batchId);
    if (!batch) {
      showToast("未找到对应的加分批次", "warning");
      return false;
    }

    const awardEntry = getAwardBatchEntryById(batch, entryId);
    if (!awardEntry) {
      showToast("未找到对应的加分条目", "warning");
      return false;
    }

    const status = getAwardEntryStatus(awardEntry);
    if (status.code === "revoked") {
      showToast("该加分条目已撤销", "warning");
      return false;
    }
    if (status.code === "expired") {
      showToast("该加分条目已过期，不能再撤销", "warning");
      return false;
    }
    if (status.code === "missing_student") {
      showToast("该加分条目对应的学生已删除，不能撤销", "warning");
      return false;
    }
    if (status.code === "insufficient_points") {
      showToast("学生当前积分不足，暂时不能撤销这笔加分", "warning");
      return false;
    }

    const student = getStudentById(awardEntry.studentId);
    if (!student) {
      showToast("未找到对应学生，不能撤销", "warning");
      return false;
    }
    const now = Date.now();
    const revokeReason = "教师撤销加分";

    student.points -= awardEntry.points;
    addLedgerEntry({
      timestamp: now,
      studentId: student.id,
      type: "award_revoke",
      deltaPoints: -awardEntry.points,
      reason: revokeReason,
      batchId: batch.id,
      awardEntryId: awardEntry.id
    });

    awardEntry.revokedAt = now;
    awardEntry.revokeReason = revokeReason;
    saveData();
    showToast(`已撤销 ${student.name} 的这条加分`, "info");
    return true;
  }

  function buyFoodForStudent(studentId, catalogId) {
    const student = getStudentById(studentId);
    const item = getCatalogItem(catalogId);
    if (!student || !item) return false;
    if ((student.points || 0) < item.pricePoints) {
      showToast("积分不足，无法兑换这份食物", "warning");
      return false;
    }

    student.points -= item.pricePoints;
    const nextInventory = Array.isArray(student.foodInventory) ? [...student.foodInventory] : [];
    const inventoryIndex = nextInventory.findIndex((entry) => entry.catalogId === item.id);
    if (inventoryIndex >= 0) {
      nextInventory[inventoryIndex] = {
        ...nextInventory[inventoryIndex],
        quantity: (Number(nextInventory[inventoryIndex].quantity) || 0) + 1
      };
    } else {
      nextInventory.push({
        catalogId: item.id,
        quantity: 1
      });
    }
    student.foodInventory = nextInventory;

    addLedgerEntry({
      timestamp: Date.now(),
      studentId: student.id,
      type: "buy_food",
      deltaPoints: -item.pricePoints,
      reason: `兑换食物：${item.name}`
    });

    saveData();
    showToast(`已兑换 1 份${item.name}，可到背包中喂给宠物`, "info");
    return true;
  }

  function feedStudent(studentId, catalogId) {
    const student = getStudentById(studentId);
    const pet = getPetByStudentId(studentId);
    const item = getCatalogItem(catalogId);
    if (!student || !pet || !item) return false;

    const nextInventory = Array.isArray(student.foodInventory) ? [...student.foodInventory] : [];
    const inventoryIndex = nextInventory.findIndex((entry) => entry.catalogId === item.id);
    const currentQuantity = inventoryIndex >= 0 ? Number(nextInventory[inventoryIndex].quantity) || 0 : 0;
    if (currentQuantity <= 0) {
      showToast("背包里还没有这份食物，请先兑换", "warning");
      return false;
    }

    if (currentQuantity === 1) {
      nextInventory.splice(inventoryIndex, 1);
    } else {
      nextInventory[inventoryIndex] = {
        ...nextInventory[inventoryIndex],
        quantity: currentQuantity - 1
      };
    }
    student.foodInventory = nextInventory;

    const hungerEffect = Number(item.effects.hunger || 0);
    pet.hunger = clamp(pet.hunger - hungerEffect, 0, 100);
    pet.mood = clamp(pet.mood + (item.effects.mood || 0), 0, 100);
    pet.xp += item.effects.xp || 0;
    const newLevel = computeLevel(pet.xp);
    const leveledUp = newLevel > pet.level;
    pet.level = newLevel;
    pet.reAdoptAvailable = false;
    pet.updatedAt = Date.now();

    addLedgerEntry({
      timestamp: Date.now(),
      studentId: student.id,
      type: "feed",
      deltaHunger: -hungerEffect,
      deltaMood: item.effects.mood || 0,
      deltaXp: item.effects.xp || 0,
      reason: `喂食：${item.name}`
    });

    saveData();
    showToast(leveledUp ? "喂养成功，宠物升级！" : "喂养成功", "info");
    return true;
  }

  function reAdoptPetForStudent(studentId, targetPetTypeId) {
    const student = getStudentById(studentId);
    const pet = getPetByStudentId(studentId);
    const targetType = PET_TYPES.find((type) => type.id === targetPetTypeId);

    if (!app.auth.teacher || !app.ui.supervisedFeedSessionActive || app.ui.supervisedFeedStudentId !== studentId) {
      showToast("请先由老师开启对应学生的班会喂养回合", "warning");
      return false;
    }
    if (!student || !pet || !targetType) {
      showToast("请选择有效的宠物类型", "warning");
      return false;
    }
    if (!isPetEligibleForReAdopt(studentId, pet)) {
      showToast(getPetReAdoptStatus(studentId, pet).message, "warning");
      return false;
    }
    if (pet.petType === targetPetTypeId) {
      showToast("请选择一种不同的宠物", "warning");
      return false;
    }

    const previousTypeName = getPetTypeName(pet);
    if (!confirm(`确认把宠物从“${previousTypeName}”改为“${targetType.name}”吗？此机会每人只有一次。`)) {
      return false;
    }

    const now = Date.now();
    pet.petType = targetPetTypeId;
    pet.reAdoptAvailable = false;
    pet.reAdoptedAt = now;
    pet.updatedAt = now;

    addLedgerEntry({
      timestamp: now,
      studentId: student.id,
      type: "re_adopt",
      reason: `重新领养：${previousTypeName} -> ${targetType.name}`
    });

    app.ui.supervisedFeedReAdoptDraftTypeId = null;
    saveData();
    showToast(`重新领养成功，已换成${targetType.name}`, "info");
    return true;
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
    if ("awardBatches" in data && !Array.isArray(data.awardBatches)) errors.push("awardBatches 必须是数组");
    if (!data.config || typeof data.config !== "object") errors.push("缺少 config");
    if (data.config && typeof data.config === "object") {
      const teacherPinHash = typeof data.config.teacherPinHash === "string" ? data.config.teacherPinHash.trim() : "";
      if (!isStoredTeacherPinHashValid(teacherPinHash)) errors.push("教师 PIN 配置无效");
    }
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
        if (!confirmWithAutoBackup("导入会覆盖当前数据。系统会先自动下载一份备份文件，再继续导入。是否继续？", "pre-import")) {
          return;
        }
        app.data = normalizeData(parsed);
        syncData();
        app.ui.studentSelectedId = null;
        app.ui.editingStudentId = null;
        clearBulkSelection({ clearDrafts: true });
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
      /座号|学号|姓名|分组|拼音|英文/.test(headerLine);
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
        errors.push(`第 ${i + 1} 行缺少${SEAT_LABEL}或姓名`);
        continue;
      }
      students.push({
        id: makeId("student"),
        seatNo: studentNo,
        name,
        group,
        alias: sanitizeAlias(alias) || generateAlias(name),
        points: 0,
        foodInventory: []
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
      if (
        !confirmWithAutoBackup(
          "导入学生名单会覆盖现有学生、宠物、流水和加分批次。系统会先自动下载一份备份文件，再继续导入。是否继续？",
          "pre-csv-import"
        )
      ) {
        return;
      }
      app.data.students = students;
      app.data.pets = [];
      app.data.ledger = [];
      app.data.awardBatches = [];
      syncData();
      clearBulkSelection({ clearDrafts: true });
      showToast("学生名单导入成功", "info");
      setView("teacher-students");
    };
    reader.readAsText(file, "utf-8");
  }

  Object.assign(CP.actions, {
    initFeedbackFileSession,
    exportData,
    confirmWithAutoBackup,
    selectFeedbackSaveFile,
    getFeedbackPersistenceToast,
    submitFeedback,
    hashPin,
    isStoredTeacherPinHashValid,
    getTeacherPinState,
    bulkAwardStudents,
    revokeAwardEntry,
    buyFoodForStudent,
    feedStudent,
    reAdoptPetForStudent,
    validateImport,
    importData,
    parseStudentCsv,
    importStudentsCsv
  });
})(window);
