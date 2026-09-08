/*
 * 파일 목적: Firebase 기반 디스코드 UI 채팅 앱 메인 로직
 */
// Firebase CDN 버전을 10.8.1로 수정 (기존 존재하지 않는 12버전 에러 픽스)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  addDoc, collection, doc, getDoc, getDocs, getFirestore, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc, where, arrayUnion, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2xiGVR1OJfHoQsBqIQkzRvDA5jqnWSAA",
  authDomain: "chat-ver2-24bb0.firebaseapp.com",
  projectId: "chat-ver2-24bb0",
  storageBucket: "chat-ver2-24bb0.firebaestorage.app",
  messagingSenderId: "597207494943",
  appId: "1:597207494943:web:7714f8a6c74e64f304c02a",
  measurementId: "G-ZHM9VZWDD0"
};

const RECENT_MESSAGE_LIMIT = 80;
const MAX_MESSAGES_CLEANUP = 250;
const MAX_MESSAGE_LENGTH = 500;
const PROFILE_NAME_LIMIT = 40;
const GENERAL_CHAT_ID = "general";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const elements = {
  railHomeBtn: document.querySelector("#rail-home-btn"),
  railGeneralBtn: document.querySelector("#rail-general-btn"),
  dynamicServerList: document.querySelector("#dynamic-server-list"),
  addServerBtn: document.querySelector("#add-server-btn"),
  joinServerOpenBtn: document.querySelector("#join-server-open-btn"),
  sidebarTitle: document.querySelector("#sidebar-title"),
  dmList: document.querySelector("#dm-list"),
  myAvatar: document.querySelector("#my-avatar"),
  myName: document.querySelector("#my-name"),
  myStatus: document.querySelector("#my-status"),
  openSettingsBtn: document.querySelector("#open-settings-btn"),
  homeView: document.querySelector("#home-view"),
  chatView: document.querySelector("#chat-view"),
  userSearchInput: document.querySelector("#user-search-input"),
  userCountLabel: document.querySelector("#user-count-label"),
  userGrid: document.querySelector("#user-grid"),
  chatHeaderPrefix: document.querySelector("#chat-header-prefix"),
  chatHeaderTitle: document.querySelector("#chat-header-title"),
  chatHeaderContext: document.querySelector("#chat-header-context"),
  messageList: document.querySelector("#message-list"),
  newMessageButton: document.querySelector("#new-message-button"),
  messageForm: document.querySelector("#message-form"),
  messageInput: document.querySelector("#message-input"),
  sendButton: document.querySelector("#send-button"),
  statusLine: document.querySelector("#status-line"),
  messageCount: document.querySelector("#message-count"),
  settingsModal: document.querySelector("#settings-modal"),
  closeSettingsBtn: document.querySelector("#close-settings-btn"),
  profileForm: document.querySelector("#profile-form"),
  profileName: document.querySelector("#profile-name"),
  notificationButton: document.querySelector("#notification-button"),
  signInButton: document.querySelector("#sign-in-button"),
  signOutButton: document.querySelector("#sign-out-button"),
  createServerModal: document.querySelector("#create-server-modal"),
  closeServerBtn: document.querySelector("#close-server-btn"),
  cancelServerBtn: document.querySelector("#cancel-server-btn"),
  createServerForm: document.querySelector("#create-server-form"),
  serverNameInput: document.querySelector("#server-name-input"),
  serverIconInput: document.querySelector("#server-icon-input"),
  joinServerModal: document.querySelector("#join-server-modal"),
  closeJoinServerBtn: document.querySelector("#close-join-server-btn"),
  cancelJoinServerBtn: document.querySelector("#cancel-join-server-btn"),
  joinServerForm: document.querySelector("#join-server-form"),
  inviteCodeInput: document.querySelector("#invite-code-input"),
  
  // 서버 관리 요소
  serverContextMenu: document.querySelector("#server-context-menu"),
  ctxServerSettingsBtn: document.querySelector("#ctx-server-settings-btn"),
  serverSettingsModal: document.querySelector("#server-settings-modal"),
  closeServerSettingsBtn: document.querySelector("#close-server-settings-btn"),
  settingsServerName: document.querySelector("#settings-server-name"),
  editServerIconInput: document.querySelector("#edit-server-icon-input"),
  updateServerIconBtn: document.querySelector("#update-server-icon-btn"),
  clearServerChatBtn: document.querySelector("#clear-server-chat-btn"),
  deleteServerBtn: document.querySelector("#delete-server-btn"),
  // 배경 커스텀
  bgUploadInput: document.querySelector("#bg-upload-input"),
  uploadBgBtn: document.querySelector("#upload-bg-btn"),
  resetBgBtn: document.querySelector("#reset-bg-btn")
};

