// DOM 요소 선택
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messageList = document.getElementById('message-list');

// 메시지 추가 함수
function addMessage(text) {
    // 텍스트가 비어있으면 실행하지 않음
    if (text.trim() === '') return;

    // 새로운 메시지 컨테이너 생성
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');

    // 내가 보낸 메시지라는 것을 표시하기 위한 HTML 구조
    messageDiv.innerHTML = `
        <div class="message-avatar">😎</div>
        <div class="message-content">
            <span class="message-author">나(User)</span>
            <p class="message-text">${text}</p>
        </div>
    `;

    // 채팅 목록에 추가
    messageList.appendChild(messageDiv);

    // 입력창 초기화 및 포커스 유지
    chatInput.value = '';
    chatInput.focus();

    // 스크롤을 항상 가장 아래로 이동
    messageList.scrollTop = messageList.scrollHeight;
}

// 전송 버튼 클릭 이벤트
sendBtn.addEventListener('click', () => {
    addMessage(chatInput.value);
});

// 엔터키 입력 이벤트
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addMessage(chatInput.value);
    }
});
