// Global State
const state = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    currentJobId: null,
    currentRound: null,
    exam: {
        questions: [],
        answers: {},
        currentQuestionIndex: 0,
        timerInterval: null,
        timeLeft: 0
    },
    gd: {
        mediaRecorder: null,
        audioChunks: [],
        recognition: null,
        transcript: '',
        startTime: 0,
        timerInterval: null
    },
    interview: {
        stream: null,
        recognition: null,
        answers: [],
        currentQuestionIndex: 0,
        timerInterval: null,
        faceDataInterval: null,
        mockFaceData: {
            eyeContact: 85,
            smileFrequency: 20,
            faceVisibility: 95,
            headStability: 80,
            postureScore: 85,
            gestureScore: 15
        }
    }
};

// API Base
const API_URL = '/api';

// Socket.IO
const socket = io();

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    if (state.token && state.user) {
        if (state.user.role === 'admin') {
            showPage('admin');
            loadAdminDashboard();
            socket.emit('adminMonitor');
        } else {
            showPage('candidate');
            loadCandidateDashboard();
        }
    } else {
        showPage('landing');
    }

    setupSocketListeners();
    setupFileUploads();
}

// ==========================================
// UTIL & UI FUNCTIONS
// ==========================================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');

    // Update navbar
    const navActions = document.getElementById('navActions');
    if (state.user) {
        navActions.innerHTML = `
            <div class="user-badge">
                <div class="avatar">${state.user.name.charAt(0).toUpperCase()}</div>
                ${state.user.name}
            </div>
            <button class="nav-btn" onclick="showDashboard()">Dashboard</button>
            <button class="nav-btn danger" onclick="logout()">Logout</button>
        `;
    } else {
        navActions.innerHTML = `
            <button class="nav-btn primary" onclick="showPage('auth')">Get Started</button>
        `;
    }
}

