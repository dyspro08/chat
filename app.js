/*
 * 파일 목적: Firebase 기반 디스코드 UI 채팅 앱 메인 로직
 * 책임 범위: Google 인증, Firestore 실시간 채팅/사용자/서버 구독, 1:1 DM 및 서버 참가/생성, PWA 및 메시지 관리
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  arrayUnion,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2xiGVR1OJfHoQsBqIQkzRvDA5jqnWSAA",
  authDomain: "chat-ver2-24bb0.firebaseapp.com",
  projectId: "chat-ver2-24bb0",
  storageBucket: "chat-ver2-24bb0.firebasestorage.app",
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
  // Navigation & Rail
  railHomeBtn: document.querySelector("#rail-home-btn"),
  railGeneralBtn: document.querySelector("#rail-general-btn"),
  dynamicServerList: document.querySelector("#dynamic-server-list"),
  addServerBtn: document.querySelector("#add-server-btn"),
  joinServerOpenBtn: document.querySelector("#join-server-open-btn"),

  // Sidebar
  sidebarTitle: document.querySelector("#sidebar-title"),
  dmList: document.querySelector("#dm-list"),
  myAvatar: document.querySelector("#my-avatar"),
  myName: document.querySelector("#my-name"),
  myStatus: document.querySelector("#my-status"),
  openSettingsBtn: document.querySelector("#open-settings-btn"),

  // Views
  homeView: document.querySelector("#home-view"),
  chatView: document.querySelector("#chat-view"),

  // Home View Elements
  userSearchInput: document.querySelector("#user-search-input"),
  userCountLabel: document.querySelector("#user-count-label"),
  userGrid: document.querySelector("#user-grid"),

  // Chat View Elements
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

  // Settings Modal
  settingsModal: document.querySelector("#settings-modal"),
  closeSettingsBtn: document.querySelector("#close-settings-btn"),
  profileForm: document.querySelector("#profile-form"),
  profileName: document.querySelector("#profile-name"),
  notificationButton: document.querySelector("#notification-button"),
  signInButton: document.querySelector("#sign-in-button"),
  signOutButton: document.querySelector("#sign-out-button"),

  // Create Server Modal
  createServerModal: document.querySelector("#create-server-modal"),
  closeServerBtn: document.querySelector("#close-server-btn"),
  cancelServerBtn: document.querySelector("#cancel-server-btn"),
  createServerForm: document.querySelector("#create-server-form"),
  serverNameInput: document.querySelector("#server-name-input"),

  // Join Server Modal
  joinServerModal: document.querySelector("#join-server-modal"),
  closeJoinServerBtn: document.querySelector("#close-join-server-btn"),
  cancelJoinServerBtn: document.querySelector("#cancel-join-server-btn"),
  joinServerForm: document.querySelector("#join-server-form"),
  inviteCodeInput: document.querySelector("#invite-code-input")
};

const state = {
  activeView: "home", // "home" | "chat"
  activeConversation: {
    id: GENERAL_CHAT_ID,
    title: "전체 채팅",
    context: "공개 채널",
    type: "general" // "general" | "direct" | "server"
  },
  currentUser: null,
  isComposingKorean: false,
  profiles: new Map(),
  servers: [],
  recentDms: new Map(),
  unsubscribeMessages: null,
  unsubscribeProfiles: null,
  unsubscribeServers: null
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

function createDirectChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("__");
}

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

    card.addEventListener("click", () => {
      void openDirectChat(profile);
    });

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
    if (state.activeConversation.id === createDirectChatId(state.currentUser?.uid, profile.uid)) {
      item.classList.add("is-active");
    }

    const avatar = createAvatarElement(profile, "avatar-small");
    const name = document.createElement("span");
    name.className = "dm-name";
    name.textContent = profile.displayName || "사용자";

    item.appendChild(avatar);
    item.appendChild(name);

    item.addEventListener("click", () => {
      void openDirectChat(profile);
    });

    elements.dmList.appendChild(item);
  });
}

function getActiveMessageCollection() {
  if (state.activeConversation.type === "direct") {
    return collection(db, "directChats", state.activeConversation.id, "messages");
  } else if (state.activeConversation.type === "server") {
    return collection(db, "servers", state.activeConversation.id, "messages");
  }
  return collection(db, "messages");
}

function renderActiveConversationHeader() {
  elements.chatHeaderTitle.textContent = state.activeConversation.title;
  elements.chatHeaderContext.textContent = state.activeConversation.context;
  if (state.activeConversation.type === "direct") {
    elements.chatHeaderPrefix.textContent = "@";
  } else {
    elements.chatHeaderPrefix.textContent = "#";
  }
  elements.railGeneralBtn.classList.toggle("is-active", state.activeConversation.type === "general" && state.activeView === "chat");
  updateRailActiveState();
}

function formatMessageTime(timestamp) {
  if (!timestamp?.toDate) return "전송 중";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp.toDate());
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
  const q = query(colRef, orderBy("createdAt", "asc"), limit(RECENT_MESSAGE_LIMIT));

  state.unsubscribeMessages = onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const isAtBottom = elements.messageList.scrollHeight - elements.messageList.scrollTop <= elements.messageList.clientHeight + 120;

      renderMessages(messages);

      if (isAtBottom) {
        scrollMessagesToBottom();
      } else {
        elements.newMessageButton.hidden = false;
      }
    },
    (err) => {
      console.error("메시지 수신 오류:", err);
      setStatus("메시지를 불러오는 데 실패했습니다.", "error");
    }
  );
}

function openGeneralChat() {
  state.activeConversation = {
    id: GENERAL_CHAT_ID,
    title: "전체 채팅",
    context: "공개 채널",
    type: "general"
  };
  switchView("chat");
  renderActiveConversationHeader();
  subscribeActiveMessages();
}

async function openDirectChat(profile) {
  if (!state.currentUser) {
    setStatus("1:1 대화를 이용하려면 로그인이 필요합니다.", "error");
    return;
  }
  const chatId = createDirectChatId(state.currentUser.uid, profile.uid);

  try {
    const directRef = doc(db, "directChats", chatId);
    const snap = await getDoc(directRef);
    if (!snap.exists()) {
      await setDoc(directRef, {
        participants: [state.currentUser.uid, profile.uid],
        createdAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.error(err);
  }

  state.recentDms.set(profile.uid, profile);
  state.activeConversation = {
    id: chatId,
    title: profile.displayName || "개인 대화",
    context: "1:1 대화",
    type: "direct"
  };

  switchView("chat");
  renderActiveConversationHeader();
  subscribeActiveMessages();
  renderRecentDms();
}

function openServerChat(server) {
  state.activeConversation = {
    id: server.id,
    title: server.name,
    context: `서버 채널 (초대 코드: ${server.inviteCode || '없음'})`,
    type: "server"
  };
  switchView("chat");
  renderActiveConversationHeader();
  subscribeActiveMessages();
}

async function saveUserProfile(user, displayNameOverride = null) {
  const displayName = (displayNameOverride || user.displayName || user.email?.split("@")[0] || "사용자").slice(0, PROFILE_NAME_LIMIT);
  const profileRef = doc(db, "profiles", user.uid);
  await setDoc(
    profileRef,
    {
      uid: user.uid,
      displayName,
      photoURL: user.photoURL || null,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

function subscribeProfiles() {
  state.unsubscribeProfiles?.();
  const q = query(collection(db, "profiles"), orderBy("displayName", "asc"), limit(100));
  state.unsubscribeProfiles = onSnapshot(q, (snapshot) => {
    state.profiles.clear();
    snapshot.docs.forEach((doc) => {
      state.profiles.set(doc.id, doc.data());
    });
    renderUserGrid();
  });
}

function subscribeServers() {
  state.unsubscribeServers?.();
  const q = query(collection(db, "servers"), orderBy("createdAt", "asc"), limit(20));
  state.unsubscribeServers = onSnapshot(q, (snapshot) => {
    state.servers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
    btn.textContent = server.name.slice(0, 2);

    btn.addEventListener("click", () => {
      openServerChat(server);
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
    setStatus("로그인이 필요합니다.", "error");
    elements.messageInput.placeholder = "로그인 후 메시지를 작성하세요...";
  } else {
    elements.messageInput.placeholder = "메시지를 입력하세요...";
  }

  // 자동 높이 조절
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + "px";
}

async function cleanupOldMessages(colRef) {
  try {
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    if (snapshot.docs.length > MAX_MESSAGES_CLEANUP) {
      const docsToDelete = snapshot.docs.slice(MAX_MESSAGES_CLEANUP);
      docsToDelete.forEach(async (docSnap) => {
        await deleteDoc(docSnap.ref);
      });
    }
  } catch (err) {
    console.warn("메시지 자동 정리 중 예외:", err);
  }
}

async function sendMessage(e) {
  if (e) e.preventDefault();
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

    // 250개 초과 메시지 정리
    void cleanupOldMessages(colRef);
  } catch (err) {
    console.error("메시지 전송 오류:", err);
    setStatus(`전송 실패: ${err.message}`, "error");
  }
}

function openSettingsModal() {
  elements.settingsModal.hidden = false;
}
function closeSettingsModal() {
  elements.settingsModal.hidden = true;
}
function openServerModal() {
  if (!state.currentUser) {
    setStatus("서버를 생성하려면 로그인이 필요합니다.", "error");
    return;
  }
  elements.createServerModal.hidden = false;
}
function closeServerModal() {
  elements.createServerModal.hidden = true;
}
function openJoinServerModal() {
  if (!state.currentUser) {
    setStatus("서버에 참가하려면 로그인이 필요합니다.", "error");
    return;
  }
  elements.joinServerModal.hidden = false;
}
function closeJoinServerModal() {
  elements.joinServerModal.hidden = true;
}

async function createServer(e) {
  e.preventDefault();
  if (!state.currentUser) return;

  const name = elements.serverNameInput.value.trim();
  if (!name) return;

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const serverRef = await addDoc(collection(db, "servers"), {
      name,
      inviteCode,
      members: [state.currentUser.uid],
      createdBy: state.currentUser.uid,
      createdAt: serverTimestamp()
    });
    elements.serverNameInput.value = "";
    closeServerModal();
    openServerChat({ id: serverRef.id, name, inviteCode });
    setStatus(`서버 생성 완료! (초대 코드: ${inviteCode})`, "success");
  } catch (err) {
    setStatus(`서버 생성 실패: ${err.message}`, "error");
  }
}

async function joinServerByCode(e) {
  e.preventDefault();
  if (!state.currentUser) return;

  const code = elements.inviteCodeInput.value.trim().toUpperCase();
  if (!code) return;

  try {
    const serversRef = collection(db, "servers");
    const q = query(serversRef, where("inviteCode", "==", code));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      setStatus("유효하지 않은 초대 코드입니다.", "error");
      return;
    }

    const serverDoc = snapshot.docs[0];
    const serverId = serverDoc.id;
    const serverData = serverDoc.data();

    await updateDoc(doc(db, "servers", serverId), {
      members: arrayUnion(state.currentUser.uid)
    });

    elements.inviteCodeInput.value = "";
    closeJoinServerModal();
    openServerChat({ id: serverId, name: serverData.name, inviteCode: serverData.inviteCode });
    setStatus(`'${serverData.name}' 서버에 참가했습니다!`, "success");
  } catch (err) {
    setStatus(`서버 참가 실패: ${err.message}`, "error");
  }
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
  } catch (err) {
    setStatus(`닉네임 변경 실패: ${err.message}`, "error");
  }
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

function bootApp() {
  // Navigation
  elements.railHomeBtn.addEventListener("click", () => switchView("home"));
  elements.railGeneralBtn.addEventListener("click", openGeneralChat);
  elements.addServerBtn.addEventListener("click", openServerModal);
  elements.joinServerOpenBtn.addEventListener("click", openJoinServerModal);

  // Home search filter
  elements.userSearchInput.addEventListener("input", renderUserGrid);

  // Settings Modal Events
  elements.openSettingsBtn.addEventListener("click", openSettingsModal);
  elements.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  elements.signInButton.addEventListener("click", () => signInWithPopup(auth, googleProvider));
  elements.signOutButton.addEventListener("click", () => signOut(auth));
  elements.profileForm.addEventListener("submit", (e) => void updateDisplayName(e));

  // Notification Button
  elements.notificationButton.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      alert("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      alert("알림이 활성화되었습니다!");
    }
  });

  // Server Modal Events
  elements.closeServerBtn.addEventListener("click", closeServerModal);
  elements.cancelServerBtn.addEventListener("click", closeServerModal);
  elements.createServerForm.addEventListener("submit", (e) => void createServer(e));

  // Join Server Modal Events
  elements.closeJoinServerBtn.addEventListener("click", closeJoinServerModal);
  elements.cancelJoinServerBtn.addEventListener("click", closeJoinServerModal);
  elements.joinServerForm.addEventListener("submit", (e) => void joinServerByCode(e));

  // Chat & Composition Events
  elements.messageForm.addEventListener("submit", (e) => void sendMessage(e));
  elements.messageInput.addEventListener("input", updateComposerState);
  elements.newMessageButton.addEventListener("click", scrollMessagesToBottom);

  // 한글 조합(IME) 중복 전송 방지
  elements.messageInput.addEventListener("compositionstart", () => {
    state.isComposingKorean = true;
  });
  elements.messageInput.addEventListener("compositionend", () => {
    state.isComposingKorean = false;
  });
  elements.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !state.isComposingKorean) {
      e.preventDefault();
      void sendMessage(e);
    }
  });

  // Auth Observer
  onAuthStateChanged(auth, handleAuthChange);

  // PWA 서비스 워커 등록
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then(() => console.log("서비스 워커 등록 성공"))
        .catch((err) => console.error("서비스 워커 등록 실패:", err));
    });
  }
}

document.addEventListener("DOMContentLoaded", bootApp);
