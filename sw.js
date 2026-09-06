self.addEventListener("install", (e) => {
  console.log("[Service Worker] Installed");
});
self.addEventListener("fetch", (e) => {
  // 네트워크 요청 기본 처리
});
