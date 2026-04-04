// Street Sweeping Reminder App - Main JavaScript (Updated with Push Fixes)

// State Management
let state = {
    schedules: [],
    exceptions: [],
    reminders: {
        nightBefore: '20:00',
        morningOf: '07:00'
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initEventListeners();
    updateNextSweepingDisplay();
    setupPWAInstall();
    // Start the chain: Register SW -> Then Check Permissions -> Then Subscribe
    registerServiceWorker();
});

// Load state from localStorage
function loadState() {
    const savedState = localStorage.getItem('sweepingAppState');
    if (savedState) {
        state = JSON.parse(savedState);
        if (document.getElementById('nightBeforeTime')) 
            document.getElementById('nightBeforeTime').value = state.reminders.nightBefore;
        if (document.getElementById('morningOfTime')) 
            document.getElementById('morningOfTime').value = state.reminders.morningOf;
        renderSchedules();
        renderExceptions();
    }
}

function saveState() {
    localStorage.setItem('sweepingAppState', JSON.stringify(state));
    updateNextSweepingDisplay();
}

// Initialize event listeners
function initEventListeners() {
    document.getElementById('addScheduleBtn')?.addEventListener('click', () => openModal('scheduleModal'));
    document.getElementById('closeScheduleModal')?.addEventListener('click', () => closeModal('scheduleModal'));
    document.getElementById('cancelSchedule')?.addEventListener('click', () => closeModal('scheduleModal'));
    document.getElementById('scheduleForm')?.addEventListener('submit', handleScheduleSubmit);

    document.getElementById('addExceptionBtn')?.addEventListener('click', () => openModal('exceptionModal'));
    document.getElementById('closeExceptionModal')?.addEventListener('click', () => closeModal('exceptionModal'));
    document.getElementById('cancelException')?.addEventListener('click', () => closeModal('exceptionModal'));
    document.getElementById('exceptionForm')?.addEventListener('submit', handleExceptionSubmit);

    document.getElementById('saveRemindersBtn')?.addEventListener('click', handleRemindersSave);

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
}

function openModal(modalId) { document.getElementById(modalId)?.classList.add('active'); }
function closeModal(modalId) { 
    document.getElementById(modalId)?.classList.remove('active'); 
    const form = document.getElementById(modalId === 'scheduleModal' ? 'scheduleForm' : 'exceptionForm');
    form?.reset();
}

// Handle schedule form submission
async function handleScheduleSubmit(e) {
    e.preventDefault();
    const schedule = {
        name: document.getElementById('scheduleName').value || 'Street Sweeping',
        dayOfWeek: parseInt(document.getElementById('dayOfWeek').value),
        weekPattern: Array.from(document.querySelectorAll('input[name="weekPattern"]:checked')).map(cb => parseInt(cb.value)),
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value
    };

    if (schedule.weekPattern.length === 0) return alert('Please select at least one week');

    try {
        const result = await API.createSchedule(schedule);
        schedule.id = result.id;
        schedule.active = true;
        state.schedules.push(schedule);
        saveState();
        renderSchedules();
        closeModal('scheduleModal');
    } catch (error) {
        console.error('Error saving schedule:', error);
    }
}

// Handle reminder settings save
async function handleRemindersSave() {
    const nightBefore = document.getElementById('nightBeforeTime').value;
    const morningOf = document.getElementById('morningOfTime').value;

    try {
        await API.updateReminders(nightBefore, morningOf);
        state.reminders.nightBefore = nightBefore;
        state.reminders.morningOf = morningOf;
        saveState();
        
        // RE-SUBSCRIBE: Ensure the backend has our latest subscription after updating settings
        await subscribeToPushNotifications();
        alert('Reminder times saved and notifications synced!');
    } catch (error) {
        console.error('Error saving reminders:', error);
    }
}

// Helper: Convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

// Register service worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered');
                // Only check for notifications once we know the SW is alive
                checkNotificationPermission();
            })
            .catch(error => console.log('Service Worker registration failed:', error));
    }
}

// Check notification permission
function checkNotificationPermission() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
        setTimeout(() => {
            if (confirm('Enable notifications for street sweeping reminders?')) {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') subscribeToPushNotifications();
                });
            }
        }, 2000);
    } else if (Notification.permission === 'granted') {
        subscribeToPushNotifications();
    }
}

// THE FIX: Subscribe to push notifications
async function subscribeToPushNotifications() {
    try {
        const registration = await navigator.serviceWorker.ready;
        
        // 1. Clean the VAPID Key
        const response = await API.getVapidPublicKey();
        let publicKey = typeof response === 'object' ? response.publicKey : response;
        
        // Strip out literal quotes that might be coming from the backend string
        publicKey = publicKey.replace(/[\\"]/g, '').trim();
        console.log('Using Cleaned VAPID Key:', publicKey);

        const applicationServerKey = urlBase64ToUint8Array(publicKey);

        // 2. Subscribe
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        console.log('Push Endpoint Generated:', subscription.endpoint);

        // 3. Send to backend
        await API.subscribeToPush(subscription);
        console.log('Successfully synced subscription with backend');
    } catch (error) {
        console.error('Push Subscription Process Failed:', error);
    }
}

// UI Rendering Functions
function renderSchedules() {
    const list = document.getElementById('scheduleList');
    if (state.schedules.length === 0) {
        list.innerHTML = '<div class="empty-state">No schedules added yet</div>';
        return;
    }
    list.innerHTML = state.schedules.map(s => {
        const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][s.dayOfWeek];
        const weeks = s.weekPattern.map(w => w + (['th', 'st', 'nd', 'rd', 'th', 'th'][w] || 'th')).join(', ');
        return `
            <div class="schedule-item">
                <div class="schedule-info">
                    <div class="schedule-label">${s.name}</div>
                    <div class="schedule-details">${weeks} ${day} • ${formatTime(s.startTime)} - ${formatTime(s.endTime)}</div>
                </div>
                <button class="delete-btn" onclick="deleteSchedule(${s.id})">×</button>
            </div>`;
    }).join('');
}

function renderExceptions() { /* ... Same as your original code ... */ }
function deleteSchedule(id) { if (confirm('Delete?')) { state.schedules = state.schedules.filter(s => s.id !== id); saveState(); renderSchedules(); } }
function formatTime(t) { 
    const [h, m] = t.split(':'); 
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; 
}

// Update display logic (simplified for brevity)
function updateNextSweepingDisplay() {
    // ... logic from your original code ...
}

function getNextSweepingDate() {
    // ... logic from your original code ...
}

function setupPWAInstall() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (document.getElementById('installSection')) document.getElementById('installSection').style.display = 'block';
    });
    document.getElementById('installBtn')?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt = null;
            if (document.getElementById('installSection')) document.getElementById('installSection').style.display = 'none';
        }
    });
}

setInterval(updateNextSweepingDisplay, 60000);
