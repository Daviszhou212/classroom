(function (window) {
  const CP = window.ClassroomPetApp;
  const { constants, state, utils } = CP;
  const {
    STORAGE_KEY,
    DEFAULT_DATA,
    PET_TYPES,
    AWARD_REVOCATION_WINDOW,
    FEEDBACK_STORAGE_LIMIT
  } = constants;
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

  function normalizeFoodInventory(items, catalog = DEFAULT_DATA.catalog) {
    const catalogIds = new Set((Array.isArray(catalog) ? catalog : []).map((item) => item.id));
    const quantityByCatalogId = new Map();

    if (!Array.isArray(items)) {
      return [];
    }

    items.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const catalogId = String(entry.catalogId || "").trim();
      const quantity = Math.floor(Number(entry.quantity) || 0);
      if (!catalogId || !catalogIds.has(catalogId) || quantity <= 0) return;
      quantityByCatalogId.set(catalogId, (quantityByCatalogId.get(catalogId) || 0) + quantity);
    });

    return (Array.isArray(catalog) ? catalog : [])
      .map((item) => ({
        catalogId: item.id,
        quantity: quantityByCatalogId.get(item.id) || 0
      }))
      .filter((entry) => entry.quantity > 0);
  }

  function normalizeStudent(student, catalog = DEFAULT_DATA.catalog) {
    const normalizedStudent = {
      points: 0,
      group: "",
      alias: "",
      foodInventory: [],
      ...student
    };
    normalizedStudent.points = Math.max(0, Number(normalizedStudent.points) || 0);
    normalizedStudent.alias = sanitizeAlias(normalizedStudent.alias) || generateAlias(normalizedStudent.name);
    normalizedStudent.foodInventory = normalizeFoodInventory(normalizedStudent.foodInventory, catalog);
    return normalizedStudent;
  }

  function normalizeFeedbackEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const message = String(entry.message || "").trim();
    const createdAt = Number(entry.createdAt) || 0;
    if (!message || !createdAt) {
      return null;
    }

    return {
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : makeId("feedback"),
      message,
      createdAt,
      source: "teacher"
    };
  }

  function normalizeFeedbackEntries(entries) {
    const seenIds = new Set();

    return (Array.isArray(entries) ? entries : [])
      .map((entry) => normalizeFeedbackEntry(entry))
      .filter((entry) => {
        if (!entry || seenIds.has(entry.id)) {
          return false;
        }
        seenIds.add(entry.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, FEEDBACK_STORAGE_LIMIT);
  }

  function normalizeLedgerEntry(entry) {
    const normalizedEntry = {
      ...entry
    };
    normalizedEntry.timestamp = Number(normalizedEntry.timestamp) || Date.now();
    if (typeof normalizedEntry.batchId === "string") {
      normalizedEntry.batchId = normalizedEntry.batchId.trim();
    }
    if (!normalizedEntry.batchId) {
      delete normalizedEntry.batchId;
    }
    if (typeof normalizedEntry.awardEntryId === "string") {
      normalizedEntry.awardEntryId = normalizedEntry.awardEntryId.trim();
    }
    if (!normalizedEntry.awardEntryId) {
      delete normalizedEntry.awardEntryId;
    }
    return normalizedEntry;
  }

  function makeLegacyAwardEntryId(batchId, studentId, index = 0) {
    const safeBatchId = String(batchId || "legacy-batch").trim() || "legacy-batch";
    const safeStudentId = String(studentId || index).trim() || String(index);
    return `legacy-award-entry:${safeBatchId}:${safeStudentId}`;
  }

  function normalizeAwardBatchEntry(entry, defaults = {}) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const studentId = String((entry.studentId ?? defaults.studentId) || "").trim();
    const points = Math.floor(Number(entry.points ?? entry.deltaPoints ?? defaults.points) || 0);
    const createdAt = Number(entry.createdAt ?? entry.timestamp ?? defaults.createdAt) || 0;
    const rawRevocableUntil = Number(entry.revocableUntil ?? defaults.revocableUntil) || 0;
    const id =
      (typeof entry.id === "string" && entry.id.trim()) ||
      (typeof entry.awardEntryId === "string" && entry.awardEntryId.trim()) ||
      defaults.id ||
      "";

    if (!id || !studentId || points <= 0 || !createdAt) {
      return null;
    }

    return {
      id,
      studentId,
      points,
      reason: String(entry.reason ?? defaults.reason ?? "加分").trim() || "加分",
      createdAt,
      revocableUntil: rawRevocableUntil >= createdAt ? rawRevocableUntil : createdAt + AWARD_REVOCATION_WINDOW,
      revokedAt: Number.isFinite(Number(entry.revokedAt)) ? Number(entry.revokedAt) : null,
      revokeReason: String(entry.revokeReason || defaults.revokeReason || "").trim()
    };
  }

  function normalizeAwardBatchEntries(entries, defaults = {}) {
    const seenIds = new Set();

    return (Array.isArray(entries) ? entries : [])
      .map((entry, index) => {
        const studentId = String((entry && entry.studentId) || "").trim();
        return normalizeAwardBatchEntry(entry, {
          ...defaults,
          id: defaults.idFactory ? defaults.idFactory(studentId, index) : defaults.id
        });
      })
      .filter((entry) => {
        if (!entry || seenIds.has(entry.id)) {
          return false;
        }
        seenIds.add(entry.id);
        return true;
      });
  }

  function findMatchingAwardRevokeEntry(revokeEntries, awardEntry) {
    if (!Array.isArray(revokeEntries) || !awardEntry) {
      return null;
    }

    return revokeEntries.find((entry) => {
      if (!entry) return false;
      if (entry.awardEntryId && entry.awardEntryId === awardEntry.id) {
        return true;
      }
      return (
        String(entry.studentId || "").trim() === awardEntry.studentId &&
        Math.abs(Math.floor(Number(entry.deltaPoints) || 0)) === awardEntry.points
      );
    }) || null;
  }

  function buildAwardEntriesFromLegacyBatch(batch, ledger = []) {
    const batchId = typeof batch.id === "string" ? batch.id.trim() : "";
    const awardEntries = (Array.isArray(ledger) ? ledger : [])
      .filter(
        (entry) =>
          entry &&
          entry.type === "award" &&
          String(entry.batchId || "").trim() === batchId &&
          Number(entry.deltaPoints) > 0
      )
      .slice()
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    const revokeEntries = (Array.isArray(ledger) ? ledger : []).filter(
      (entry) => entry && entry.type === "award_revoke" && String(entry.batchId || "").trim() === batchId
    );

    if (awardEntries.length) {
      return normalizeAwardBatchEntries(
        awardEntries.map((entry, index) => {
          const id =
            (typeof entry.awardEntryId === "string" && entry.awardEntryId.trim()) ||
            (typeof entry.id === "string" && entry.id.trim()) ||
            makeLegacyAwardEntryId(batchId, entry.studentId, index);
          const revokeEntry = findMatchingAwardRevokeEntry(revokeEntries, {
            id,
            studentId: String(entry.studentId || "").trim(),
            points: Math.floor(Number(entry.deltaPoints) || 0)
          });
          return {
            id,
            studentId: entry.studentId,
            points: entry.deltaPoints,
            reason: entry.reason || batch.reason,
            createdAt: entry.timestamp,
            revocableUntil: batch.revocableUntil,
            revokedAt: revokeEntry ? Number(revokeEntry.timestamp) || Number(batch.revokedAt) || null : Number(batch.revokedAt) || null,
            revokeReason: revokeEntry ? String(revokeEntry.reason || batch.revokeReason || "").trim() : String(batch.revokeReason || "").trim()
          };
        })
      );
    }

    const studentIds = Array.isArray(batch.studentIds)
      ? [...new Set(batch.studentIds.map((studentId) => String(studentId || "").trim()).filter(Boolean))]
      : [];
    const points = Math.floor(Number(batch.points) || 0);
    const createdAt = Number(batch.createdAt) || 0;
    const rawRevocableUntil = Number(batch.revocableUntil) || 0;
    const revokedAt = Number(batch.revokedAt) || null;
    const revokeReason = String(batch.revokeReason || "").trim();

    return normalizeAwardBatchEntries(
      studentIds.map((studentId, index) => ({
        id: makeLegacyAwardEntryId(batchId, studentId, index),
        studentId,
        points,
        reason: batch.reason,
        createdAt,
        revocableUntil: rawRevocableUntil,
        revokedAt,
        revokeReason
      }))
    );
  }

  function normalizeAwardBatch(batch, ledger = []) {
    if (!batch || typeof batch !== "object") {
      return null;
    }

    const id = typeof batch.id === "string" ? batch.id.trim() : "";
    const fallbackCreatedAt = Number(batch.createdAt) || 0;
    const fallbackReason = String(batch.reason || "加分").trim() || "加分";
    const entries = Array.isArray(batch.entries)
      ? normalizeAwardBatchEntries(batch.entries, {
          createdAt: fallbackCreatedAt,
          reason: fallbackReason
        })
      : buildAwardEntriesFromLegacyBatch(batch, ledger);

    if (!id || !entries.length) {
      return null;
    }

    const createdAt =
      fallbackCreatedAt ||
      entries.reduce(
        (earliest, entry) => Math.min(earliest, Number(entry.createdAt) || Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER
      );
    const uniqueReasons = [...new Set(entries.map((entry) => String(entry.reason || "").trim()).filter(Boolean))];

    if (!createdAt || !Number.isFinite(createdAt)) {
      return null;
    }

    return {
      id,
      reason: uniqueReasons.length === 1 ? uniqueReasons[0] : fallbackReason,
      createdAt,
      entries
    };
  }

  function buildAwardBatchesFromLedger(ledger) {
    const normalizedLedger = (Array.isArray(ledger) ? ledger : []).map((entry) => normalizeLedgerEntry(entry));
    const groupedEntries = new Map();

    normalizedLedger
      .filter((entry) => entry.type === "award" && Number(entry.deltaPoints) > 0)
      .forEach((entry) => {
        const batchId = String(entry.batchId || entry.id || "").trim();
        if (!batchId) return;
        if (!groupedEntries.has(batchId)) {
          groupedEntries.set(batchId, []);
        }
        groupedEntries.get(batchId).push(entry);
      });

    const batches = [];
    groupedEntries.forEach((entries, batchId) => {
      const sortedEntries = entries.slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      const createdAt = sortedEntries.reduce(
        (earliest, entry) => Math.min(earliest, Number(entry.timestamp) || Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER
      );
      const reasons = [...new Set(sortedEntries.map((entry) => String(entry.reason || "加分").trim() || "加分"))];
      const revokeEntries = normalizedLedger.filter(
        (entry) => entry.type === "award_revoke" && String(entry.batchId || "").trim() === batchId
      );
      const normalizedEntries = normalizeAwardBatchEntries(
        sortedEntries.map((entry, index) => {
          const entryId =
            (typeof entry.awardEntryId === "string" && entry.awardEntryId.trim()) ||
            (typeof entry.id === "string" && entry.id.trim()) ||
            makeLegacyAwardEntryId(batchId, entry.studentId, index);
          const revokeEntry = findMatchingAwardRevokeEntry(revokeEntries, {
            id: entryId,
            studentId: String(entry.studentId || "").trim(),
            points: Math.floor(Number(entry.deltaPoints) || 0)
          });
          return {
            id: entryId,
            studentId: entry.studentId,
            points: entry.deltaPoints,
            reason: entry.reason,
            createdAt: entry.timestamp,
            revocableUntil: Number(entry.timestamp) + AWARD_REVOCATION_WINDOW,
            revokedAt: revokeEntry ? Number(revokeEntry.timestamp) || null : null,
            revokeReason: revokeEntry ? String(revokeEntry.reason || "").trim() : ""
          };
        })
      );

      if (!normalizedEntries.length || !createdAt || !Number.isFinite(createdAt)) {
        return;
      }

      batches.push({
        id: batchId,
        reason: reasons.length === 1 ? reasons[0] : "批量加分",
        createdAt,
        entries: normalizedEntries
      });
    });

    return normalizeAwardBatches(batches, normalizedLedger);
  }

  function normalizeAwardBatches(batches, ledger = []) {
    const seenIds = new Set();

    return (Array.isArray(batches) ? batches : [])
      .map((batch) => normalizeAwardBatch(batch, ledger))
      .filter((batch) => {
        if (!batch || seenIds.has(batch.id)) {
          return false;
        }
        seenIds.add(batch.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function backfillAwardEntryIdsInLedger(ledger, awardBatches) {
    const normalizedLedger = Array.isArray(ledger) ? ledger : [];
    const awardEntries = normalizedLedger.filter((entry) => entry && entry.type === "award");
    const revokeEntries = normalizedLedger.filter((entry) => entry && entry.type === "award_revoke");
    const matchedAwardEntries = new Set();
    const matchedRevokeEntries = new Set();

    (Array.isArray(awardBatches) ? awardBatches : []).forEach((batch) => {
      (Array.isArray(batch.entries) ? batch.entries : []).forEach((awardEntry) => {
        const awardLedgerMatch = awardEntries.find((entry) => {
          if (matchedAwardEntries.has(entry)) return false;
          if (entry.awardEntryId && entry.awardEntryId === awardEntry.id) return true;
          return (
            String(entry.batchId || "").trim() === batch.id &&
            String(entry.studentId || "").trim() === awardEntry.studentId &&
            Math.floor(Number(entry.deltaPoints) || 0) === awardEntry.points
          );
        });

        if (awardLedgerMatch) {
          awardLedgerMatch.awardEntryId = awardEntry.id;
          matchedAwardEntries.add(awardLedgerMatch);
        }

        const revokeLedgerMatch = revokeEntries.find((entry) => {
          if (matchedRevokeEntries.has(entry)) return false;
          if (entry.awardEntryId && entry.awardEntryId === awardEntry.id) return true;
          return (
            String(entry.batchId || "").trim() === batch.id &&
            String(entry.studentId || "").trim() === awardEntry.studentId &&
            Math.abs(Math.floor(Number(entry.deltaPoints) || 0)) === awardEntry.points
          );
        });

        if (revokeLedgerMatch) {
          revokeLedgerMatch.awardEntryId = awardEntry.id;
          matchedRevokeEntries.add(revokeLedgerMatch);
        }
      });
    });

    return normalizedLedger;
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
    normalized.awardBatches = Array.isArray(data.awardBatches) ? data.awardBatches : [];
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
    normalized.meta.feedbackEntries = normalizeFeedbackEntries(normalized.meta.feedbackEntries);

    normalized.students = normalized.students.map((student) => normalizeStudent(student, normalized.catalog));
    normalized.ledger = normalized.ledger.map((entry) => normalizeLedgerEntry(entry));
    normalized.awardBatches =
      Array.isArray(data.awardBatches) && data.awardBatches.length > 0
        ? normalizeAwardBatches(data.awardBatches, normalized.ledger)
        : buildAwardBatchesFromLedger(normalized.ledger);
    backfillAwardEntryIdsInLedger(normalized.ledger, normalized.awardBatches);

    const feedHistoryStudentIds = new Set(
      normalized.ledger.filter((entry) => entry.type === "feed" && entry.studentId).map((entry) => entry.studentId)
    );
    normalized.pets = normalized.pets.map((pet) => {
      const normalizedPet = { ...pet };
      ensurePetType(normalizedPet);
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
    app.data.students = app.data.students.map((student) => normalizeStudent(student, app.data.catalog));
    app.data.ledger = app.data.ledger.map((entry) => normalizeLedgerEntry(entry));
    app.data.awardBatches =
      Array.isArray(app.data.awardBatches) && app.data.awardBatches.length > 0
        ? normalizeAwardBatches(app.data.awardBatches, app.data.ledger)
        : buildAwardBatchesFromLedger(app.data.ledger);
    backfillAwardEntryIdsInLedger(app.data.ledger, app.data.awardBatches);
    app.data.meta = {
      ...DEFAULT_DATA.meta,
      ...(app.data.meta || {})
    };
    app.data.meta.feedbackEntries = normalizeFeedbackEntries(app.data.meta.feedbackEntries);
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

  function getCatalogItem(catalogId) {
    return app.data.catalog.find((item) => item.id === catalogId) || null;
  }

  function getPetByStudentId(studentId) {
    return app.data.pets.find((pet) => pet.studentId === studentId);
  }

  function getPetType(typeId) {
    return PET_TYPES.find((type) => type.id === typeId) || PET_TYPES[0];
  }

  function getPetTypePreviewIcon(typeOrId, variantIndex = 0) {
    const petType =
      typeof typeOrId === "string" || !typeOrId
        ? getPetType(typeOrId)
        : getPetType(typeOrId.id);
    const variants = Array.isArray(petType.variants) ? petType.variants : [];
    if (!variants.length) return "";
    const safeIndex = Math.max(0, Math.min(variants.length - 1, Number(variantIndex) || 0));
    return variants[safeIndex];
  }

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function getPetVariantIndex(pet, seed = app.ui.petVariantSessionSeed) {
    const petType = getPetType(pet && pet.petType);
    const variants = Array.isArray(petType.variants) ? petType.variants : [];
    if (!variants.length) return 0;
    const hashInput = [seed, pet && pet.id, pet && pet.studentId, petType.id].join("|");
    return hashString(hashInput) % variants.length;
  }

  function pickPetTypeId() {
    const index = Math.floor(Math.random() * PET_TYPES.length);
    return PET_TYPES[index].id;
  }

  function ensurePetType(pet) {
    if (!pet.petType || !PET_TYPES.some((type) => type.id === pet.petType)) {
      pet.petType = pickPetTypeId();
    }
    return pet.petType;
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
    if (!pet) {
      return getPetTypePreviewIcon(PET_TYPES[0] && PET_TYPES[0].id);
    }
    const petType = getPetType(pet.petType);
    const variants = Array.isArray(petType.variants) ? petType.variants : [];
    if (!variants.length) {
      return getPetTypePreviewIcon(petType);
    }
    return variants[getPetVariantIndex(pet)];
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

  function getStudentFoodInventoryEntries(studentId) {
    const student = getStudentById(studentId);
    if (!student) return [];

    return normalizeFoodInventory(student.foodInventory, app.data.catalog)
      .map((entry) => ({
        ...entry,
        item: getCatalogItem(entry.catalogId)
      }))
      .filter((entry) => entry.item);
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

  function addAwardBatch(batch) {
    const normalizedBatch = normalizeAwardBatch(batch);
    if (!normalizedBatch) return null;
    app.data.awardBatches = normalizeAwardBatches([normalizedBatch, ...app.data.awardBatches]);
    return normalizedBatch;
  }

  function getAwardBatchById(batchId) {
    return app.data.awardBatches.find((batch) => batch.id === batchId) || null;
  }

  function getAwardBatchEntryById(batchOrBatchId, entryId) {
    const batch = typeof batchOrBatchId === "string" ? getAwardBatchById(batchOrBatchId) : batchOrBatchId;
    if (!batch || !Array.isArray(batch.entries)) {
      return null;
    }
    return batch.entries.find((entry) => entry.id === entryId) || null;
  }

  function getOpenAwardBatches() {
    return app.data.awardBatches
      .filter((batch) => {
        const summary = getAwardBatchSummary(batch);
        return summary.revokedCount < summary.totalCount;
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function getFeedbackEntries(limit) {
    const entries = normalizeFeedbackEntries(app.data?.meta?.feedbackEntries);
    if (!Number.isFinite(Number(limit))) {
      return entries;
    }
    return entries.slice(0, Math.max(0, Number(limit)));
  }

  function getAwardBatchStatus(batch, now = Date.now()) {
    if (!batch) {
      return { code: "expired", label: "已过期" };
    }
    if (batch.revokedAt) {
      return { code: "revoked", label: "已撤销" };
    }
    if (now > batch.revocableUntil) {
      return { code: "expired", label: "已过期" };
    }

    const students = batch.studentIds.map((studentId) => getStudentById(studentId));
    if (students.some((student) => !student)) {
      return { code: "missing_student", label: "对象已删除" };
    }
    if (students.some((student) => (student.points || 0) < batch.points)) {
      return { code: "insufficient_points", label: "积分不足" };
    }
    return { code: "revocable", label: "可撤销" };
  }

  function formatRemainingTime(ms) {
    const safeMs = Math.max(0, Number(ms) || 0);
    if (safeMs <= 60 * 1000) {
      return "不足 1 分钟";
    }

    const days = Math.floor(safeMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((safeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((safeMs % (60 * 60 * 1000)) / (60 * 1000));
    const parts = [];

    if (days > 0) parts.push(`${days} 天`);
    if (hours > 0 && parts.length < 2) parts.push(`${hours} 小时`);
    if (minutes > 0 && parts.length < 2) parts.push(`${minutes} 分钟`);

    return parts.join(" ") || "不足 1 分钟";
  }

  function getAwardBatchRemainingText(batch, now = Date.now()) {
    if (!batch || batch.revokedAt) {
      return "已撤销";
    }
    const remainingMs = batch.revocableUntil - now;
    if (remainingMs < 0) {
      return "已过期";
    }
    return `还剩 ${formatRemainingTime(remainingMs)}`;
  }

  function getAwardEntryStatus(entry, now = Date.now()) {
    if (!entry) {
      return { code: "expired", label: "已过期" };
    }
    if (entry.revokedAt) {
      return { code: "revoked", label: "已撤销" };
    }
    if (now > entry.revocableUntil) {
      return { code: "expired", label: "已过期" };
    }

    const student = getStudentById(entry.studentId);
    if (!student) {
      return { code: "missing_student", label: "对象已删除" };
    }
    if ((student.points || 0) < entry.points) {
      return { code: "insufficient_points", label: "积分不足" };
    }
    return { code: "revocable", label: "可撤销" };
  }

  function getAwardBatchSummary(batch, now = Date.now()) {
    const summary = {
      totalCount: 0,
      revokedCount: 0,
      revocableCount: 0,
      expiredCount: 0,
      missingCount: 0,
      insufficientCount: 0,
      code: "expired",
      label: "已过期"
    };

    if (!batch || !Array.isArray(batch.entries) || !batch.entries.length) {
      return summary;
    }

    batch.entries.forEach((entry) => {
      summary.totalCount += 1;
      const status = getAwardEntryStatus(entry, now);
      if (status.code === "revoked") summary.revokedCount += 1;
      if (status.code === "revocable") summary.revocableCount += 1;
      if (status.code === "expired") summary.expiredCount += 1;
      if (status.code === "missing_student") summary.missingCount += 1;
      if (status.code === "insufficient_points") summary.insufficientCount += 1;
    });

    if (summary.revocableCount > 0) {
      summary.code = "revocable";
      summary.label = `可撤销 ${summary.revocableCount} 条`;
      return summary;
    }
    if (summary.insufficientCount > 0) {
      summary.code = "insufficient_points";
      summary.label = `积分不足 ${summary.insufficientCount} 条`;
      return summary;
    }
    if (summary.missingCount > 0) {
      summary.code = "missing_student";
      summary.label = `对象已删除 ${summary.missingCount} 条`;
      return summary;
    }
    if (summary.expiredCount > 0) {
      summary.code = "expired";
      summary.label = `已过期 ${summary.expiredCount} 条`;
      return summary;
    }

    summary.code = "revoked";
    summary.label = "已撤销";
    return summary;
  }

  function getAwardBatchStatus(batch, now = Date.now()) {
    const summary = getAwardBatchSummary(batch, now);
    return {
      code: summary.code,
      label: summary.label
    };
  }

  function getAwardEntryRemainingText(entry, now = Date.now()) {
    if (!entry || entry.revokedAt) {
      return "已撤销";
    }
    const remainingMs = entry.revocableUntil - now;
    if (remainingMs < 0) {
      return "已过期";
    }
    return `剩余 ${formatRemainingTime(remainingMs)}`;
  }

  function getAwardBatchRemainingText(batch, now = Date.now()) {
    if (!batch || !Array.isArray(batch.entries) || !batch.entries.length) {
      return "已撤销";
    }

    const openEntries = batch.entries.filter((entry) => !entry.revokedAt);
    if (!openEntries.length) {
      return "已撤销";
    }

    const remainingMs = Math.max(
      ...openEntries.map((entry) => Number(entry.revocableUntil) - now).filter((value) => Number.isFinite(value))
    );
    if (remainingMs < 0) {
      return "已过期";
    }
    return `剩余 ${formatRemainingTime(remainingMs)}`;
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

  Object.assign(CP.model, {
    loadData,
    saveData,
    sanitizeAlias,
    generateAlias,
    normalizeData,
    normalizeAwardBatches,
    normalizeFeedbackEntries,
    syncData,
    createPetForStudent,
    getStudentById,
    getCatalogItem,
    getStudentFoodInventoryEntries,
    getPetByStudentId,
    getPetType,
    getPetTypePreviewIcon,
    getPetVariantIndex,
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
    addAwardBatch,
    getAwardBatchById,
    getAwardBatchEntryById,
    getOpenAwardBatches,
    getFeedbackEntries,
    getAwardBatchSummary,
    getAwardBatchStatus,
    getAwardEntryStatus,
    getAwardEntryRemainingText,
    getAwardBatchRemainingText,
    resetBulkAwardDrafts,
    clearBulkSelection,
    getBulkSelectedStudentIds,
    isStudentBulkSelected,
    setBulkSelectedStudentIds,
    toggleBulkSelectedStudent,
    selectBulkStudents,
    getBulkGroupNames,
    formatBulkGroupLabel,
    formatTime
  });
})(window);