const state = {
  activeView: "home", 
  activeConversation: { id: GENERAL_CHAT_ID, title: "전체 채팅", context: "공개 채널", type: "general" },
  currentUser: null,
  isComposingKorean: false,
  profiles: new Map(),
  servers: [],
  recentDms: new Map(),
  unsubscribeMessages: null,
  unsubscribeProfiles: null,
  unsubscribeServers: null,
  contextMenuServer: null,
  // [수정됨] 알림 켜짐/꺼짐 상태를 로컬 스토리지에서 관리
  notificationsEnabled: localStorage.getItem("notificationsEnabled") === "true"
};

auth.languageCode = "ko";

function setStatus(message, tone = "info") {
  elements.statusLine.textContent = message;
  elements.statusLine.dataset.tone = tone;
}

function switchView(viewName) {
  state.activeView = viewName;
  if (viewName === "home") {
    elements.homeView.hidden = false;
    elements.chatView.hidden = true;
    elements.railHomeBtn.classList.add("is-active");
    elements.railGeneralBtn.classList.remove("is-active");
    updateRailActiveState();
  } else {
    elements.homeView.hidden = true;
    elements.chatView.hidden = false;
    elements.railHomeBtn.classList.remove("is-active");
  }
}

function updateRailActiveState() {
  const serverButtons = elements.dynamicServerList.querySelectorAll(".rail-item");
  serverButtons.forEach((btn) => {
    btn.classList.toggle("is-active", state.activeView === "chat" && btn.dataset.serverId === state.activeConversation.id);
  });
}

function createAvatarElement(profile, sizeClass = "") {
  const avatar = document.createElement("div");
  avatar.className = `avatar ${sizeClass}`.trim();
  if (profile && profile.photoURL) {
    const img = document.createElement("img");
    img.src = profile.photoURL;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    avatar.appendChild(img);
  } else {
    const fallback = ((profile && profile.displayName) || (profile && profile.email) || "U").trim().slice(0, 1).toUpperCase();
    avatar.textContent = fallback;
  }
  return avatar;
}

function createDirectChatId(uid1, uid2) { return [uid1, uid2].sort().join("__"); }

function renderUserProfileBar() {
  if (state.currentUser) {
    elements.myName.textContent = state.currentUser.displayName || "사용자";
    elements.myStatus.textContent = "온라인";
    const newAvatar = createAvatarElement(state.currentUser, "avatar-small");
    elements.myAvatar.replaceWith(newAvatar);
    elements.myAvatar = newAvatar;
    elements.profileName.value = state.currentUser.displayName || "";
    elements.signInButton.hidden = true;
    elements.signOutButton.hidden = false;
  } else {
    elements.myName.textContent = "로그인 필요";
    elements.myStatus.textContent = "오프라인";
    elements.myAvatar.textContent = "?";
    elements.signInButton.hidden = false;
    elements.signOutButton.hidden = true;
  }
}

function renderUserGrid() {
  elements.userGrid.replaceChildren();
  const searchFilter = elements.userSearchInput.value.trim().toLowerCase();
  const allProfiles = Array.from(state.profiles.values());
  const filtered = allProfiles.filter((p) => {
    if (state.currentUser && p.uid === state.currentUser.uid) return false;
    const name = (p.displayName || "").toLowerCase();
    return name.includes(searchFilter);
  });
  elements.userCountLabel.textContent = `접속 중인 사용자 (${filtered.length})`;
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-text";
    empty.textContent = searchFilter ? "검색 결과가 없습니다." : "표시할 사용자가 없습니다.";
    elements.userGrid.appendChild(empty);
    return;
  }
  filtered.forEach((profile) => {
    const card = document.createElement("div");
    card.className = "user-card";
    const avatar = createAvatarElement(profile, "avatar-medium");
    const nameSpan = document.createElement("span");
    nameSpan.className = "user-card-name";
    nameSpan.textContent = profile.displayName || "사용자";
    card.appendChild(avatar);
    card.appendChild(nameSpan);
    card.addEventListener("click", () => void openDirectChat(profile));
    elements.userGrid.appendChild(card);
  });
}

