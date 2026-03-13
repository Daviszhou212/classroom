(function (window) {
  const CP = window.ClassroomPetApp;
  const { constants, state, utils, model, views } = CP;
  const { RECOVERY_CODE, SEAT_LABEL, DEFAULT_DATA, PET_TYPES } = constants;
  const { app } = state;
  const { clone, makeId, clamp, showToast } = utils;
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
    clearLastUndoBatch,
    addLedgerEntry,
    setBulkSelectedStudentIds,
    clearBulkSelection,
    computeLevel
  } = model;
  const { setView } = views;

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
      showToast("已导出备份文件", "info");
    }
  }

  function confirmWithAutoBackup(message, tag) {
    if (!confirm(message)) {
      return false;
    }
    exportData({ tag, silent: true });
    return true;
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

  function applyAward(student, points, reason, options = {}) {
    if (!student) return false;
    const delta = Number(points);
    if (!Number.isFinite(delta) || delta <= 0) {
      if (!options.silent) {
        showToast("请输入有效的加分数值", "warning");
      }
      return false;
    }

    if (options.invalidateUndo !== false) {
      clearLastUndoBatch();
    }

    student.points = (student.points || 0) + delta;
    addLedgerEntry({
      timestamp: Date.now(),
      studentId: student.id,
      type: "award",
      deltaPoints: delta,
      reason,
      batchId: options.batchId
    });

    if (options.save !== false) {
      saveData();
    }
    if (!options.silent) {
      showToast("加分成功", "info");
    }
    return true;
  }

  function rememberLastUndoBatch(batchId, studentIds, points, reason) {
    app.data.meta.lastUndoBatch = {
      batchId,
      studentIds: [...studentIds],
      deltaPoints: points,
      reason,
      createdAt: Date.now()
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
      showToast("批量加分数值需为正整数", "warning");
      return false;
    }

    const students = ids.map((id) => getStudentById(id)).filter(Boolean);
    if (students.length !== ids.length) {
      setBulkSelectedStudentIds(students.map((student) => student.id));
      showToast("部分已选学生不存在，请重新确认后再试", "warning");
      return false;
    }

    const batchId = makeId("batch");
    students.forEach((student) => {
      applyAward(student, delta, reason, {
        batchId,
        invalidateUndo: false,
        save: false,
        silent: true
      });
    });
    rememberLastUndoBatch(batchId, ids, delta, reason);
    saveData();
    clearBulkSelection({ clearDrafts: true });
    showToast(`已为 ${students.length} 名学生各加 ${delta} 分`, "info");
    return true;
  }

  function undoLastBulkAward() {
    const batch = app.data.meta.lastUndoBatch;
    if (!batch) {
      showToast("没有可撤销的批量操作", "warning");
      return false;
    }

    const students = batch.studentIds.map((id) => getStudentById(id));
    const entries = app.data.ledger.filter(
      (entry) => entry.batchId === batch.batchId && entry.type === "award"
    );

    const matchedEntries = batch.studentIds.map((studentId) =>
      entries.find(
        (entry) =>
          entry.studentId === studentId &&
          entry.deltaPoints === batch.deltaPoints &&
          entry.reason === batch.reason
      )
    );

    const invalidState =
      entries.length !== batch.studentIds.length ||
      students.some((student) => !student || (student.points || 0) < batch.deltaPoints) ||
      matchedEntries.some((entry) => !entry) ||
      matchedEntries.length !== batch.studentIds.length;

    if (invalidState) {
      clearLastUndoBatch({ save: true });
      showToast("最近一次批量操作已无法撤销", "warning");
      return false;
    }

    students.forEach((student) => {
      student.points -= batch.deltaPoints;
    });

    const removeIds = new Set(matchedEntries.map((entry) => entry.id));
    app.data.ledger = app.data.ledger.filter((entry) => !removeIds.has(entry.id));
    clearLastUndoBatch();
    saveData();
    showToast(`已撤销最近一次批量加分（${batch.studentIds.length} 名）`, "info");
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

    clearLastUndoBatch();
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

    clearLastUndoBatch();
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

    clearLastUndoBatch();
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
        app.data.meta.lastUndoBatch = null;
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
          "导入学生名单会覆盖现有学生、宠物与流水。系统会先自动下载一份备份文件，再继续导入。是否继续？",
          "pre-csv-import"
        )
      ) {
        return;
      }
      app.data.students = students;
      app.data.pets = [];
      app.data.ledger = [];
      app.data.meta.lastUndoBatch = null;
      syncData();
      clearBulkSelection({ clearDrafts: true });
      showToast("学生名单导入成功", "info");
      setView("teacher-students");
    };
    reader.readAsText(file, "utf-8");
  }

  Object.assign(CP.actions, {
    exportData,
    confirmWithAutoBackup,
    hashPin,
    isStoredTeacherPinHashValid,
    getTeacherPinState,
    applyAward,
    rememberLastUndoBatch,
    bulkAwardStudents,
    undoLastBulkAward,
    buyFoodForStudent,
    feedStudent,
    reAdoptPetForStudent,
    validateImport,
    importData,
    parseStudentCsv,
    importStudentsCsv
  });
})(window);
