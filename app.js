// 1. 필요한 HTML 요소들을 변수로 가져옵니다.
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const chatWindow = document.getElementById('chat-window');
const imageInput = document.getElementById('image-input');
const fileInput = document.getElementById('file-input');

// (추가) 팝업 메뉴 관련 요소
const attachmentButton = document.getElementById('attachment-button');
const attachmentMenu = document.getElementById('attachment-menu');
const chatContainer = document.getElementById('chat-container');

// 2. 텍스트 메시지 폼(form) 제출 이벤트
messageForm.addEventListener('submit', function(event) {
    event.preventDefault();
    const messageText = messageInput.value.trim();

    if (messageText !== '') {
        displayMessage(messageText, 'sent');
        simulateReply();
        messageInput.value = '';
    }
    // 메시지 전송 시 팝업 메뉴 닫기
    closeAttachmentMenu();
});

// 3. 이미지 파일 선택 이벤트
imageInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            displayImage(e.target.result, 'sent');
        };
        reader.readAsDataURL(file);
        event.target.value = null;
        closeAttachmentMenu(); // 파일 선택 후 메뉴 닫기
    }
});

// 4. 일반 파일 선택 이벤트
fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        displayFile(file, 'sent');
        event.target.value = null;
        closeAttachmentMenu(); // 파일 선택 후 메뉴 닫기
    }
});

// (추가) 5. '+' 버튼 클릭 이벤트 (팝업 메뉴 토글)
attachmentButton.addEventListener('click', function(event) {
    // 이벤트 전파를 막아 window 클릭 이벤트가 바로 실행되는 것을 방지
    event.stopPropagation();
    attachmentMenu.classList.toggle('active');
});

// (추가) 6. 팝업 메뉴 닫기 함수
function closeAttachmentMenu() {
    attachmentMenu.classList.remove('active');
}

// (추가) 7. 메뉴 바깥 영역(window) 클릭 시 메뉴 닫기
window.addEventListener('click', function(event) {
    // 클릭된 요소가 팝업 메뉴나 '+' 버튼 자신이 아닐 경우
    if (!attachmentMenu.contains(event.target) && event.target !== attachmentButton) {
        closeAttachmentMenu();
    }
});


/* ------------------------------------------- */
/* 메시지 표시 함수들 (동일)           */
/* ------------------------------------------- */

function displayMessage(text, type) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type);
    messageElement.innerText = text;
    chatWindow.appendChild(messageElement);
    scrollToBottom();
}

function displayImage(imageUrl, type) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type);
    const imgElement = document.createElement('img');
    imgElement.src = imageUrl;
    messageElement.appendChild(imgElement);
    chatWindow.appendChild(messageElement);
    scrollToBottom();
}

function displayFile(fileObject, type) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type, 'file-bubble');
    const linkElement = document.createElement('a');
    linkElement.href = URL.createObjectURL(fileObject);
    linkElement.download = fileObject.name;
    linkElement.innerText = fileObject.name;
    messageElement.appendChild(linkElement);
    chatWindow.appendChild(messageElement);
    scrollToBottom();
}

function simulateReply() {
    setTimeout(() => {
        const replies = [
            '아, 그렇군요!',
            'Firebase 연결 멋지네요.',
            '이건 테스트 답장입니다.',
            'UI가 잘 작동하는지 확인해보세요.'
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        displayMessage(randomReply, 'received');
    }, 1000);
}

function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