function renderRecentDms() {
  elements.dmList.replaceChildren();
  if (state.recentDms.size === 0) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "홈에서 사용자를 선택해 대화를 시작하세요.";
    elements.dmList.appendChild(empty);
    return;
  }
  state.recentDms.forEach((profile) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "dm-item";
    if (state.activeConversation.id === createDirectChatId(state.currentUser?.uid, profile.uid)) item.classList.add("is-active");
    const avatar = createAvatarElement(profile, "avatar-small");
    const name = document.createElement("span");
    name.className = "dm-name";
    name.textContent = profile.displayName || "사용자";
    item.appendChild(avatar);
    item.appendChild(name);
    item.addEventListener("click", () => void openDirectChat(profile));
    elements.dmList.appendChild(item);
  });
}

function getActiveMessageCollection() {
  if (state.activeConversation.type === "direct") return collection(db, "directChats", state.activeConversation.id, "messages");
  else if (state.activeConversation.type === "server") return collection(db, "servers", state.activeConversation.id, "messages");
  return collection(db, "messages");
}

function renderActiveConversationHeader() {
  elements.chatHeaderTitle.textContent = state.activeConversation.title;
  elements.chatHeaderContext.textContent = state.activeConversation.context;
  elements.chatHeaderPrefix.textContent = state.activeConversation.type === "direct" ? "@" : "#";
  elements.railGeneralBtn.classList.toggle("is-active", state.activeConversation.type === "general" && state.activeView === "chat");
  updateRailActiveState();
}

function formatMessageTime(timestamp) {
  if (!timestamp?.toDate) return "전송 중";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(timestamp.toDate());
}

