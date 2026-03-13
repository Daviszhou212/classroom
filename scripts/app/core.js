(function (window) {
  const CP = window.ClassroomPetApp || (window.ClassroomPetApp = {});

  const constants = {
    STORAGE_KEY: "class-pet-mvp",
    SEAT_LABEL: "座号/学号",
    PIN_RULE_LABEL: "4-8 位字母或数字",
    PIN_HELP_TEXT: "4-8 位字母或数字，建议使用纯数字",
    RECOVERY_CODE: "12152205",
    BACKUP_REMINDER_INTERVAL: 7 * 24 * 60 * 60 * 1000,
    AWARD_REASON_TEMPLATES: ["课堂表现", "作业完成", "帮助同学", "纪律良好", "积极发言"],
    QUICK_AWARD_PRESETS: {
      1: "课堂表现",
      2: "积极参与",
      5: "今天特别棒！"
    },
    DEFAULT_DATA: {
      schemaVersion: 4,
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
        lastBackupAt: null,
        rules: {
          xpPerLevel: 50,
          defaultHunger: 60,
          defaultMood: 60
        }
      },
      meta: {
        lastUndoBatch: null
      }
    },
    PET_TYPES: [
      { id: "dog", name: "小狗", icon: "assets/pets/dog.svg" },
      { id: "cat", name: "小猫", icon: "assets/pets/cat.svg" },
      { id: "rabbit", name: "小兔", icon: "assets/pets/rabbit.svg" },
      { id: "hamster", name: "仓鼠", icon: "assets/pets/hamster.svg" },
      { id: "turtle", name: "小乌龟", icon: "assets/pets/turtle.svg" },
      { id: "fish", name: "小鱼", icon: "assets/pets/fish.svg" },
      { id: "bird", name: "小鸟", icon: "assets/pets/bird.svg" }
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
        displayPage: 0,
        displayPageSize: 16,
        displaySearch: "",
        displaySelectedId: null,
        displayMotion: "",
        displayFreeze: false,
        displaySearchComposing: false,
        supervisedFeedSessionActive: false,
        supervisedFeedStudentId: null,
        supervisedFeedVisitedStudentIds: [],
        supervisedFeedReAdoptDraftTypeId: null
      }
    },
    displayMotionResetTimer: null
  };

  const dom = {
    mainEl: document.getElementById("main"),
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

  CP.constants = constants;
  CP.state = state;
  CP.dom = dom;
  CP.utils = {
    clone,
    makeId,
    escapeHtml,
    clamp,
    formatTime,
    showToast
  };
  CP.model = CP.model || {};
  CP.views = CP.views || {};
  CP.actions = CP.actions || {};
})(window);
