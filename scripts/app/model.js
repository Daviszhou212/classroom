(function (window) {
  const CP = window.ClassroomPetApp;
  const { constants, state, utils } = CP;
  const { STORAGE_KEY, DEFAULT_DATA, PET_TYPES } = constants;
  const { app } = state;
  const { clone, makeId, formatTime } = utils;

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

  function sanitizeAlias(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function generateAlias(name) {
    const text = String(name || "").trim();
    if (!text) return "";

    try {
      const pinyinApi = window.pinyinPro && typeof window.pinyinPro.pinyin === "function"
        ? window.pinyinPro.pinyin
        : null;
      if (pinyinApi) {
        const result = pinyinApi(text, { toneType: "none", type: "array" });
        const joined = Array.isArray(result) ? result.join("") : result;
        const alias = sanitizeAlias(joined);
        if (alias) return alias;
      }
    } catch (err) {
      console.warn("生成拼音失败，使用简化别名", err);
    }

    return sanitizeAlias(
      text
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0] || "")
        .join("")
    );
  }

  function normalizeStudent(student) {
    const normalizedStudent = {
      points: 0,
      group: "",
      alias: "",
      ...student
    };
    normalizedStudent.alias = sanitizeAlias(normalizedStudent.alias) || generateAlias(normalizedStudent.name);
    return normalizedStudent;
  }

  function normalizeData(data) {
    const normalized = clone(DEFAULT_DATA);
    normalized.schemaVersion =
      typeof data.schemaVersion === "number"
        ? Math.max(data.schemaVersion, DEFAULT_DATA.schemaVersion)
        : DEFAULT_DATA.schemaVersion;
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
    normalized.meta = {
      ...DEFAULT_DATA.meta,
      ...(data.meta || {})
    };

    const undoBatch = normalized.meta.lastUndoBatch;
    if (
      !undoBatch ||
      typeof undoBatch !== "object" ||
      typeof undoBatch.batchId !== "string" ||
      !Array.isArray(undoBatch.studentIds) ||
      typeof undoBatch.deltaPoints !== "number" ||
      typeof undoBatch.reason !== "string" ||
      typeof undoBatch.createdAt !== "number"
    ) {
      normalized.meta.lastUndoBatch = null;
    }

    normalized.students = normalized.students.map(normalizeStudent);
    normalized.ledger = normalized.ledger.map((entry) => ({
      ...entry,
      batchId: typeof entry.batchId === "string" ? entry.batchId : undefined
    }));
    const feedHistoryStudentIds = new Set(
      normalized.ledger.filter((entry) => entry.type === "feed" && entry.studentId).map((entry) => entry.studentId)
    );
    normalized.pets = normalized.pets.map((pet) => {
      const normalizedPet = { ...pet };
      ensurePetReAdoptState(normalizedPet, {
        hasFeedHistory: feedHistoryStudentIds.has(normalizedPet.studentId)
      });
      return normalizedPet;
    });

    return normalized;
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app.data));
  }

  function syncData() {
    const studentIds = new Set(app.data.students.map((student) => student.id));
    app.data.pets = app.data.pets.filter((pet) => studentIds.has(pet.studentId));

    for (const student of app.data.students) {
      if (!app.data.pets.find((pet) => pet.studentId === student.id)) {
        app.data.pets.push(createPetForStudent(student));
      }
    }
    const feedHistoryStudentIds = new Set(
      app.data.ledger.filter((entry) => entry.type === "feed" && entry.studentId).map((entry) => entry.studentId)
    );
    app.data.pets.forEach((pet) => {
      ensurePetType(pet);
      ensurePetReAdoptState(pet, { hasFeedHistory: feedHistoryStudentIds.has(pet.studentId) });
    });
    app.ui.bulkSelectedStudentIds = app.ui.bulkSelectedStudentIds.filter((id) => studentIds.has(id));
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
      reAdoptAvailable: true,
      reAdoptedAt: null,
      updatedAt: now
    };
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

  function hasStudentFeedHistory(studentId) {
    return app.data.ledger.some((entry) => entry.studentId === studentId && entry.type === "feed");
  }

  function ensurePetReAdoptState(pet, options = {}) {
    const hasFeedHistory = options.hasFeedHistory === true;
    const reAdoptedAt = typeof pet.reAdoptedAt === "number" ? pet.reAdoptedAt : null;
    const storedAvailability =
      typeof pet.reAdoptAvailable === "boolean"
        ? pet.reAdoptAvailable
        : !reAdoptedAt;

    pet.reAdoptedAt = reAdoptedAt;
    pet.reAdoptAvailable = !reAdoptedAt && !hasFeedHistory && storedAvailability;
  }

  function getPetIcon(pet) {
    return getPetType(pet.petType).icon;
  }

  function getPetTypeName(pet) {
    return getPetType(pet.petType).name;
  }

  function getPetReAdoptStatus(studentId, pet) {
    if (!pet) {
      return {
        available: false,
        message: "未找到宠物档案。"
      };
    }

    if (pet.reAdoptedAt) {
      return {
        available: false,
        message: "重新领养机会已使用，之后只能继续照顾当前宠物。"
      };
    }

    if (hasStudentFeedHistory(studentId)) {
      return {
        available: false,
        message: "首次喂养后不可重新领养，请继续照顾当前宠物。"
      };
    }

    if (pet.reAdoptAvailable === false) {
      return {
        available: false,
        message: "重新领养机会已使用，之后只能继续照顾当前宠物。"
      };
    }

    return {
      available: true,
      message: "你还有 1 次重新领养机会。更换后不会影响等级、经验、饥饿值、心情值和积分。"
    };
  }

  function isPetEligibleForReAdopt(studentId, pet) {
    return getPetReAdoptStatus(studentId, pet).available;
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

  function getDisplayFocusContext() {
    const students = getDisplayStudents();
    const selectedId = app.ui.displaySelectedId;
    if (!selectedId) {
      return {
        students,
        total: students.length,
        index: -1,
        student: null,
        pet: null,
        hasFocus: false,
        invalidSelection: false,
        hasPrev: false,
        hasNext: false
      };
    }

    const index = students.findIndex((student) => student.id === selectedId);
    if (index === -1) {
      return {
        students,
        total: students.length,
        index: -1,
        student: null,
        pet: null,
        hasFocus: false,
        invalidSelection: true,
        hasPrev: false,
        hasNext: false
      };
    }

    const student = students[index];
    const pet = getPetByStudentId(student.id);
    if (!pet) {
      return {
        students,
        total: students.length,
        index: -1,
        student: null,
        pet: null,
        hasFocus: false,
        invalidSelection: true,
        hasPrev: false,
        hasNext: false
      };
    }

    return {
      students,
      total: students.length,
      index,
      student,
      pet,
      hasFocus: true,
      invalidSelection: false,
      hasPrev: index > 0,
      hasNext: index < students.length - 1
    };
  }

  function getSupervisedFeedVisitedStudentIds() {
    const studentIds = new Set(app.data.students.map((student) => student.id));
    return app.ui.supervisedFeedVisitedStudentIds.filter(
      (id, index, list) => studentIds.has(id) && list.indexOf(id) === index
    );
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

  function addLedgerEntry(entry) {
    app.data.ledger.push({
      id: makeId("ledger"),
      operator: "teacher",
      ...entry
    });
  }

  function clearLastUndoBatch(options = {}) {
    if (!app.data || !app.data.meta || !app.data.meta.lastUndoBatch) {
      return;
    }
    app.data.meta.lastUndoBatch = null;
    if (options.save) {
      saveData();
    }
  }

  function resetBulkAwardDrafts() {
    app.ui.bulkPointsDraft = "";
    app.ui.bulkReasonTemplateDraft = "";
    app.ui.bulkReasonCustomDraft = "";
  }

  function clearBulkSelection(options = {}) {
    app.ui.bulkSelectedStudentIds = [];
    if (options.clearDrafts) {
      resetBulkAwardDrafts();
    }
  }

  function getBulkSelectedStudentIds() {
    const studentIds = new Set(app.data.students.map((student) => student.id));
    return app.ui.bulkSelectedStudentIds.filter((id) => studentIds.has(id));
  }

  function isStudentBulkSelected(studentId) {
    return getBulkSelectedStudentIds().includes(studentId);
  }

  function setBulkSelectedStudentIds(ids) {
    const studentIds = new Set(app.data.students.map((student) => student.id));
    const uniqueIds = [];
    ids.forEach((id) => {
      if (!studentIds.has(id) || uniqueIds.includes(id)) return;
      uniqueIds.push(id);
    });
    app.ui.bulkSelectedStudentIds = uniqueIds;
  }

  function toggleBulkSelectedStudent(studentId, checked) {
    const currentIds = getBulkSelectedStudentIds();
    if (checked) {
      setBulkSelectedStudentIds([...currentIds, studentId]);
      return;
    }
    setBulkSelectedStudentIds(currentIds.filter((id) => id !== studentId));
  }

  function selectBulkStudents(ids) {
    setBulkSelectedStudentIds([...getBulkSelectedStudentIds(), ...ids]);
  }

  function getBulkGroupNames() {
    const groups = app.data.students
      .map((student) => String(student.group || "").trim())
      .filter(Boolean);
    return [...new Set(groups)].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function formatBulkGroupLabel(group) {
    return `${group}${group.endsWith("组") ? "" : "组"}全选`;
  }

  function getLastUndoBatchSummary() {
    const batch = app.data.meta.lastUndoBatch;
    if (!batch) return "";
    const count = batch.studentIds.length;
    return `${formatTime(batch.createdAt)} · ${count} 名学生各加 ${batch.deltaPoints} 分 · ${batch.reason || "加分"}`;
  }

  Object.assign(CP.model, {
    loadData,
    saveData,
    sanitizeAlias,
    generateAlias,
    normalizeData,
    syncData,
    createPetForStudent,
    getStudentById,
    getPetByStudentId,
    getPetType,
    pickPetTypeId,
    ensurePetType,
    hasStudentFeedHistory,
    ensurePetReAdoptState,
    getPetIcon,
    getPetTypeName,
    getPetReAdoptStatus,
    isPetEligibleForReAdopt,
    getSortedStudents,
    getDisplayStudents,
    normalizeSearchText,
    getNameInitials,
    matchDisplaySearch,
    getDisplayFocusContext,
    getSupervisedFeedVisitedStudentIds,
    computeLevel,
    getXpProgress,
    addLedgerEntry,
    clearLastUndoBatch,
    resetBulkAwardDrafts,
    clearBulkSelection,
    getBulkSelectedStudentIds,
    isStudentBulkSelected,
    setBulkSelectedStudentIds,
    toggleBulkSelectedStudent,
    selectBulkStudents,
    getBulkGroupNames,
    formatBulkGroupLabel,
    getLastUndoBatchSummary
  });
})(window);