function renderMessages(messages) {
  elements.messageList.replaceChildren();
  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<h3>대화 내용이 없습니다</h3><p>첫 메시지를 보내보세요!</p>`;
    elements.messageList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  messages.forEach((msg) => {
    const isMine = msg.uid === state.currentUser?.uid;
    const msgEl = document.createElement("article");
    msgEl.className = isMine ? "message is-mine" : "message";
    const avatar = createAvatarElement(msg, "avatar-small");
    const body = document.createElement("div");
    body.className = "message-body";
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const author = document.createElement("strong");
    author.textContent = msg.displayName || "사용자";
    const time = document.createElement("time");
    time.textContent = formatMessageTime(msg.createdAt);
    meta.appendChild(author);
    meta.appendChild(time);
    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = msg.text;
    body.appendChild(meta);
    body.appendChild(text);
    msgEl.appendChild(avatar);
    msgEl.appendChild(body);
    fragment.appendChild(msgEl);
  });
  elements.messageList.appendChild(fragment);
}

function scrollMessagesToBottom() {
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
  elements.newMessageButton.hidden = true;
}

function subscribeActiveMessages() {
  state.unsubscribeMessages?.();
  const colRef = getActiveMessageCollection();
  
  // [수정됨] "desc"로 정렬하여 가장 최신 메시지 80개를 가져옵니다.
  const q = query(colRef, orderBy("createdAt", "desc"), limit(RECENT_MESSAGE_LIMIT));

  // 최초 로드 시에는 알림이 울리지 않도록 플래그 설정
  let isInitialLoad = true; 

  state.unsubscribeMessages = onSnapshot(q, (snapshot) => {
    // [수정됨] 최신 80개를 가져온 후, 화면 아래쪽에 최신 글이 오도록 배열을 .reverse()로 뒤집어줍니다.
    const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse();
    
    const isAtBottom = elements.messageList.scrollHeight - elements.messageList.scrollTop <= elements.messageList.clientHeight + 120;
    renderMessages(messages);
    
    // 새 메시지 알림 로직
    if (!isInitialLoad && state.notificationsEnabled && Notification.permission === "granted") {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const msg = change.doc.data();
          if (state.currentUser && msg.uid !== state.currentUser.uid) {
            new Notification(`${msg.displayName || "사용자"}`, { 
              body: msg.text,
              icon: "./icon.png"
            });
          }
        }
      });
    }
    
    isInitialLoad = false;

    if (isAtBottom) scrollMessagesToBottom();
    else elements.newMessageButton.hidden = false;
  }, (err) => {
    console.error(err);
    setStatus("메시지를 불러오는 데 실패했습니다.", "error");
  });
}

function openGeneralChat() {
  state.activeConversation = { id: GENERAL_CHAT_ID, title: "전체 채팅", context: "공개 채널", type: "general" };
  switchView("chat");
  renderActiveConversationHeader();
  subscribeActiveMessages();
}

async function openDirectChat(profile) {
  if (!state.currentUser) { setStatus("1:1 대화를 이용하려면 로그인이 필요합니다.", "error"); return; }
  const chatId = createDirectChatId(state.currentUser.uid, profile.uid);
  try {
    const directRef = doc(db, "directChats", chatId);
    const snap = await getDoc(directRef);
    if (!snap.exists()) await setDoc(directRef, { participants: [state.currentUser.uid, profile.uid], createdAt: serverTimestamp() });
  } catch (err) { console.error(err); }
  state.recentDms.set(profile.uid, profile);
  state.activeConversation = { id: chatId, title: profile.displayName || "개인 대화", context: "1:1 대화", type: "direct" };
  switchView("chat");
  renderActiveConversationHeader();
  subscribeActiveMessages();
  renderRecentDms();
}

function openServerChat(server) {
  state.activeConversation = { id: server.id, title: server.name, context: `서버 채널 (코드: ${server.inviteCode || '없음'})`, type: "server" };
  switchView("chat");
  renderActiveConversationHeader();
  subscribeActiveMessages();
}

async function saveUserProfile(user, displayNameOverride = null) {
  const displayName = (displayNameOverride || user.displayName || user.email?.split("@")[0] || "사용자").slice(0, PROFILE_NAME_LIMIT);
  const profileRef = doc(db, "profiles", user.uid);
  await setDoc(profileRef, { uid: user.uid, displayName, photoURL: user.photoURL || null, updatedAt: serverTimestamp() }, { merge: true });
}

function subscribeProfiles() {
  state.unsubscribeProfiles?.();
  const q = query(collection(db, "profiles"), orderBy("displayName", "asc"), limit(100));
  state.unsubscribeProfiles = onSnapshot(q, (snapshot) => {
    state.profiles.clear();
    snapshot.docs.forEach((doc) => state.profiles.set(doc.id, doc.data()));
    renderUserGrid();
  });
}

// [수정됨] 내가 속한(참가한) 서버만 가져오도록 버그 픽스
function subscribeServers() {
  if (!state.currentUser) return;
  state.unsubscribeServers?.();
  
  // Firestore 인덱스 에러를 방지하기 위해 where 조건만 사용 (정렬은 로컬에서 수행)
  const q = query(
    collection(db, "servers"),
    where("members", "array-contains", state.currentUser.uid)
  );

  state.unsubscribeServers = onSnapshot(q, (snapshot) => {
    state.servers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    
    // 로컬에서 생성일자(createdAt) 기준으로 오름차순 정렬
    state.servers.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeA - timeB;
    });
    
    renderServerRail();
  });
}

function renderServerRail() {
  elements.dynamicServerList.replaceChildren();
  state.servers.forEach((server) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rail-item server-btn";
    btn.title = `${server.name} (코드: ${server.inviteCode || ''})`;
    btn.dataset.serverId = server.id;
    
    // 서버 프로필 이미지가 있는 경우 적용
    if (server.serverImageUrl) {
      btn.style.backgroundImage = `url(${server.serverImageUrl})`;
      btn.style.backgroundSize = "cover";
      btn.style.backgroundPosition = "center";
      btn.style.color = "transparent";
    } else {
      btn.textContent = server.name.slice(0, 2);
    }
    
    btn.addEventListener("click", () => openServerChat(server));
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      state.contextMenuServer = server;
      elements.serverContextMenu.style.left = `${e.clientX}px`;
      elements.serverContextMenu.style.top = `${e.clientY}px`;
      elements.serverContextMenu.hidden = false;
    });
    elements.dynamicServerList.appendChild(btn);
  });
}

function updateComposerState() {
  const len = elements.messageInput.value.length;
  const hasText = elements.messageInput.value.trim().length > 0;
  const isLoggedIn = !!state.currentUser;
  elements.messageInput.disabled = !isLoggedIn;
  elements.sendButton.disabled = !isLoggedIn || !hasText;
  elements.messageCount.textContent = `${len}/${MAX_MESSAGE_LENGTH}`;
  if (!isLoggedIn) {
    setStatus("로그인이 필요합니다. (⚙️ 설정에서 로그인)", "error");
    elements.messageInput.placeholder = "로그인 후 메시지를 작성하세요...";
  } else {
    setStatus("온라인", "success"); 
    elements.messageInput.placeholder = "메시지를 입력하세요...";
  }
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + "px";
}

async function cleanupOldMessages(colRef) {
  try {
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    if (snapshot.docs.length > MAX_MESSAGES_CLEANUP) {
      snapshot.docs.slice(MAX_MESSAGES_CLEANUP).forEach(async (docSnap) => await deleteDoc(docSnap.ref));
    }
  } catch (err) { console.warn("메시지 자동 정리 중 예외:", err); }
}

async function sendMessage() {
  if (!state.currentUser) return;
  const text = elements.messageInput.value.trim();
  if (!text) return;
  elements.messageInput.value = "";
  updateComposerState();
  try {
    const colRef = getActiveMessageCollection();
    await addDoc(colRef, {
      text,
      uid: state.currentUser.uid,
      displayName: state.currentUser.displayName || "사용자",
      photoURL: state.currentUser.photoURL || null,
      createdAt: serverTimestamp()
    });
    scrollMessagesToBottom();
    setStatus("전송 완료", "success");
    void cleanupOldMessages(colRef);
  } catch (err) {
    setStatus(`전송 실패: ${err.message}`, "error");
  }
}

// 이미지 리사이즈 헬퍼 (서버 아이콘용)
async function getSmallImageBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(128 / img.width, 128 / img.height);
        const x = (128 - img.width * scale) / 2;
        const y = (128 - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function openSettingsModal() { elements.settingsModal.hidden = false; }
function closeSettingsModal() { elements.settingsModal.hidden = true; }
function openServerModal() {
  if (!state.currentUser) { setStatus("서버를 생성하려면 로그인이 필요합니다.", "error"); return; }
  elements.createServerModal.hidden = false;
}
function closeServerModal() { elements.createServerModal.hidden = true; }
function openJoinServerModal() {
  if (!state.currentUser) { setStatus("서버에 참가하려면 로그인이 필요합니다.", "error"); return; }
  elements.joinServerModal.hidden = false;
}
function closeJoinServerModal() { elements.joinServerModal.hidden = true; }

async function createServer(e) {
  e.preventDefault();
  if (!state.currentUser) return;
  const name = elements.serverNameInput.value.trim();
  if (!name) return;
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  let serverImageUrl = null;
  const file = elements.serverIconInput.files[0];
  if (file) {
    serverImageUrl = await getSmallImageBase64(file);
  }
  try {
    const serverRef = await addDoc(collection(db, "servers"), {
      name,
      inviteCode,
      serverImageUrl,
      members: [state.currentUser.uid], // 나를 첫 멤버로 등록
      createdBy: state.currentUser.uid,
      createdAt: serverTimestamp()
    });
    elements.serverNameInput.value = "";
    elements.serverIconInput.value = "";
    closeServerModal();
    openServerChat({ id: serverRef.id, name, inviteCode });
    setStatus(`서버 생성 완료!`, "success");
  } catch (err) { setStatus(`서버 생성 실패: ${err.message}`, "error"); }
}

async function joinServerByCode(e) {
  e.preventDefault();
  if (!state.currentUser) return;
  const code = elements.inviteCodeInput.value.trim().toUpperCase();
  if (!code) return;
  try {
    const q = query(collection(db, "servers"), where("inviteCode", "==", code));
    const snapshot = await getDocs(q);
    if (snapshot.empty) { setStatus("유효하지 않은 초대 코드입니다.", "error"); return; }
    const serverDoc = snapshot.docs[0];
    
    // 서버의 members 배열에 나를 추가 (이미 있다면 arrayUnion 기능에 의해 중복 방지됨)
    await updateDoc(doc(db, "servers", serverDoc.id), { members: arrayUnion(state.currentUser.uid) });
    
    elements.inviteCodeInput.value = "";
    closeJoinServerModal();
    openServerChat({ id: serverDoc.id, name: serverDoc.data().name, inviteCode: serverDoc.data().inviteCode });
    setStatus(`서버에 참가했습니다!`, "success");
  } catch (err) { setStatus(`서버 참가 실패: ${err.message}`, "error"); }
}

async function updateDisplayName(e) {
  e.preventDefault();
  if (!state.currentUser) return;
  const newName = elements.profileName.value.trim();
  if (!newName) return;
  try {
    await updateProfile(state.currentUser, { displayName: newName });
    await saveUserProfile(state.currentUser, newName);
    renderUserProfileBar();
    closeSettingsModal();
    setStatus("닉네임 변경 성공", "success");
  } catch (err) { setStatus(`닉네임 변경 실패: ${err.message}`, "error"); }
}

function handleAuthChange(user) {
  state.currentUser = user;
  renderUserProfileBar();
  updateComposerState();
  if (user) {
    void saveUserProfile(user);
    subscribeProfiles();
    subscribeServers();
  } else {
    state.profiles.clear();
    state.servers = [];
    state.recentDms.clear();
    renderUserGrid();
    renderRecentDms();
    renderServerRail();
  }
}

// 배경화면 커스텀 로직 (LocalStorage 저장)
function applyBackground(dataUrl) {
  if(dataUrl) {
    document.body.style.backgroundImage = `url(${dataUrl})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.getElementById("bg-overlay").style.display = "block";
    elements.resetBgBtn.hidden = false;
  } else {
    document.body.style.backgroundImage = "none";
    document.getElementById("bg-overlay").style.display = "none";
    elements.resetBgBtn.hidden = true;
  }
}

