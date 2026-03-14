(function (window) {
  const CP = window.ClassroomPetApp || (window.ClassroomPetApp = {});

  const constants = {
    STORAGE_KEY: "class-pet-mvp",
    SEAT_LABEL: "学号",
    PIN_RULE_LABEL: "4-8 位字母或数字",
    PIN_HELP_TEXT: "4-8 位字母或数字，建议使用纯数字",
    RECOVERY_CODE: "12152205",
    BACKUP_REMINDER_INTERVAL: 7 * 24 * 60 * 60 * 1000,
    AWARD_REVOCATION_WINDOW: 7 * 24 * 60 * 60 * 1000,
    FEEDBACK_MAX_LENGTH: 500,
    FEEDBACK_STORAGE_LIMIT: 50,
    FEEDBACK_PREVIEW_LIMIT: 5,
    FEEDBACK_FILE_DEFAULT_NAME: "class-pet-feedback.jsonl",
    CLAIM_ROSTER_PAGE_SIZE: 32,
    AWARD_REASON_TEMPLATES: ["课堂表现", "作业完成", "帮助同学", "纪律良好", "积极发言"],
    QUICK_AWARD_PRESETS: {
      1: "课堂表现",
      2: "积极参与",
      5: "今天特别棒！"
    },
    DEFAULT_DATA: {
      schemaVersion: 9,
      students: [],
      pets: [],
      ledger: [],
      awardBatches: [],
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
        lastBackupAt: null,
        rules: {
          xpPerLevel: 50,
          defaultHunger: 60,
          defaultMood: 60
        }
      },
      meta: {
        feedbackEntries: []
      }
    },
    PET_TYPES: [
      {
        id: "rabbit",
        name: "兔子",
        variants: [
          "assets/pets/rabbit/top_left.png",
          "assets/pets/rabbit/top_right.png",
          "assets/pets/rabbit/bottom_left.png",
          "assets/pets/rabbit/bottom_right.png"
        ]
      },
      {
        id: "panda",
        name: "熊猫",
        variants: [
          "assets/pets/panda/top_left.png",
          "assets/pets/panda/top_right.png",
          "assets/pets/panda/bottom_left.png",
          "assets/pets/panda/bottom_right.png"
        ]
      },
      {
        id: "raccoon",
        name: "浣熊",
        variants: [
          "assets/pets/raccoon/top_left.png",
          "assets/pets/raccoon/top_right.png",
          "assets/pets/raccoon/bottom_left.png",
          "assets/pets/raccoon/bottom_right.png"
        ]
      },
      {
        id: "capybara",
        name: "水豚",
        variants: [
          "assets/pets/capybara/top_left.png",
          "assets/pets/capybara/top_right.png",
          "assets/pets/capybara/bottom_left.png",
          "assets/pets/capybara/bottom_right.png"
        ]
      },
      {
        id: "cat",
        name: "小猫",
        variants: [
          "assets/pets/cat/top_left.png",
          "assets/pets/cat/top_right.png",
          "assets/pets/cat/bottom_left.png",
          "assets/pets/cat/bottom_right.png"
        ]
      },
      {
        id: "turtle",
        name: "乌龟",
        variants: [
          "assets/pets/turtle/top_left.png",
          "assets/pets/turtle/top_right.png",
          "assets/pets/turtle/bottom_left.png",
          "assets/pets/turtle/bottom_right.png"
        ]
      },
      {
        id: "dog",
        name: "小狗",
        variants: [
          "assets/pets/dog/top_left.png",
          "assets/pets/dog/top_right.png",
          "assets/pets/dog/bottom_left.png",
          "assets/pets/dog/bottom_right.png"
        ]
      },
      {
        id: "bird",
        name: "小鸟",
        variants: [
          "assets/pets/bird/top_left.png",
          "assets/pets/bird/top_right.png",
          "assets/pets/bird/bottom_left.png",
          "assets/pets/bird/bottom_right.png"
        ]
      }
    ]
  };

  const state = {
    app: {
      data: null,
      view: "home",
      params: {},
      auth: {
        teacher: false
      },
      ui: {
        authScreen: "login",
        studentSearch: "",
        editingStudentId: null,
        studentSelectedId: null,
        bulkSelectedStudentIds: [],
        bulkPointsDraft: "",
        bulkReasonTemplateDraft: "",
        bulkReasonCustomDraft: "",
        claimRosterPage: 0,
        claimDraftPetTypeId: null,
        claimPendingStudentId: null,
        awardBatchPage: 0,
        displayPage: 0,
        displayPageSize: 16,
        displaySearch: "",
        displaySelectedId: null,
        displayMotion: "",
        displayFreeze: false,
        displaySearchComposing: false,
        displayInteraction: {
          studentId: null,
          type: "",
          reaction: "",
          message: "",
          stamp: 0
        },
        petVariantSessionSeed: Date.now(),
        supervisedFeedSessionActive: false,
        supervisedFeedStudentId: null,
        supervisedFeedVisitedStudentIds: [],
        supervisedFeedFedStudentIds: [],
        supervisedFeedReAdoptDraftTypeId: null,
        supervisedFeedReAdoptExpanded: false,
        feedbackModalOpen: false,
        feedbackDraft: ""
      }
    },
    feedbackFileSession: {
      supported: false,
      mode: "download",
      handle: null,
      fileName: "",
      lastWriteStatus: "idle",
      lastWriteName: "",
      lastError: ""
    },
    feedbackModalRefs: null,
    studentSearchRenderTimer: null,
    displaySearchRenderTimer: null,
    displayMotionResetTimer: null,
    displayInteractionResetTimer: null,
    levelUpCelebrationCleanupTimer: null,
    levelUpCelebrationLayerEl: null
  };

  const dom = {
    appEl: document.getElementById("app"),
    mainEl: document.getElementById("main"),
    modalRootEl: document.getElementById("modalRoot"),
    toastEl: document.getElementById("toast"),
    modeIndicatorEl: document.getElementById("modeIndicator"),
    headerActionsEl: document.getElementById("headerActions")
  };

  function clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  function showToast(message, type = "info") {
    dom.toastEl.textContent = message;
    dom.toastEl.className = `toast show ${type}`;
    setTimeout(() => {
      dom.toastEl.className = "toast";
    }, 2400);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function ensureLevelUpCelebrationLayer() {
    if (state.levelUpCelebrationLayerEl && state.levelUpCelebrationLayerEl.isConnected) {
      return state.levelUpCelebrationLayerEl;
    }

    const layerEl = document.createElement("div");
    layerEl.className = "level-up-celebration-layer";
    layerEl.setAttribute("aria-hidden", "true");
    (dom.appEl || document.body).appendChild(layerEl);
    state.levelUpCelebrationLayerEl = layerEl;
    return layerEl;
  }

  function clearLevelUpCelebration() {
    if (state.levelUpCelebrationCleanupTimer) {
      clearTimeout(state.levelUpCelebrationCleanupTimer);
      state.levelUpCelebrationCleanupTimer = null;
    }
    if (state.levelUpCelebrationLayerEl) {
      state.levelUpCelebrationLayerEl.replaceChildren();
    }
  }

  function getCelebrationOrigin(anchorEl, fallbackEl = dom.mainEl) {
    const getOriginFromRect = (targetEl, ratioY) => {
      if (!targetEl || typeof targetEl.getBoundingClientRect !== "function") return null;
      const rect = targetEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height * ratioY,
        size: Math.max(96, Math.min(220, Math.max(rect.width, rect.height)))
      };
    };

    return (
      getOriginFromRect(anchorEl, 0.42) ||
      getOriginFromRect(fallbackEl, 0.28) || {
        x: window.innerWidth / 2,
        y: Math.min(window.innerHeight * 0.35, 280),
        size: 150
      }
    );
  }

  // 用一次性 DOM 粒子做短暂升级庆祝，避免和主视图重渲染耦合。
  function buildLevelUpCelebrationBurst(origin) {
    const burstEl = document.createElement("div");
    const fragment = document.createDocumentFragment();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
    const compact = viewportWidth <= 768;
    const streamerCount = compact ? 8 : 12;
    const sparkCount = compact ? 4 : 6;
    const palette = ["var(--primary)", "var(--accent)", "var(--success)", "#fff3cf"];
    const radius = Math.max(56, Math.min(92, origin.size * 0.42));

    burstEl.className = "level-up-celebration-burst";
    burstEl.style.left = `${origin.x}px`;
    burstEl.style.top = `${origin.y}px`;

    for (let index = 0; index < streamerCount; index += 1) {
      const pieceEl = document.createElement("span");
      const progress = streamerCount === 1 ? 0.5 : index / (streamerCount - 1);
      const angle = ((-160 + progress * 140) + randomBetween(-8, 8)) * (Math.PI / 180);
      const midRadius = radius + randomBetween(-12, 14);
      const midX = Math.cos(angle) * midRadius;
      const midY = Math.sin(angle) * midRadius - randomBetween(8, 18);
      const endX = midX + randomBetween(-20, 20);
      const endY = midY + randomBetween(38, 72);

      pieceEl.className = "level-up-piece level-up-piece--streamer";
      pieceEl.style.setProperty("--piece-color", palette[index % palette.length]);
      pieceEl.style.setProperty("--piece-width", `${randomBetween(4, compact ? 6 : 7)}px`);
      pieceEl.style.setProperty("--piece-height", `${randomBetween(compact ? 18 : 20, compact ? 28 : 34)}px`);
      pieceEl.style.setProperty("--mid-x", `${midX}px`);
      pieceEl.style.setProperty("--mid-y", `${midY}px`);
      pieceEl.style.setProperty("--end-x", `${endX}px`);
      pieceEl.style.setProperty("--end-y", `${endY}px`);
      pieceEl.style.setProperty("--start-rotate", `${randomBetween(-48, 48)}deg`);
      pieceEl.style.setProperty("--mid-rotate", `${randomBetween(-140, 140)}deg`);
      pieceEl.style.setProperty("--end-rotate", `${randomBetween(-220, 220)}deg`);
      pieceEl.style.setProperty("--piece-duration", `${Math.round(randomBetween(720, 920))}ms`);
      pieceEl.style.setProperty("--piece-delay", `${Math.round(randomBetween(0, 80))}ms`);
      fragment.appendChild(pieceEl);
    }

    for (let index = 0; index < sparkCount; index += 1) {
      const pieceEl = document.createElement("span");
      const progress = sparkCount === 1 ? 0.5 : index / (sparkCount - 1);
      const angle = ((-172 + progress * 164) + randomBetween(-10, 10)) * (Math.PI / 180);
      const endRadius = radius * randomBetween(0.52, 0.82);
      const endX = Math.cos(angle) * endRadius;
      const endY = Math.sin(angle) * endRadius + randomBetween(4, 28);

      pieceEl.className = "level-up-piece level-up-piece--spark";
      pieceEl.style.setProperty("--piece-color", palette[(index + 1) % palette.length]);
      pieceEl.style.setProperty("--piece-size", `${randomBetween(compact ? 10 : 12, compact ? 16 : 20)}px`);
      pieceEl.style.setProperty("--end-x", `${endX}px`);
      pieceEl.style.setProperty("--end-y", `${endY}px`);
      pieceEl.style.setProperty("--piece-duration", `${Math.round(randomBetween(560, 760))}ms`);
      pieceEl.style.setProperty("--piece-delay", `${Math.round(randomBetween(30, 140))}ms`);
      fragment.appendChild(pieceEl);
    }

    burstEl.appendChild(fragment);
    return burstEl;
  }

  function playLevelUpCelebration(options = {}) {
    if (prefersReducedMotion()) {
      return false;
    }

    const layerEl = ensureLevelUpCelebrationLayer();
    const origin = getCelebrationOrigin(options.anchorEl, options.fallbackEl);
    clearLevelUpCelebration();
    layerEl.appendChild(buildLevelUpCelebrationBurst(origin));
    state.levelUpCelebrationCleanupTimer = window.setTimeout(() => {
      clearLevelUpCelebration();
    }, 1100);
    return true;
  }

  CP.constants = constants;
  CP.state = state;
  CP.dom = dom;
  CP.utils = {
    clone,
    makeId,
    escapeHtml,
    clamp,
    formatTime,
    showToast,
    playLevelUpCelebration
  };
  CP.model = CP.model || {};
  CP.views = CP.views || {};
  CP.actions = CP.actions || {};
})(window);