function showDashboard() {
    if (state.user.role === 'admin') {
        showPage('admin');
        loadAdminDashboard();
    } else {
        showPage('candidate');
        loadCandidateDashboard();
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showLoading(text = 'Loading...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'globalLoading';
    overlay.innerHTML = `
        <div class="spinner"></div>
        <div class="loading-text">${text}</div>
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('globalLoading');
    if (overlay) overlay.remove();
}

function toggleAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    if (tab === 'login') {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    } else {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ==========================================
// API CLIENT
// ==========================================
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                throw new Error('Session expired. Please log in again.');
            }
            throw new Error(data.message || 'Something went wrong');
        }
        return data;
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    showLoading('Signing in...');
    try {
        const data = await apiCall('/auth/login', 'POST', { email, password });
        processAuthResult(data);
    } catch (error) {
        // Error handled in apiCall
    } finally {
        hideLoading();
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const phone = document.getElementById('regPhone').value;
    const role = document.getElementById('regRole').value;

    showLoading('Creating account...');
    try {
        const data = await apiCall('/auth/register', 'POST', { name, email, password, phone, role });
        processAuthResult(data);
    } catch (error) {
        // Error handled in apiCall
    } finally {
        hideLoading();
    }
}

function processAuthResult(data) {
    state.token = data.token;
    state.user = data;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));

    showToast(`Welcome back, ${data.name}!`, 'success');
    showDashboard();
}

function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showPage('landing');
    showToast('Logged out successfully', 'success');
}

// ==========================================
// CANDIDATE DASHBOARD
// ==========================================
async function loadCandidateDashboard() {
    try {
        // Fetch fresh profile data to get updated stats
        const profile = await apiCall('/auth/profile');
        state.user = profile;
        localStorage.setItem('user', JSON.stringify(profile));

        // Fetch jobs
        const jobs = await apiCall('/jobs');

        renderCandidateStats(profile);
        renderCandidateJobs(jobs, profile);
    } catch (error) {
        console.error(error);
    }
}

function renderCandidateStats(profile) {
    let applied = 0, passed = 0, totalScore = 0, scoreCount = 0;
    let currentRound = '-';

    if (profile.appliedJobs && profile.appliedJobs.length > 0) {
        applied = profile.appliedJobs.length;

        // Get the most recent application for current round
        const recent = profile.appliedJobs[profile.appliedJobs.length - 1];
        currentRound = formatRoundName(recent.currentRound);

        profile.appliedJobs.forEach(app => {
            if (app.status.includes('passed')) passed++;

            Object.values(app.scores).forEach(score => {
                if (score > 0) {
                    totalScore += score;
                    scoreCount++;
                }
            });
        });
    }

    const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

    document.getElementById('statApplied').textContent = applied;
    document.getElementById('statPassed').textContent = passed;
    document.getElementById('statCurrentRound').textContent = currentRound;
    document.getElementById('statAvgScore').textContent = `${avgScore}%`;
}

function renderCandidateJobs(jobs, profile) {
    const list = document.getElementById('candidateJobsList');
    list.innerHTML = '';

    if (jobs.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🏢</div>
                <h3>No Jobs Available</h3>
                <p>There are currently no job openings. Please check back later.</p>
            </div>
        `;
        return;
    }

    jobs.forEach(job => {
        const application = profile.appliedJobs?.find(j => j.jobId === job._id);
        const card = document.createElement('div');
        card.className = 'card job-card';

        const statusClass = job.status === 'open' ? 'open' : (job.status === 'in_progress' ? 'in_progress' : 'closed');
        const statusText = job.status.replace('_', ' ').toUpperCase();

        let actionHtml = '';
        let appStatusHtml = '';

        const now = new Date();
        const start = job.startDate ? new Date(job.startDate) : new Date();
        const end = job.endDate ? new Date(job.endDate) : new Date(8640000000000000);
        const isBeforeStart = now < start;
        const isAfterEnd = now > end;

        if (application) {
            // Already applied
            appStatusHtml = `
                <div class="job-round mb-3">
                    <div class="round-indicator" style="background:${application.status.includes('failed') ? 'var(--danger)' : 'var(--success)'}"></div>
                    Your Status: <strong>${formatAppStatus(application.status)}</strong>
                </div>
            `;

            // Determine what action button to show
            if (application.status.includes('failed')) {
                // Candidate failed - show not selected
                actionHtml = `<button class="btn btn-danger" disabled>Not Selected</button>`;
            } else if (application.status === 'selected') {
                actionHtml = `<button class="btn btn-success" disabled>🎉 Selected!</button>`;
            } else if (application.status === 'applied' && job.currentRound === 'accepting') {
                // Still in accepting phase
                actionHtml = `<button class="btn btn-secondary" disabled>Resume Under Review</button>`;
            } else if (application.status === 'applied' && job.currentRound === 'ats') {
                // ATS processing in progress
                actionHtml = `<button class="btn btn-secondary" disabled>ATS Screening in Progress</button>`;
            } else if (application.currentRound === job.currentRound && application.status.includes('passed')) {
                // Candidate's current round matches job's current round AND they've passed previous round
                // Show the action button for the current round
                if (job.currentRound === 'aptitude') {
                    actionHtml = `<button class="btn btn-primary" onclick="startRound('${job._id}', 'aptitude')">🧠 Take Aptitude Test</button>`;
                } else if (job.currentRound === 'technical') {
                    actionHtml = `<button class="btn btn-primary" onclick="startRound('${job._id}', 'technical')">💻 Take Technical Round</button>`;
                } else if (job.currentRound === 'gd') {
                    actionHtml = `<button class="btn btn-primary" onclick="startRound('${job._id}', 'gd')">🗣️ Join Group Discussion</button>`;
                } else if (job.currentRound === 'interview') {
                    actionHtml = `<button class="btn btn-primary" onclick="startRound('${job._id}', 'interview')">🎥 Start Video Interview</button>`;
                } else {
                    actionHtml = `<button class="btn btn-secondary" disabled>Waiting for next round</button>`;
                }
            } else if (job.currentRound === 'completed') {
                actionHtml = `<button class="btn btn-secondary" disabled>Process Completed</button>`;
            } else {
                // Candidate is waiting - either round hasn't started or already completed this round
                actionHtml = `<button class="btn btn-secondary" disabled>⏳ Waiting for next round</button>`;
            }
        } else {
            // Not applied
            if (isBeforeStart) {
                actionHtml = `<button class="btn btn-secondary" disabled>Apply opens ${start.toLocaleDateString()}</button>`;
            } else if (isAfterEnd) {
                actionHtml = `<button class="btn btn-secondary" disabled>Applications Closed</button>`;
            } else if (job.currentRound === 'accepting') {
                actionHtml = `<button class="btn btn-primary" onclick="openApplyModal('${job._id}', '${job.title}', '${job.company}')">Apply Now</button>`;
            } else {
                actionHtml = `<button class="btn btn-secondary" disabled>Applications Closed</button>`;
            }
        }

        const skillsHtml = job.requiredSkills.map(s => `<span class="skill-tag">${s}</span>`).join('');

        card.innerHTML = `
            <div class="job-status ${statusClass}">${statusText}</div>
            <h3>${job.title}</h3>
            <div class="job-company">${job.company}</div>
            
            <div class="job-meta">
                <span>📍 Remote</span>
                <span>⏱️ ${job.experience}+ Years</span>
                <span>🎓 ${job.education || 'Any Degree'}</span>
                <span>👥 ${job.totalPositions} Positions</span>
                <span>📅 ${job.startDate ? new Date(job.startDate).toLocaleDateString() : 'Active'} - ${job.endDate ? new Date(job.endDate).toLocaleDateString() : 'Ongoing'}</span>
            </div>
            
            <div class="job-skills">${skillsHtml}</div>
            
            <div class="job-round">
                <div class="round-indicator"></div>
                Current phase: <strong>${formatRoundName(job.currentRound)}</strong>
            </div>
            
            ${appStatusHtml}
            <div class="job-actions">${actionHtml}</div>
        `;
        list.appendChild(card);
    });
}

function formatRoundName(round) {
    const map = {
        'accepting': 'Accepting Applications',
        'ats': 'Resume Screening (ATS)',
        'aptitude': 'Aptitude Test',
        'technical': 'Technical Round',
        'gd': 'Group Discussion',
        'interview': 'Final Interview',
        'completed': 'Completed'
    };
    return map[round] || round;
}

function formatAppStatus(status) {
    if (status === 'applied') return 'Applied (Under Review)';
    if (status === 'selected') return '<span style="color:var(--success)">Selected! 🎉</span>';
    if (status === 'rejected') return '<span style="color:var(--danger)">Not Selected</span>';

    if (status.includes('_passed')) {
        const round = status.replace('_passed', '');
        return `<span style="color:var(--success)">Passed ${formatRoundName(round)}</span>`;
    }
    if (status.includes('_failed')) {
        const round = status.replace('_failed', '');
        return `<span style="color:var(--danger)">Failed ${formatRoundName(round)}</span>`;
    }
    return status;
}

// ==========================================
// RESUME UPLOAD
// ==========================================
let currentApplyJobId = null;

function openApplyModal(jobId, title, company) {
    currentApplyJobId = jobId;
    document.getElementById('uploadJobTitle').textContent = `Applying for: ${title}`;
    document.getElementById('uploadJobCompany').textContent = company;
    document.getElementById('resumeFile').value = '';
    document.getElementById('fileName').textContent = '';
    openModal('uploadResumeModal');
}

function setupFileUploads() {
    const input = document.getElementById('resumeFile');
    const dropZone = document.getElementById('fileUploadArea');
    const fileName = document.getElementById('fileName');

    if (!input || !dropZone) return;

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            fileName.textContent = `Selected: ${e.target.files[0].name}`;
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            fileName.textContent = `Selected: ${e.dataTransfer.files[0].name}`;
        }
    });
}