function bootApp() {
  // 저장된 배경화면 로드
  const savedBg = localStorage.getItem("custom-bg");
  if(savedBg) applyBackground(savedBg);
  
  elements.uploadBgBtn.addEventListener("click", () => elements.bgUploadInput.click());
  elements.resetBgBtn.addEventListener("click", () => {
    localStorage.removeItem("custom-bg");
    applyBackground(null);
  });
  
  elements.bgUploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1920;
        const scale = Math.min(MAX_WIDTH / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6); // 60% 압축으로 용량 최적화
        try {
          localStorage.setItem("custom-bg", dataUrl);
          applyBackground(dataUrl);
        } catch(e) {
          alert("이미지 용량이 너무 큽니다. 다른 이미지를 선택해주세요.");
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  
  elements.railHomeBtn.addEventListener("click", () => switchView("home"));
  elements.railGeneralBtn.addEventListener("click", openGeneralChat);
  elements.addServerBtn.addEventListener("click", openServerModal);
  elements.joinServerOpenBtn.addEventListener("click", openJoinServerModal);
  elements.userSearchInput.addEventListener("input", renderUserGrid);
  
  elements.openSettingsBtn.addEventListener("click", openSettingsModal);
  elements.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  elements.signInButton.addEventListener("click", () => signInWithPopup(auth, googleProvider));
  elements.signOutButton.addEventListener("click", () => signOut(auth));
  elements.profileForm.addEventListener("submit", (e) => void updateDisplayName(e));
  
  // [수정됨] 알림 버튼 초기 UI 반영 및 끄기/켜기 토글 기능 연동
  if (state.notificationsEnabled) {
    elements.notificationButton.textContent = "알림 끄기";
    elements.notificationButton.classList.replace("secondary-button", "danger-button");
  }

  elements.notificationButton.addEventListener("click", async () => {
    if (!("Notification" in window)) { alert("브라우저가 알림을 지원하지 않습니다."); return; }
    
    if (state.notificationsEnabled) {
      // 알림 끄기
      state.notificationsEnabled = false;
      localStorage.setItem("notificationsEnabled", "false");
      elements.notificationButton.textContent = "알림 켜기";
      elements.notificationButton.classList.replace("danger-button", "secondary-button");
      alert("알림이 꺼졌습니다.");
    } else {
      // 알림 켜기
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        state.notificationsEnabled = true;
        localStorage.setItem("notificationsEnabled", "true");
        elements.notificationButton.textContent = "알림 끄기";
        elements.notificationButton.classList.replace("secondary-button", "danger-button");
        alert("알림이 켜졌습니다!");
      } else {
        alert("알림 권한이 차단되어 있습니다. 브라우저 설정에서 권한을 허용해주세요.");
      }
    }
  });
  
  elements.closeServerBtn.addEventListener("click", closeServerModal);
  elements.cancelServerBtn.addEventListener("click", closeServerModal);
  elements.createServerForm.addEventListener("submit", (e) => void createServer(e));
  elements.closeJoinServerBtn.addEventListener("click", closeJoinServerModal);
  elements.cancelJoinServerBtn.addEventListener("click", closeJoinServerModal);
  elements.joinServerForm.addEventListener("submit", (e) => void joinServerByCode(e));
  
  // 메시지 전송 로직
  elements.messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void sendMessage();
  });
  elements.messageInput.addEventListener("input", updateComposerState);
  elements.newMessageButton.addEventListener("click", scrollMessagesToBottom);
  
  elements.messageInput.addEventListener("compositionstart", () => state.isComposingKorean = true);
  elements.messageInput.addEventListener("compositionend", () => state.isComposingKorean = false);
  
  // 엔터키(Enter) 전송 & Shift+Enter 줄바꿈 분리
  elements.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); 
      if (!state.isComposingKorean) {
        void sendMessage();
      }
    }
  });
  
  document.addEventListener("click", () => {
    if (elements.serverContextMenu && !elements.serverContextMenu.hidden) {
      elements.serverContextMenu.hidden = true;
    }
  });
  
  elements.ctxServerSettingsBtn.addEventListener("click", () => {
    if (!state.contextMenuServer) return;
    elements.settingsServerName.textContent = `'${state.contextMenuServer.name}' 설정`;
    elements.serverSettingsModal.hidden = false;
  });
  
  elements.closeServerSettingsBtn.addEventListener("click", () => elements.serverSettingsModal.hidden = true);
  
  // 서버 아이콘 변경 로직
  elements.updateServerIconBtn.addEventListener("click", async () => {
    const server = state.contextMenuServer;
    if (!server || !state.currentUser) return;
    if (server.createdBy !== state.currentUser.uid) { alert("서버 생성자만 수정 가능합니다."); return; }
    
    const file = elements.editServerIconInput.files[0];
    if (!file) { alert("이미지를 선택해주세요."); return; }
    
    try {
      const b64 = await getSmallImageBase64(file);
      await updateDoc(doc(db, "servers", server.id), { serverImageUrl: b64 });
      setStatus("서버 아이콘이 변경되었습니다.", "success");
      elements.editServerIconInput.value = "";
      elements.serverSettingsModal.hidden = true;
    } catch (err) {
      setStatus(`수정 실패: ${err.message}`, "error");
    }
  });
  
  elements.clearServerChatBtn.addEventListener("click", async () => {
    const server = state.contextMenuServer;
    if (!server || !state.currentUser) return;
    if (server.createdBy !== state.currentUser.uid) { alert("서버 생성자만 삭제할 수 있습니다."); return; }
    if (confirm(`'${server.name}' 서버의 채팅을 모두 삭제하시겠습니까?`)) {
      try {
        const msgSnap = await getDocs(collection(db, "servers", server.id, "messages"));
        await Promise.all(msgSnap.docs.map(d => deleteDoc(d.ref)));
        elements.serverSettingsModal.hidden = true;
        setStatus("서버 채팅 내역이 삭제되었습니다.", "success");
      } catch (err) { setStatus(`삭제 실패: ${err.message}`, "error"); }
    }
  });
  
  elements.deleteServerBtn.addEventListener("click", async () => {
    const server = state.contextMenuServer;
    if (!server || !state.currentUser) return;
    if (server.createdBy !== state.currentUser.uid) { alert("서버 생성자만 삭제할 수 있습니다."); return; }
    if (confirm(`서버를 완전히 삭제하시겠습니까?`)) {
      try {
        const msgSnap = await getDocs(collection(db, "servers", server.id, "messages"));
        await Promise.all(msgSnap.docs.map(d => deleteDoc(d.ref)));
        await deleteDoc(doc(db, "servers", server.id));
        if (state.activeConversation.id === server.id) switchView("home");
        elements.serverSettingsModal.hidden = true;
        setStatus("서버가 삭제되었습니다.", "success");
      } catch (err) { setStatus(`삭제 실패: ${err.message}`, "error"); }
    }
  });
  
  onAuthStateChanged(auth, handleAuthChange);
  updateComposerState();
  openGeneralChat();
  
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(console.error);
    });
  }
}

document.addEventListener("DOMContentLoaded", bootApp);
