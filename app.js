/*
 * 파일 목적: Firebase 초기화, Google 로그인, 공개 프로필, 전체 채팅, 1:1 대화의 화면 동작을 담당한다.
 * 책임 범위: DOM 이벤트 연결, Firestore 실시간 구독, 메시지 전송, 알림 권한 요청, 로컬 테마 저장.
 * 관련 모듈: index.html, style.css.
 */

// Firebase 앱 인스턴스를 만들기 위한 초기화 함수다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// 지원 환경에서만 웹 Analytics를 켜기 위해 지원 여부 검사와 Analytics 생성 함수를 가져온다.
import {
  getAnalytics,
  isSupported as isAnalyticsSupported
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
// Google 로그인, 로그아웃, 인증 상태 구독, 표시 이름 갱신에 필요한 Auth 함수다.
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
// Firestore 문서 생성, 조회, 실시간 구독, 서버 시각 기록에 필요한 함수다.
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// Firebase 콘솔에서 발급된 공개 웹앱 설정이다. API 키는 브라우저용 식별자이며 서버 비밀키가 아니다.
const firebaseConfig = {
  apiKey: "AIzaSyA2xiGVR1OJfHoQsBqIQkzRvDA5jqnWSAA",
  authDomain: "chat-ver2-24bb0.firebaseapp.com",
  projectId: "chat-ver2-24bb0",
  storageBucket: "chat-ver2-24bb0.firebasestorage.app",
  messagingSenderId: "597207494943",
  appId: "1:597207494943:web:7714f8a6c74e64f304c02a",
  measurementId: "G-ZHM9VZWDD0"
};

// 한 번에 구독할 최신 메시지 개수다.
const RECENT_MESSAGE_LIMIT = 80;
// 채팅 메시지 본문 최대 길이다.
const MAX_MESSAGE_LENGTH = 500;
// 사용자가 화면에서 바꿀 수 있는 닉네임 최대 길이다.
const PROFILE_NAME_LIMIT = 40;
// 브라우저 알림 미리보기에서 보여줄 본문 최대 길이다.
const NOTIFICATION_PREVIEW_LENGTH = 80;
// 로컬 스토리지에 저장하는 테마 설정 키다.
const THEME_STORAGE_KEY = "chat-ver2-theme";
// 전체 사용자 채팅을 나타내는 고정 대화 식별자다.
const GENERAL_CHAT_ID = "general";

// Firebase 앱의 루트 인스턴스다.
const app = initializeApp(firebaseConfig);
// Firestore 데이터베이스 접근 인스턴스다.
const db = getFirestore(app);
// Firebase Auth 접근 인스턴스다.
const auth = getAuth(app);
// Google 로그인 팝업 제공자다.
const googleProvider = new GoogleAuthProvider();
// Analytics가 지원될 때만 저장되는 인스턴스다.
let analytics = null;

// 화면 요소 참조를 한 곳에서 관리한다.
const elements = {
  activeContext: document.querySelector("#active-context"),
  activeTitle: document.querySelector("#active-title"),
  authSummary: document.querySelector("#auth-summary"),
  generalChatButton: document.querySelector("#general-chat-button"),
  memberCount: document.querySelector("#member-count"),
  memberList: document.querySelector("#member-list"),
  messageCount: document.querySelector("#message-count"),
  messageForm: document.querySelector("#message-form"),
  messageInput: document.querySelector("#message-input"),
  messageList: document.querySelector("#message-list"),
  newMessageButton: document.querySelector("#new-message-button"),
  notificationButton: document.querySelector("#notification-button"),
  profileForm: document.querySelector("#profile-form"),
  profileName: document.querySelector("#profile-name"),
  sendButton: document.querySelector("#send-button"),
  signInButton: document.querySelector("#sign-in-button"),
  signOutButton: document.querySelector("#sign-out-button"),
  statusLine: document.querySelector("#status-line"),
  themeButton: document.querySelector("#theme-button")
};

// 앱의 현재 사용자, 대화, 실시간 구독 해제 함수를 보관하는 상태 객체다.
const state = {
  activeConversation: {
    id: GENERAL_CHAT_ID,
    title: "전체 채팅",
    context: "공개 채널",
    type: "general"
  },
  currentUser: null,
  isComposingKorean: false,
  profiles: new Map(),
  unsubscribeMessages: null,
  unsubscribeProfiles: null
};

auth.languageCode = "ko";

void isAnalyticsSupported()
  .then((isSupported) => {
    if (isSupported) {
      analytics = getAnalytics(app);
    }
  })
  .catch(() => {
    analytics = null;
  });

function setStatus(message, tone = "info") {
  elements.statusLine.textContent = message;
  elements.statusLine.dataset.tone = tone;
}

function renderAuthState() {
  const isSignedIn = Boolean(state.currentUser);

  elements.signInButton.hidden = isSignedIn;
  elements.signOutButton.hidden = !isSignedIn;
  elements.profileForm.hidden = !isSignedIn;
  elements.messageInput.disabled = !isSignedIn;
  elements.sendButton.disabled = !isSignedIn;
  elements.messageInput.placeholder = isSignedIn ? "메시지를 입력하세요" : "로그인 후 메시지를 입력하세요";

  if (isSignedIn) {
    elements.authSummary.textContent = `${state.currentUser.displayName ?? "사용자"}님으로 로그인했습니다.`;
    elements.profileName.value = state.currentUser.displayName ?? "";
    return;
  }

  elements.authSummary.textContent = "Google 로그인 후 메시지를 주고받을 수 있습니다.";
  elements.profileName.value = "";
}

function createAvatar(profile) {
  const wrapper = document.createElement("span");
  wrapper.className = "avatar";

  if (profile.photoURL) {
    const image = document.createElement("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.src = profile.photoURL;
    wrapper.append(image);
    return wrapper;
  }

  const fallbackName = profile.displayName?.trim() || "사용자";
  wrapper.textContent = fallbackName.slice(0, 1).toUpperCase();
  return wrapper;
}

function formatMessageTime(timestamp) {
  if (!timestamp?.toDate) {
    return "전송 중";
  }

  const messageDate = timestamp.toDate();
  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(messageDate);
}

function createNotificationPreview(text) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (normalizedText.length <= NOTIFICATION_PREVIEW_LENGTH) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, NOTIFICATION_PREVIEW_LENGTH - 1)}…`;
}

function createDirectChatId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join("__");
}

function getActiveMessageCollection() {
  if (state.activeConversation.type === "direct") {
    return collection(db, "directChats", state.activeConversation.id, "messages");
  }

  return collection(db, "messages");
}

function isMessageListNearBottom() {
  const distanceFromBottom =
    elements.messageList.scrollHeight - elements.messageList.scrollTop - elements.messageList.clientHeight;
  return distanceFromBottom < 96;
}

function scrollMessagesToBottom() {
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
  elements.newMessageButton.hidden = true;
}

function renderEmptyState(title, description) {
  elements.messageList.replaceChildren();

  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";

  const emptyTitle = document.createElement("h3");
  emptyTitle.textContent = title;

  const emptyDescription = document.createElement("p");
  emptyDescription.textContent = description;

  emptyState.append(emptyTitle, emptyDescription);
  elements.messageList.append(emptyState);
}

function renderActiveConversationHeader() {
  elements.activeContext.textContent = state.activeConversation.context;
  elements.activeTitle.textContent = state.activeConversation.title;
  elements.generalChatButton.classList.toggle("is-active", state.activeConversation.type === "general");
}

function renderMessages(messages) {
  elements.messageList.replaceChildren();

  if (messages.length === 0) {
    renderEmptyState("아직 메시지가 없습니다", "첫 메시지를 보내 대화를 시작하세요.");
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const message of messages) {
    const isMine = message.uid === state.currentUser?.uid;
    const messageItem = document.createElement("article");
    messageItem.className = isMine ? "message is-mine" : "message";

    const avatar = createAvatar(message);
    const body = document.createElement("div");
    body.className = "message-body";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const author = document.createElement("strong");
    author.textContent = isMine ? `${message.displayName} (나)` : message.displayName;

    const time = document.createElement("time");
    time.textContent = formatMessageTime(message.createdAt);

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;

    meta.append(author, time);
    body.append(meta, text);
    messageItem.append(avatar, body);
    fragment.append(messageItem);
  }

  elements.messageList.append(fragment);
}

function notifyNewMessage(message) {
  const isOwnMessage = message.uid === state.currentUser?.uid;
  const canNotify = "Notification" in window && Notification.permission === "granted";

  if (isOwnMessage || !canNotify || document.visibilityState === "visible") {
    return;
  }

  const notificationTitle = `${message.displayName} · ${state.activeConversation.title}`;
  const notificationOptions = {
    body: createNotificationPreview(message.text),
    icon: message.photoURL || undefined,
    tag: `chat-ver2-${state.activeConversation.id}`
  };

  new Notification(notificationTitle, notificationOptions);
}

function subscribeActiveMessages() {
  state.unsubscribeMessages?.();
  state.unsubscribeMessages = null;

  if (!state.currentUser) {
    renderEmptyState("로그인이 필요합니다", "Google 계정으로 로그인하면 채팅이 열립니다.");
    return;
  }

  const messagesQuery = query(getActiveMessageCollection(), orderBy("createdAt", "desc"), limit(RECENT_MESSAGE_LIMIT));
  let isInitialSnapshot = true;

  state.unsubscribeMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((messageDoc) => ({
        id: messageDoc.id,
        ...messageDoc.data()
      }));
      const orderedMessages = messages.reverse();
      const wasNearBottom = isInitialSnapshot || isMessageListNearBottom();

      renderMessages(orderedMessages);

      if (wasNearBottom) {
        requestAnimationFrame(scrollMessagesToBottom);
      } else {
        elements.newMessageButton.hidden = false;
      }

      if (!isInitialSnapshot) {
        for (const change of snapshot.docChanges()) {
          if (change.type === "added") {
            notifyNewMessage(change.doc.data());
          }
        }
      }

      isInitialSnapshot = false;
      setStatus("실시간으로 연결되었습니다.", "success");
    },
    (error) => {
      setStatus(`메시지를 불러오지 못했습니다: ${error.message}`, "error");
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

  renderActiveConversationHeader();
  subscribeActiveMessages();
}

async function saveUserProfile(user, displayNameOverride = null) {
  const fallbackName = user.email?.split("@")[0] || "사용자";
  const displayName = (displayNameOverride || user.displayName || fallbackName).slice(0, PROFILE_NAME_LIMIT);
  const profileRef = doc(db, "profiles", user.uid);

  await setDoc(profileRef, {
    uid: user.uid,
    displayName,
    photoURL: user.photoURL || null,
    updatedAt: serverTimestamp()
  });
}

function subscribeProfiles() {
  state.unsubscribeProfiles?.();
  state.unsubscribeProfiles = null;

  const profilesQuery = query(collection(db, "profiles"), orderBy("displayName", "asc"), limit(50));

  state.unsubscribeProfiles = onSnapshot(
    profilesQuery,
    (snapshot) => {
      state.profiles.clear();

      for (const profileDoc of snapshot.docs) {
        state.profiles.set(profileDoc.id, profileDoc.data());
      }

      renderMemberList();
    },
    (error) => {
      setStatus(`사용자 목록을 불러오지 못했습니다: ${error.message}`, "error");
    }
  );
}

function renderMemberList() {
  elements.memberList.replaceChildren();
  elements.memberCount.textContent = `${state.profiles.size}명`;

  if (!state.currentUser) {
    const signedOutText = document.createElement("p");
    signedOutText.className = "helper-text";
    signedOutText.textContent = "로그인하면 등록 사용자가 표시됩니다.";
    elements.memberList.append(signedOutText);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const profile of state.profiles.values()) {
    const memberItem = document.createElement("article");
    memberItem.className = "member-item";

    const avatar = createAvatar(profile);
    const memberText = document.createElement("div");
    memberText.className = "member-text";

    const name = document.createElement("strong");
    name.textContent = profile.uid === state.currentUser.uid ? `${profile.displayName} (나)` : profile.displayName;

    const note = document.createElement("span");
    note.textContent = profile.uid === state.currentUser.uid ? "현재 계정" : "바로 대화 가능";

    const directButton = document.createElement("button");
    directButton.className = "quiet-button compact";
    directButton.type = "button";
    directButton.textContent = "대화";
    directButton.disabled = profile.uid === state.currentUser.uid;
    directButton.addEventListener("click", () => {
      void openDirectChat(profile);
    });

    memberText.append(name, note);
    memberItem.append(avatar, memberText, directButton);
    fragment.append(memberItem);
  }

  elements.memberList.append(fragment);
}

async function openDirectChat(profile) {
  if (!state.currentUser || profile.uid === state.currentUser.uid) {
    return;
  }

  const participantIds = [state.currentUser.uid, profile.uid].sort();
  const participantMap = Object.fromEntries(participantIds.map((uid) => [uid, true]));
  const chatId = createDirectChatId(state.currentUser.uid, profile.uid);
  const chatRef = doc(db, "directChats", chatId);

  try {
    const chatSnapshot = await getDoc(chatRef);

    if (!chatSnapshot.exists()) {
      await setDoc(chatRef, {
        id: chatId,
        participants: participantIds,
        participantMap,
        createdBy: state.currentUser.uid,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    const retrySnapshot = await getDoc(chatRef);

    if (!retrySnapshot.exists()) {
      setStatus(`개인 대화를 만들지 못했습니다: ${error.message}`, "error");
      return;
    }
  }

  state.activeConversation = {
    id: chatId,
    title: profile.displayName,
    context: "개인 대화",
    type: "direct"
  };

  renderActiveConversationHeader();
  subscribeActiveMessages();
}

function updateComposerState() {
  const messageLength = elements.messageInput.value.length;
  const hasContent = elements.messageInput.value.trim().length > 0;
  const canSend = Boolean(state.currentUser) && hasContent && messageLength <= MAX_MESSAGE_LENGTH;

  elements.messageCount.textContent = `${messageLength}/${MAX_MESSAGE_LENGTH}`;
  elements.messageCount.classList.toggle("is-over", messageLength > MAX_MESSAGE_LENGTH);
  elements.sendButton.disabled = !canSend;
}

async function sendMessage(event) {
  event.preventDefault();

  if (!state.currentUser) {
    setStatus("로그인 후 전송할 수 있습니다.", "error");
    return;
  }

  const messageText = elements.messageInput.value.trim();

  if (!messageText) {
    setStatus("공백만 있는 메시지는 보낼 수 없습니다.", "error");
    return;
  }

  if (messageText.length > MAX_MESSAGE_LENGTH) {
    setStatus(`메시지는 ${MAX_MESSAGE_LENGTH}자 이하로 입력하세요.`, "error");
    return;
  }

  elements.sendButton.disabled = true;

  try {
    await addDoc(getActiveMessageCollection(), {
      uid: state.currentUser.uid,
      displayName: state.currentUser.displayName || "사용자",
      photoURL: state.currentUser.photoURL || null,
      text: messageText,
      createdAt: serverTimestamp()
    });

    elements.messageInput.value = "";
    updateComposerState();
    setStatus("메시지를 보냈습니다.", "success");
  } catch (error) {
    setStatus(`메시지 전송에 실패했습니다: ${error.message}`, "error");
  } finally {
    updateComposerState();
    elements.messageInput.focus();
  }
}

async function signInWithGoogle() {
  try {
    setStatus("Google 로그인을 여는 중입니다.");
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    setStatus(`로그인에 실패했습니다: ${error.message}`, "error");
  }
}

async function signOutCurrentUser() {
  try {
    await signOut(auth);
  } catch (error) {
    setStatus(`로그아웃에 실패했습니다: ${error.message}`, "error");
  }
}

async function updateDisplayName(event) {
  event.preventDefault();

  if (!state.currentUser) {
    return;
  }

  const nextDisplayName = elements.profileName.value.trim();

  if (!nextDisplayName || nextDisplayName.length > PROFILE_NAME_LIMIT) {
    setStatus(`닉네임은 1~${PROFILE_NAME_LIMIT}자로 입력하세요.`, "error");
    return;
  }

  try {
    await updateProfile(state.currentUser, { displayName: nextDisplayName });
    await saveUserProfile(state.currentUser, nextDisplayName);
    elements.authSummary.textContent = `${nextDisplayName}님으로 로그인했습니다.`;
    setStatus("닉네임을 저장했습니다.", "success");
  } catch (error) {
    setStatus(`닉네임 저장에 실패했습니다: ${error.message}`, "error");
  }
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    setStatus("이 브라우저는 웹 알림을 지원하지 않습니다.", "error");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    setStatus("알림이 켜졌습니다. 다른 탭에 있을 때 새 메시지를 알려드립니다.", "success");
    elements.notificationButton.textContent = "알림 켜짐";
    return;
  }

  setStatus("알림 권한이 허용되지 않았습니다.", "error");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  elements.themeButton.textContent = theme === "dark" ? "밝은 테마" : "어두운 테마";
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

async function handleAuthChange(user) {
  state.currentUser = user;
  renderAuthState();
  updateComposerState();

  if (!user) {
    state.unsubscribeMessages?.();
    state.unsubscribeProfiles?.();
    state.unsubscribeMessages = null;
    state.unsubscribeProfiles = null;
    state.profiles.clear();
    renderMemberList();
    openGeneralChat();
    setStatus("로그인 대기 중입니다.");
    return;
  }

  try {
    await saveUserProfile(user);
    subscribeProfiles();
    openGeneralChat();
    setStatus("로그인되었습니다.", "success");
  } catch (error) {
    setStatus(`프로필 준비에 실패했습니다: ${error.message}`, "error");
  }
}

function handleMessageInputKeydown(event) {
  const shouldSend =
    event.key === "Enter" && !event.shiftKey && !state.isComposingKorean && !event.isComposing;

  if (!shouldSend) {
    return;
  }

  event.preventDefault();
  elements.messageForm.requestSubmit();
}

function bootApp() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (preferredDark ? "dark" : "light");

  applyTheme(initialTheme);

  elements.generalChatButton.addEventListener("click", openGeneralChat);
  elements.messageForm.addEventListener("submit", (event) => {
    void sendMessage(event);
  });
  elements.messageInput.addEventListener("input", updateComposerState);
  elements.messageInput.addEventListener("keydown", handleMessageInputKeydown);
  elements.messageInput.addEventListener("compositionstart", () => {
    state.isComposingKorean = true;
  });
  elements.messageInput.addEventListener("compositionend", () => {
    state.isComposingKorean = false;
  });
  elements.newMessageButton.addEventListener("click", scrollMessagesToBottom);
  elements.notificationButton.addEventListener("click", () => {
    void requestNotificationPermission();
  });
  elements.profileForm.addEventListener("submit", (event) => {
    void updateDisplayName(event);
  });
  elements.signInButton.addEventListener("click", () => {
    void signInWithGoogle();
  });
  elements.signOutButton.addEventListener("click", () => {
    void signOutCurrentUser();
  });
  elements.themeButton.addEventListener("click", toggleTheme);

  renderAuthState();
  renderMemberList();
  renderActiveConversationHeader();
  renderEmptyState("로그인이 필요합니다", "Google 계정으로 로그인하면 전체 채팅과 개인 대화를 사용할 수 있습니다.");
  onAuthStateChanged(auth, (user) => {
    void handleAuthChange(user);
  });
}

bootApp();
