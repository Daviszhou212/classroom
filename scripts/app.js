(function (window) {
  if (!window.ClassroomPetApp || typeof window.ClassroomPetApp.init !== "function") {
    throw new Error("ClassroomPetApp 未正确初始化");
  }
  window.ClassroomPetApp.init();
})(window);