async function handleResumeUpload(e) {
    e.preventDefault();
    const fileInput = document.getElementById('resumeFile');

    if (fileInput.files.length === 0) {
        showToast('Please select a resume file', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('resume', fileInput.files[0]);

    showLoading('Analyzing resume with AI...');
    try {
        const response = await fetch(`${API_URL}/resume/upload/${currentApplyJobId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        closeModal('uploadResumeModal');
        showToast(`Resume uploaded! ATS Score: ${data.atsScore}%`, 'success');

        // Show results
        showResults(data.atsScore, data.atsScore >= 50, data.feedback, {
            'Skill Match': data.details.skillMatch + '%',
            'Experience Match': data.details.experienceMatch + '%',
            'Education Match': data.details.educationMatch + '%',
            'Keyword Score': data.details.keywordScore + '%'
        });

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ==========================================
// EXAM & INTERVIEW FLOW
// ==========================================
async function startRound(jobId, round) {
    state.currentJobId = jobId;
    state.currentRound = round;
    showLoading(`Preparing ${round} round...`);

    socket.emit('joinJob', jobId);

    try {
        if (round === 'aptitude') {
            const data = await apiCall(`/aptitude/${jobId}/questions`);
            setupExam(data, 'aptitude');
        } else if (round === 'technical') {
            const data = await apiCall(`/technical/${jobId}/questions`);
            setupExam(data, 'technical');
        } else if (round === 'gd') {
            const data = await apiCall(`/gd/${jobId}/topic`);
            setupGD(data);
        } else if (round === 'interview') {
            const data = await apiCall(`/interview/${jobId}/questions`);
            setupInterview(data);
        }
    } catch (error) {
        console.error(error);
    } finally {
        hideLoading();
    }
}

// ==========================================
// MCQ EXAM LOGIC (Aptitude & Technical)
// ==========================================
function setupExam(data, round) {
    state.exam = {
        questions: data.questions,
        answers: {},
        codeAnswers: {},
        currentQuestionIndex: 0,
        timeLeft: data.timeLimit * 60, // Convert minutes to seconds
    };

    // UI Setup
    document.getElementById(`${round}JobTitle`).textContent = `Total Questions: ${data.questions.length} | Time limit: ${data.timeLimit} mins`;
    showPage(round);
    renderQuestion(round);
    renderQuestionDots(round);
    startTimer(round);
}

function renderQuestion(round) {
    const q = state.exam.questions[state.exam.currentQuestionIndex];
    const container = document.getElementById(`${round}QuestionContainer`);
    const isCoding = q.type === 'coding';

    let contentHtml = '';

    if (isCoding) {
        // Coding question - show code editor
        const existingCode = state.exam.codeAnswers[state.exam.currentQuestionIndex] || q.starterCode || '';
        const langLabel = (q.language || 'javascript').toUpperCase();
        contentHtml = `
            <div class="coding-section">
                <div class="code-editor-header">
                    <span class="code-lang-badge">${langLabel}</span>
                    <span class="code-label">Write your code below</span>
                    ${q.expectedOutput ? `<div class="expected-output">Expected: <strong>${q.expectedOutput}</strong></div>` : ''}
                </div>
                <textarea 
                    id="codeEditor" 
                    class="code-editor" 
                    spellcheck="false" 
                    placeholder="Write your code here..."
                    oninput="saveCodeAnswer('${round}')"
                >${existingCode}</textarea>
            </div>
        `;
    } else {
        // MCQ question - show options
        let optionsHtml = '';
        const letters = ['A', 'B', 'C', 'D'];

        (q.options || []).forEach((opt, index) => {
            const isSelected = state.exam.answers[state.exam.currentQuestionIndex] === index;
            optionsHtml += `
                <div class="option-btn ${isSelected ? 'selected' : ''}" onclick="selectOption('${round}', ${index})">
                    <div class="option-letter">${letters[index]}</div>
                    <div>${opt}</div>
                </div>
            `;
        });

        contentHtml = `
            <div class="options-list">
                ${optionsHtml}
            </div>
        `;
    }

    container.innerHTML = `
        <div class="question-card">
            <div class="question-number">
                ${isCoding ? '💻 Coding' : '📝 MCQ'} — Question ${state.exam.currentQuestionIndex + 1} of ${state.exam.questions.length}
                ${q.topic ? `<span class="question-topic">${q.topic}</span>` : ''}
                ${q.difficulty ? `<span class="question-difficulty ${q.difficulty}">${q.difficulty}</span>` : ''}
            </div>
            <div class="question-text">${q.question}</div>
            ${contentHtml}
        </div>
    `;

    // Update nav buttons
    const prevBtn = document.getElementById(`${round}PrevBtn`);
    const nextBtn = document.getElementById(`${round}NextBtn`);

    prevBtn.disabled = state.exam.currentQuestionIndex === 0;

    if (state.exam.currentQuestionIndex === state.exam.questions.length - 1) {
        nextBtn.textContent = 'Submit Test';
        nextBtn.classList.remove('btn-primary');
        nextBtn.classList.add('btn-success');
    } else {
        nextBtn.textContent = 'Next →';
        nextBtn.classList.remove('btn-success');
        nextBtn.classList.add('btn-primary');
    }

    updateProgress(round);
}

function selectOption(round, index) {
    state.exam.answers[state.exam.currentQuestionIndex] = index;
    renderQuestion(round);
    renderQuestionDots(round);
}

function saveCodeAnswer(round) {
    const editor = document.getElementById('codeEditor');
    if (editor) {
        state.exam.codeAnswers[state.exam.currentQuestionIndex] = editor.value;
    }
    renderQuestionDots(round);
}

function renderQuestionDots(round) {
    const container = document.getElementById(`${round}Dots`);
    container.innerHTML = '';

    state.exam.questions.forEach((q, i) => {
        const dot = document.createElement('div');
        dot.className = 'question-dot';
        if (i === state.exam.currentQuestionIndex) dot.classList.add('active');
        // Check if answered (MCQ or coding)
        const isCoding = q.type === 'coding';
        if (isCoding) {
            if (state.exam.codeAnswers[i] && state.exam.codeAnswers[i] !== q.starterCode) dot.classList.add('answered');
            dot.classList.add('coding-dot');
        } else {
            if (state.exam.answers[i] !== undefined) dot.classList.add('answered');
        }
        dot.textContent = i + 1;
        dot.onclick = () => {
            // Save current code before navigating
            if (state.exam.questions[state.exam.currentQuestionIndex]?.type === 'coding') {
                const editor = document.getElementById('codeEditor');
                if (editor) state.exam.codeAnswers[state.exam.currentQuestionIndex] = editor.value;
            }
            state.exam.currentQuestionIndex = i;
            renderQuestion(round);
        };
        container.appendChild(dot);
    });
}

function updateProgress(round) {
    const progress = ((state.exam.currentQuestionIndex + 1) / state.exam.questions.length) * 100;
    document.getElementById(`${round}Progress`).style.width = `${progress}%`;
}

// Global functions for buttons due to onclick attributes
window.aptPrevQuestion = () => moveQuestion('aptitude', -1);
window.aptNextQuestion = () => moveQuestion('aptitude', 1);
window.techPrevQuestion = () => moveQuestion('technical', -1);
window.techNextQuestion = () => moveQuestion('technical', 1);

function moveQuestion(round, dir) {
    if (dir === 1 && state.exam.currentQuestionIndex === state.exam.questions.length - 1) {
        submitExam(round);
    } else {
        state.exam.currentQuestionIndex += dir;
        renderQuestion(round);
        renderQuestionDots(round);
    }
}

function startTimer(round) {
    clearInterval(state.exam.timerInterval);
    const timerEl = document.getElementById(`${round}Timer`);

    state.exam.timerInterval = setInterval(() => {
        state.exam.timeLeft--;

        const m = Math.floor(state.exam.timeLeft / 60);
        const s = state.exam.timeLeft % 60;
        timerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (state.exam.timeLeft < 300) timerEl.classList.add('warning'); // 5 mins
        if (state.exam.timeLeft < 60) {
            timerEl.classList.remove('warning');
            timerEl.classList.add('danger');
        }

        if (state.exam.timeLeft <= 0) {
            clearInterval(state.exam.timerInterval);
            submitExam(round);
        }
    }, 1000);
}

async function submitExam(round) {
    clearInterval(state.exam.timerInterval);

    // Save current code answer before submitting
    if (state.exam.questions[state.exam.currentQuestionIndex]?.type === 'coding') {
        const editor = document.getElementById('codeEditor');
        if (editor) state.exam.codeAnswers[state.exam.currentQuestionIndex] = editor.value;
    }

    showLoading('Evaluating answers...');

    try {
        const data = await apiCall(`/${round}/${state.currentJobId}/submit`, 'POST', {
            answers: state.exam.answers,
            codeAnswers: state.exam.codeAnswers || {},
            timeTaken: (document.getElementById(`${round}Timer`).textContent)
        });

        const breakdown = {};
        if (data.details) {
            if (data.details.mcqScore !== undefined) breakdown['MCQ Score'] = data.details.mcqScore + '%';
            if (data.details.codeScore !== undefined) breakdown['Coding Score'] = data.details.codeScore + '%';
        }
        breakdown['Correct MCQs'] = data.correct;
        breakdown['Total Questions'] = data.total;

        showResults(data.score, data.score >= 50, 
            `You scored ${data.score}% overall.`, 
            breakdown
        );
    } catch (error) {
        showToast('Error submitting test', 'error');
        hideLoading();
    }
}

// ==========================================
// GROUP DISCUSSION (GD)
// ==========================================
function setupGD(data) {
    document.getElementById('gdJobTitle').textContent = `Time limit: ${data.timeLimit} mins`;
    document.getElementById('gdTopic').textContent = data.topic;
    document.getElementById('gdTimer').textContent = `${data.timeLimit}:00`;

    // Reset UI
    document.getElementById('gdStartBtn').style.display = 'inline-flex';
    document.getElementById('gdStopBtn').style.display = 'none';
    document.getElementById('gdSubmitBtn').style.display = 'none';
    document.getElementById('voiceVisualizer').style.display = 'none';
    document.getElementById('recordingStatus').style.display = 'none';
    document.getElementById('gdTranscript').style.display = 'none';
    document.getElementById('gdTranscriptText').innerHTML = '';

    state.gd.transcript = '';
    showPage('gd');
}

window.startGDRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Setup MediaRecorder
        state.gd.mediaRecorder = new MediaRecorder(stream);
        state.gd.audioChunks = [];

        state.gd.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) state.gd.audioChunks.push(e.data);
        };

        state.gd.mediaRecorder.start();
        state.gd.startTime = Date.now();

        // Setup Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            state.gd.recognition = new SpeechRecognition();
            state.gd.recognition.continuous = true;
            state.gd.recognition.interimResults = true;

            state.gd.recognition.onresult = (event) => {
                // Reset silence timer on speech
                if (state.gd.silenceTimer) clearTimeout(state.gd.silenceTimer);
                state.gd.silenceTimer = setTimeout(() => {
                    stopGDRecording();
                    submitGD();
                }, 7000);

                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    state.gd.transcript += finalTranscript + ' ';
                }

                document.getElementById('gdTranscriptText').innerHTML = state.gd.transcript + '<i style="color:#64748b">' + interimTranscript + '</i>';
            };

            state.gd.recognition.start();
            
            // Set initial silence timer
            state.gd.silenceTimer = setTimeout(() => {
                stopGDRecording();
                submitGD();
            }, 7000);
        } else {
            document.getElementById('gdTranscriptText').innerHTML = '<i>Browser does not support live transcription. Audio is being recorded.</i>';
        }

        // UI Updates
        document.getElementById('gdStartBtn').style.display = 'none';
        document.getElementById('gdStopBtn').style.display = 'inline-flex';
        document.getElementById('voiceVisualizer').style.display = 'flex';
        document.getElementById('recordingStatus').style.display = 'flex';
        document.getElementById('gdTranscript').style.display = 'block';

    } catch (err) {
        showToast('Microphone access denied. Please allow microphone access to participate.', 'error');
    }
};

window.stopGDRecording = () => {
    if (state.gd.silenceTimer) clearTimeout(state.gd.silenceTimer);

    if (state.gd.mediaRecorder && state.gd.mediaRecorder.state !== 'inactive') {
        state.gd.mediaRecorder.stop();
        state.gd.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    if (state.gd.recognition) {
        state.gd.recognition.stop();
    }

    document.getElementById('gdStopBtn').style.display = 'none';
    document.getElementById('gdSubmitBtn').style.display = 'inline-flex';
    document.getElementById('voiceVisualizer').style.display = 'none';
    document.getElementById('recordingStatus').style.display = 'none';
};

window.submitGD = async () => {
    showLoading('Analyzing speech patterns and content...');

    const duration = Math.round((Date.now() - state.gd.startTime) / 1000);

    try {
        const data = await apiCall(`/gd/${state.currentJobId}/submit`, 'POST', {
            speechText: state.gd.transcript,
            duration: duration,
            responseTime: 2, // Mock for now
            totalSessionTime: 900
        });

        showResults(data.score, data.score >= 50, data.feedback, {
            'Confidence': data.details.confidenceScore + '%',
            'Response Speed': data.details.responseSpeed + '%',
            'Content Quality': data.details.contentQuality + '%',
            'Participation': data.details.participationLevel + '%'
        });
    } catch (error) {
        showToast('Error submitting GD round', 'error');
        hideLoading();
    }
};

// ==========================================
// VIDEO INTERVIEW
// ==========================================
function setupInterview(data) {
    state.interview.questions = data.questions;
    state.interview.answers = [];
    state.interview.currentQuestionIndex = 0;
    state.interview.currentAnswerText = '';

    document.getElementById('intTotalQuestions').textContent = data.questions.length;
    document.getElementById('intQuestionText').textContent = "Click 'Start Interview' when you are ready.";
    document.getElementById('intTimer').textContent = `${data.timeLimit}:00`;

    showPage('interview');
}

window.startInterview = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        state.interview.stream = stream;

        const videoEl = document.getElementById('candidateVideo');
        videoEl.srcObject = stream;

        // Setup Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            state.interview.recognition = new SpeechRecognition();
            state.interview.recognition.continuous = true;
            state.interview.recognition.interimResults = true;

            state.interview.recognition.onresult = (event) => {
                // Reset silence timer
                if (state.interview.silenceTimer) clearTimeout(state.interview.silenceTimer);
                state.interview.silenceTimer = setTimeout(() => {
                    stopAnswering();
                    nextInterviewQuestion();
                }, 7000);

                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    state.interview.currentAnswerText += finalTranscript + ' ';
                    // Save to state properly using correct index
                    const curIndex = state.interview.currentQuestionIndex;
                    if (state.interview.answers[curIndex]) {
                        state.interview.answers[curIndex].text = state.interview.currentAnswerText;
                    }
                }

                document.getElementById('intTranscriptText').innerHTML = state.interview.currentAnswerText + '<i style="color:#64748b">' + interimTranscript + '</i>';
            };
        }

        // Update UI
        document.getElementById('intStartBtn').style.display = 'none';
        document.getElementById('faceMetrics').style.display = 'grid';

        // Start Mock Face Recognition Interval
        startMockFaceAnalysis();

        // Load first question
        askInterviewQuestion();

    } catch (err) {
        showToast('Camera/Microphone access denied. Required for interview.', 'error');
    }
};

function askInterviewQuestion() {
    const qIndex = state.interview.currentQuestionIndex;
    if (qIndex >= state.interview.questions.length) {
        finishInterview();
        return;
    }

    const question = state.interview.questions[qIndex];

    // AI asks the question using Web Speech Synthesis
    const utterance = new SpeechSynthesisUtterance(question);
    utterance.pitch = 1;
    utterance.rate = 0.9;

    document.getElementById('aiSpeaking').innerHTML = '<span style="color:var(--success)">Speaking...</span>';
    document.getElementById('intQuestionNum').textContent = qIndex + 1;
    document.getElementById('intQuestionText').textContent = question;

    document.getElementById('intAnswerBtn').style.display = 'none';
    document.getElementById('intNextBtn').style.display = 'none';

    utterance.onstart = () => {
        const aiAvatar = document.getElementById('aiAvatarImg');
        if (aiAvatar) aiAvatar.classList.add('speaking');
    };

    utterance.onend = () => {
        const aiAvatar = document.getElementById('aiAvatarImg');
        if (aiAvatar) aiAvatar.classList.remove('speaking');

        document.getElementById('aiSpeaking').textContent = 'Listening...';
        
        // Initialize answer slot exactly at current index
        state.interview.answers[qIndex] = {
            question: question,
            text: ''
        };
        
        // Auto-start recording
        startAnswering();
    };

    window.speechSynthesis.speak(utterance);
}

window.startAnswering = () => {
    document.getElementById('intAnswerBtn').style.display = 'none';
    document.getElementById('intStopBtn').style.display = 'inline-flex';
    document.getElementById('intTranscript').style.display = 'block';
    document.getElementById('intTranscriptText').innerHTML = '';
    state.interview.currentAnswerText = '';

    if (state.interview.recognition) {
        try { state.interview.recognition.start(); } catch (e) { }
        
        // Set initial silence timer limit (7s) in case they don't say anything
        if (state.interview.silenceTimer) clearTimeout(state.interview.silenceTimer);
        state.interview.silenceTimer = setTimeout(() => {
            stopAnswering();
            nextInterviewQuestion();
        }, 7000);
    }
};

window.stopAnswering = () => {
    if (state.interview.silenceTimer) clearTimeout(state.interview.silenceTimer);
    
    document.getElementById('intStopBtn').style.display = 'none';
    document.getElementById('intNextBtn').style.display = 'inline-flex';

    if (state.interview.recognition) {
        state.interview.recognition.stop();
    }

    document.getElementById('aiSpeaking').textContent = 'Processing answer...';
};

window.nextInterviewQuestion = () => {
    document.getElementById('intTranscript').style.display = 'none';
    state.interview.currentQuestionIndex++;
    askInterviewQuestion();
};

function startMockFaceAnalysis() {
    // Simulate real-time face metrics updating
    state.interview.faceDataInterval = setInterval(() => {
        state.interview.mockFaceData.eyeContact = Math.min(100, Math.max(60, state.interview.mockFaceData.eyeContact + (Math.random() * 10 - 5)));
        state.interview.mockFaceData.smileFrequency = Math.min(100, Math.max(10, state.interview.mockFaceData.smileFrequency + (Math.random() * 6 - 3)));
        state.interview.mockFaceData.postureScore = Math.min(100, Math.max(70, state.interview.mockFaceData.postureScore + (Math.random() * 4 - 2)));

        document.getElementById('metricEyeContact').textContent = Math.round(state.interview.mockFaceData.eyeContact) + '%';
        document.getElementById('metricConfidence').textContent = Math.round((state.interview.mockFaceData.eyeContact * 0.6 + state.interview.mockFaceData.postureScore * 0.4)) + '%';
        document.getElementById('metricPosture').textContent = Math.round(state.interview.mockFaceData.postureScore) + '%';

        // Mock speech volume metric based on random
        const isSpeaking = document.getElementById('intStopBtn').style.display === 'inline-flex';
        document.getElementById('metricSpeech').textContent = isSpeaking ? (Math.round(Math.random() * 40 + 40) + 'dB') : '0dB';

    }, 1000);
}

async function finishInterview() {
    clearInterval(state.interview.faceDataInterval);
    if (state.interview.stream) {
        state.interview.stream.getTracks().forEach(track => track.stop());
    }

    document.getElementById('intQuestionText').textContent = "Interview complete. Analyzing results...";
    document.getElementById('aiSpeaking').textContent = "Interview Finished.";

    showLoading('AI is analyzing video, face metrics, and answers...');

    try {
        const data = await apiCall(`/interview/${state.currentJobId}/submit`, 'POST', {
            answers: state.interview.answers,
            faceData: state.interview.mockFaceData,
            duration: 900
        });

        showResults(data.score, data.score >= 50, data.feedback, {
            'Facial Confidence': data.details.facialConfidence + '%',
            'Body Language': data.details.bodyLanguage + '%',
            'Answer Quality': data.details.answerQuality + '%',
            'Communication': data.details.communicationSkill + '%'
        });
    } catch (error) {
        showToast('Error submitting interview', 'error');
        hideLoading();
    }
}

// ==========================================
// RESULTS SCREEN
// ==========================================
function showResults(score, passed, feedback, breakdownMap = {}) {
    hideLoading();
    showPage('results');

    const circle = document.getElementById('resultScoreCircle');
    circle.style.setProperty('--score-percent', `${score}%`);

    // Animate score
    let currentScore = 0;
    const scoreEl = document.getElementById('resultScore');
    const interval = setInterval(() => {
        if (currentScore >= score) {
            clearInterval(interval);
            scoreEl.textContent = score;
        } else {
            currentScore++;
            scoreEl.textContent = currentScore;
        }
    }, 20);

    const statusEl = document.getElementById('resultStatus');
    statusEl.textContent = passed ? '✅ Passed' : '❌ Failed';
    statusEl.className = 'result-status ' + (passed ? 'passed' : 'failed');

    document.getElementById('resultFeedback').textContent = feedback;

    const bdContainer = document.getElementById('resultBreakdown');
    bdContainer.innerHTML = '';

    Object.entries(breakdownMap).forEach(([label, valueStr]) => {
        const val = parseInt(valueStr);
        bdContainer.innerHTML += `
            <div class="breakdown-item">
                <div class="breakdown-label">${label}</div>
                <div class="breakdown-value">${valueStr}</div>
                <div class="breakdown-bar">
                    <div class="fill" style="width:0; transition-delay: 0.5s"></div>
                </div>
            </div>
        `;

        // Trigger animation after render
        setTimeout(() => {
            const divs = bdContainer.querySelectorAll('.fill');
            if (divs.length > 0) divs[divs.length - 1].style.width = valueStr;
        }, 100);
    });
}

window.goToDashboard = () => {
    state.currentJobId = null;
    state.currentRound = null;
    showDashboard();
};

// ==========================================
// ADMIN DASHBOARD
// ==========================================
async function loadAdminDashboard() {
    try {
        const jobs = await apiCall('/jobs');
        renderAdminStats(jobs);
        renderAdminJobs(jobs);
    } catch (error) {
        console.error(error);
    }
}

function renderAdminStats(jobs) {
    let totalApps = 0;
    let activeRounds = 0;
    let selected = 0;

    jobs.forEach(j => {
        totalApps += j.applicants.length;
        if (['ats', 'aptitude', 'technical', 'gd', 'interview'].includes(j.currentRound)) {
            activeRounds++;
        }
        // Count selected
        if (j.status === 'closed') selected += j.totalPositions; // Approximation for demo
    });

    document.getElementById('statTotalJobs').textContent = jobs.length;
    document.getElementById('statTotalApplicants').textContent = totalApps;
    document.getElementById('statActiveRounds').textContent = activeRounds;
    document.getElementById('statSelected').textContent = selected;
}

function renderAdminJobs(jobs) {
    const list = document.getElementById('adminJobsList');
    list.innerHTML = '';

    if (jobs.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🏢</div>
                <h3>No Jobs Created</h3>
                <p>Create a job posting to start the automated hiring process.</p>
            </div>
        `;
        return;
    }

    jobs.forEach(job => {
        const card = document.createElement('div');
        card.className = 'card job-card';

        const statusClass = job.status === 'open' ? 'open' : (job.status === 'in_progress' ? 'in_progress' : 'closed');
        const statusText = job.status.replace('_', ' ').toUpperCase();

        // Define rounds
        const rounds = ['accepting', 'ats', 'aptitude', 'technical', 'gd', 'interview', 'completed'];
        const currentIdx = rounds.indexOf(job.currentRound);

        // Pipeline HTML
        let pipelineHtml = '<div class="pipeline">';
        ['ATS', 'Apt', 'Tech', 'GD', 'Int'].forEach((r, i) => {
            let pclass = '';
            if (currentIdx > i + 1) pclass = 'completed';
            else if (currentIdx === i + 1) pclass = 'active';
            pipelineHtml += `<div class="pipeline-step ${pclass}">${r}</div>`;
        });
        pipelineHtml += '</div>';

        // Action Buttons based on state
        let actionsHtml = '';
        if (job.status !== 'closed') {
            if (currentIdx < rounds.length - 1) {
                const nextRound = rounds[currentIdx + 1];
                actionsHtml += `<button class="btn btn-primary btn-sm" onclick="advanceRound('${job._id}')">⚡ Evaluate & Advance to ${formatRoundName(nextRound)} →</button>`;
            }
        }

        card.innerHTML = `
            <div class="job-status ${statusClass}">${statusText}</div>
            <h3>${job.title}</h3>
            
            <div class="job-meta">
                <span>👥 Apps: <strong>${job.applicants.length}</strong></span>
                <span>🎯 Target: <strong>${job.totalPositions}</strong></span>
            </div>
            
            ${pipelineHtml}
            
            <div style="margin-bottom: 16px; font-size: 12px; color: var(--text-muted)">
                Current Phase: <strong style="color:var(--text-primary)">${formatRoundName(job.currentRound)}</strong>
            </div>
            
            <div class="job-actions" style="flex-wrap: wrap">
                ${actionsHtml}
                <button class="btn btn-secondary btn-sm" onclick="editJob('${job._id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteJob('${job._id}')" style="background:var(--danger)">🗑️ Delete</button>
                <button class="btn btn-secondary btn-sm" onclick="viewJobDetails('${job._id}')">📊 View Report</button>
            </div>
        `;
        list.appendChild(card);
    });
}

// ==========================================
// ADMIN ACTIONS
// ==========================================
window.deleteJob = async (jobId) => {
    if (!confirm('Are you absolutely sure you want to completely delete this job and all its applicants/data?')) return;
    showLoading('Deleting Job...');
    try {
        await apiCall('/jobs/' + jobId, 'DELETE');
        showToast('Job deleted perfectly', 'success');
        loadAdminDashboard();
    } catch (e) {
        showToast('Error deleting job', 'error');
    } finally {
        hideLoading();
    }
};

window.editJob = async (jobId) => {
    showLoading('Loading job...');
    try {
        const job = await apiCall('/jobs/' + jobId);
        
        document.getElementById('editJobId').value = job._id;
        document.getElementById('editJobTitle').value = job.title;
        document.getElementById('editJobDescription').value = job.description;
        document.getElementById('editJobCompany').value = job.company;
        document.getElementById('editJobPositions').value = job.totalPositions;
        document.getElementById('editJobMaxApplicants').value = job.maxApplicants;
        document.getElementById('editJobSkills').value = job.requiredSkills.join(', ');
        document.getElementById('editJobExperience').value = job.experience;
        document.getElementById('editJobEducation').value = job.education;
        document.getElementById('editJobStartDate').value = job.startDate ? job.startDate.substring(0,10) : '';
        document.getElementById('editJobEndDate').value = job.endDate ? job.endDate.substring(0,10) : '';
        
        if (job.eliminationRatios) {
            document.getElementById('editRatioAts').value = job.eliminationRatios.ats || 50;
            document.getElementById('editRatioAptitude').value = job.eliminationRatios.aptitude || 50;
            document.getElementById('editRatioTechnical').value = job.eliminationRatios.technical || 50;
            document.getElementById('editRatioGd').value = job.eliminationRatios.gd || 50;
        }

        hideLoading();
        openModal('editJobModal');
    } catch (e) {
        hideLoading();
        showToast('Error loading job details', 'error');
    }
};

window.handleUpdateJob = async (e) => {
    e.preventDefault();
    const jobId = document.getElementById('editJobId').value;
    const startDateVal = document.getElementById('editJobStartDate').value;
    const endDateVal = document.getElementById('editJobEndDate').value;
    
    if (!startDateVal || !endDateVal || new Date(startDateVal) >= new Date(endDateVal)) {
        return showToast('End Date must be after Start Date.', 'error');
    }

    showLoading('Updating job...');
    const payload = {
        title: document.getElementById('editJobTitle').value,
        description: document.getElementById('editJobDescription').value,
        company: document.getElementById('editJobCompany').value,
        totalPositions: parseInt(document.getElementById('editJobPositions').value),
        maxApplicants: parseInt(document.getElementById('editJobMaxApplicants').value) || 100,
        requiredSkills: document.getElementById('editJobSkills').value.split(',').map(s => s.trim()),
        experience: document.getElementById('editJobExperience').value || 0,
        education: document.getElementById('editJobEducation').value,
        startDate: startDateVal,
        endDate: endDateVal,
        eliminationRatios: {
            ats: parseInt(document.getElementById('editRatioAts').value),
            aptitude: parseInt(document.getElementById('editRatioAptitude').value),
            technical: parseInt(document.getElementById('editRatioTechnical').value),
            gd: parseInt(document.getElementById('editRatioGd').value)
        }
    };

    try {
        await apiCall('/jobs/' + jobId, 'PUT', payload);
        closeModal('editJobModal');
        showToast('Job updated successfully!', 'success');
        loadAdminDashboard();
    } catch (error) {
    } finally {
        hideLoading();
    }
};

window.openCreateJobModal = () => {
    // Pre-fill Start and End dates to prevent empty formatting issues
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const today = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
    
    const future = new Date(now.setDate(now.getDate() + 30));
    const futureDate = new Date(future.getTime() - tzOffset).toISOString().split('T')[0];
    
    document.getElementById('jobStartDate').value = today;
    document.getElementById('jobEndDate').value = futureDate;
    
    openModal('createJobModal');
};

window.handleCreateJob = async (e) => {
    e.preventDefault();
    
    const startDateVal = document.getElementById('jobStartDate').value;
    const endDateVal = document.getElementById('jobEndDate').value;
    
    if (!startDateVal || !endDateVal || new Date(startDateVal) >= new Date(endDateVal)) {
        return showToast('End Date must be after Start Date.', 'error');
    }

    showLoading('Creating job...');

    const payload = {
        title: document.getElementById('jobTitle').value,
        description: document.getElementById('jobDescription').value,
        company: document.getElementById('jobCompany').value,
        totalPositions: parseInt(document.getElementById('jobPositions').value),
        maxApplicants: parseInt(document.getElementById('jobMaxApplicants').value) || 100,
        requiredSkills: document.getElementById('jobSkills').value.split(',').map(s => s.trim()),
        experience: document.getElementById('jobExperience').value || 0,
        education: document.getElementById('jobEducation').value,
        startDate: startDateVal,
        endDate: endDateVal,
        eliminationRatios: {
            ats: parseInt(document.getElementById('ratioAts').value),
            aptitude: parseInt(document.getElementById('ratioAptitude').value),
            technical: parseInt(document.getElementById('ratioTechnical').value),
            gd: parseInt(document.getElementById('ratioGd').value)
        }
    };

    try {
        await apiCall('/jobs', 'POST', payload);
        closeModal('createJobModal');
        showToast('Job created successfully!', 'success');
        loadAdminDashboard();
        e.target.reset();
    } catch (error) {
        // Error handled in apiCall
    } finally {
        hideLoading();
    }
};

window.advanceRound = async (jobId) => {
    if (!confirm('This will evaluate candidates, send emails, and advance to the next round. Proceed?')) return;

    showLoading('Evaluating & Advancing...');
    try {
        await apiCall(`/jobs/${jobId}/advance`, 'POST');
        showToast('Evaluated and advanced successfully!', 'success');
        loadAdminDashboard();
    } catch (error) {
        showToast(error.message || 'Error advancing round', 'error');
    } finally {
        hideLoading();
    }
};



window.viewJobDetails = async (jobId) => {
    showLoading('Loading reports...');
    try {
        const job = await apiCall(`/jobs/${jobId}`);
        const stats = await apiCall(`/jobs/${jobId}/stats`);

        document.getElementById('detailJobTitle').textContent = `Reports: ${job.title}`;

        let html = `
            <div class="stats-grid">
                <div class="card stat-card" style="padding:16px">
                    <div class="stat-value" style="font-size:24px">${job.applicants.length}</div>
                    <div class="stat-label">Total Applicants</div>
                </div>
                <div class="card stat-card" style="padding:16px">
                    <div class="stat-value" style="font-size:24px">${job.totalPositions}</div>
                    <div class="stat-label">Open Positions</div>
                </div>
            </div>
            
            <h4 style="margin:24px 0 12px">Round Funnel progression</h4>
            <div style="background:var(--surface); padding:20px; border-radius:var(--radius-md); margin-bottom: 24px;">
        `;

        // Draw Funnel
        Object.entries(stats.progression).forEach(([round, data]) => {
            const pct = Math.round((data.keepCount / job.applicants.length) * 100) || 0;
            html += `
                <div style="margin-bottom:12px">
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                        <span><strong>${formatRoundName(round)}</strong> (Entering: ${data.entering})</span>
                        <span style="color:var(--text-muted)">Keeping ${data.keepCount} (${pct}%)</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${pct}%"></div>
                    </div>
                </div>
            `;
        });

        html += `</div><h4 style="margin:24px 0 12px">Scores & Statistics</h4>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Round</th>
                    <th>Average Score</th>
                    <th>Passed</th>
                    <th>Failed</th>
                </tr>
            </thead>
            <tbody>`;

        Object.entries(stats.stats).forEach(([round, data]) => {
            if (data.total > 0) {
                html += `
                    <tr>
                        <td><strong>${formatRoundName(round)}</strong></td>
                        <td style="color:var(--accent);font-weight:700">${data.avgScore}%</td>
                        <td style="color:var(--success)">${data.passed}</td>
                        <td style="color:var(--danger)">${data.failed}</td>
                    </tr>
                `;
            }
        });

        html += `</tbody></table>`;

        document.getElementById('jobDetailContent').innerHTML = html;
        openModal('jobDetailModal');

    } catch (error) {
    } finally {
        hideLoading();
    }
};

// ==========================================
// SOCKET EVENT LISTENERS
// ==========================================
function setupSocketListeners() {
    socket.on('roundAdvanced', (data) => {
        if (state.user?.role === 'admin') loadAdminDashboard();
        else if (state.user) loadCandidateDashboard();

        showToast(`Job phase updated to ${formatRoundName(data.round)}`, 'info');
    });

    socket.on('roundProcessed', (data) => {
        if (state.user?.role === 'admin') loadAdminDashboard();
        else if (state.user) loadCandidateDashboard();
    });

    socket.on('newApplication', (data) => {
        if (state.user?.role === 'admin') {
            showToast(`New application received: ATS Score ${data.atsScore}%`, 'info');
            loadAdminDashboard();
        }
    });
}

// ==========================================
// PROCTORING SYSTEM (Camera + Tab Detection)
// ==========================================
const proctor = {
    stream: null,
    tabSwitchCount: 0,
    maxWarnings: 2,
    isActive: false,
    isDisqualified: false
};

// Start proctoring - called when any round begins
async function startProctoring() {
    proctor.tabSwitchCount = 0;
    proctor.isActive = true;
    proctor.isDisqualified = false;

    // Start camera
    try {
        proctor.stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const proctorVideo = document.getElementById('proctorVideo');
        proctorVideo.srcObject = proctor.stream;
        document.getElementById('proctorCamera').style.display = 'block';
    } catch (err) {
        showToast('⚠️ Camera access required for proctoring! Please allow camera.', 'error');
        return false;
    }

    // Setup tab visibility detection
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    // Prevent right-click
    document.addEventListener('contextmenu', preventContextMenu);

    showToast('📹 Proctoring started. Camera is ON. Do not leave this page.', 'info');
    return true;
}

// Stop proctoring
function stopProctoring() {
    proctor.isActive = false;

    // Stop camera
    if (proctor.stream) {
        proctor.stream.getTracks().forEach(track => track.stop());
        proctor.stream = null;
    }
    document.getElementById('proctorCamera').style.display = 'none';

    // Remove listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    document.removeEventListener('contextmenu', preventContextMenu);
}

function preventContextMenu(e) {
    if (proctor.isActive) {
        e.preventDefault();
        showToast('Right-click is disabled during the exam.', 'error');
    }
}

function handleVisibilityChange() {
    if (!proctor.isActive || proctor.isDisqualified) return;
    if (document.hidden) {
        handleTabSwitch();
    }
}

function handleWindowBlur() {
    if (!proctor.isActive || proctor.isDisqualified) return;
    handleTabSwitch();
}

function handleTabSwitch() {
    proctor.tabSwitchCount++;

    // Emit to server
    socket.emit('tabSwitch', {
        jobId: state.currentJobId,
        round: state.currentRound,
        count: proctor.tabSwitchCount
    });

    if (proctor.tabSwitchCount >= proctor.maxWarnings) {
        // DISQUALIFY
        proctor.isDisqualified = true;
        disqualifyCandidate();
    } else {
        // Show warning
        document.getElementById('tabWarnCount').textContent = `Warning ${proctor.tabSwitchCount} / ${proctor.maxWarnings}`;
        openModal('tabWarningModal');
    }
}

window.dismissTabWarning = () => {
    closeModal('tabWarningModal');
};

async function disqualifyCandidate() {
    // Stop all exams
    clearInterval(state.exam.timerInterval);
    clearInterval(state.interview.faceDataInterval);

    // Stop any running recordings
    if (state.gd.mediaRecorder && state.gd.mediaRecorder.state !== 'inactive') {
        state.gd.mediaRecorder.stop();
    }
    if (state.gd.recognition) {
        try { state.gd.recognition.stop(); } catch (e) { }
    }
    if (state.interview.recognition) {
        try { state.interview.recognition.stop(); } catch (e) { }
    }
    if (state.interview.stream) {
        state.interview.stream.getTracks().forEach(t => t.stop());
    }

    // Submit 0 score for the current round
    try {
        if (state.currentRound === 'aptitude' || state.currentRound === 'technical') {
            await apiCall(`/${state.currentRound}/${state.currentJobId}/submit`, 'POST', {
                answers: {},
                timeTaken: '00:00',
                disqualified: true
            });
        } else if (state.currentRound === 'gd') {
            await apiCall(`/gd/${state.currentJobId}/submit`, 'POST', {
                speechText: '',
                duration: 0,
                responseTime: 0,
                totalSessionTime: 0,
                disqualified: true
            });
        } else if (state.currentRound === 'interview') {
            await apiCall(`/interview/${state.currentJobId}/submit`, 'POST', {
                answers: [],
                faceData: { eyeContact: 0, smileFrequency: 0, faceVisibility: 0, headStability: 0, postureScore: 0, gestureScore: 0 },
                duration: 0,
                disqualified: true
            });
        }
    } catch (e) {
        // Don't block disqualification if API fails
    }

    // Stop proctoring
    stopProctoring();

    // Show disqualification modal
    closeModal('tabWarningModal');
    openModal('disqualifiedModal');
}

// Override startRound to include proctoring
const _originalStartRound = startRound;
window.startRound = startRound; // keep reference

async function startRoundWithProctoring(jobId, round) {
    state.currentJobId = jobId;
    state.currentRound = round;
    showLoading(`Preparing ${round} round...`);

    socket.emit('joinJob', jobId);

    // Start proctoring first
    const proctorOK = await startProctoring();
    if (!proctorOK) {
        hideLoading();
        showToast('Camera access required. Cannot start round without proctoring.', 'error');
        return;
    }

    try {
        if (round === 'aptitude') {
            const data = await apiCall(`/aptitude/${jobId}/questions`);
            setupExam(data, 'aptitude');
        } else if (round === 'technical') {
            const data = await apiCall(`/technical/${jobId}/questions`);
            setupExam(data, 'technical');
        } else if (round === 'gd') {
            const data = await apiCall(`/gd/${jobId}/topic`);
            setupGD(data);
        } else if (round === 'interview') {
            const data = await apiCall(`/interview/${jobId}/questions`);
            setupInterview(data);
        }
    } catch (error) {
        stopProctoring();
        console.error(error);
        showToast(`Failed to start ${round} round: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// Replace the global startRound
window.startRound = startRoundWithProctoring;

// Override goToDashboard to stop proctoring
const _originalGoToDashboard = window.goToDashboard;
window.goToDashboard = () => {
    stopProctoring();
    state.currentJobId = null;
    state.currentRound = null;
    showDashboard();
};

// Override showResults to stop proctoring
const _originalShowResults = showResults;
const _wrappedShowResults = function (score, passed, feedback, breakdownMap) {
    stopProctoring();
    _originalShowResults(score, passed, feedback, breakdownMap);
};
// We can't easily override showResults since it's called internally, so patch submitExam and finishInterview
