// Street Sweeping Reminder App - Main JavaScript

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
    checkNotificationPermission();
    setupPWAInstall();
    registerServiceWorker();
});

// Load state from localStorage
function loadState() {
    const savedState = localStorage.getItem('sweepingAppState');
    if (savedState) {
        state = JSON.parse(savedState);

        // Update reminder time inputs
        document.getElementById('nightBeforeTime').value = state.reminders.nightBefore;
        document.getElementById('morningOfTime').value = state.reminders.morningOf;

        renderSchedules();
        renderExceptions();
    }
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('sweepingAppState', JSON.stringify(state));
    updateNextSweepingDisplay();
    scheduleNotifications();
}

// Initialize event listeners
function initEventListeners() {
    // Schedule modal
    document.getElementById('addScheduleBtn').addEventListener('click', () => openModal('scheduleModal'));
    document.getElementById('closeScheduleModal').addEventListener('click', () => closeModal('scheduleModal'));
    document.getElementById('cancelSchedule').addEventListener('click', () => closeModal('scheduleModal'));
    document.getElementById('scheduleForm').addEventListener('submit', handleScheduleSubmit);

    // Exception modal
    document.getElementById('addExceptionBtn').addEventListener('click', () => openModal('exceptionModal'));
    document.getElementById('closeExceptionModal').addEventListener('click', () => closeModal('exceptionModal'));
    document.getElementById('cancelException').addEventListener('click', () => closeModal('exceptionModal'));
    document.getElementById('exceptionForm').addEventListener('submit', handleExceptionSubmit);

    // Reminder settings
    document.getElementById('saveRemindersBtn').addEventListener('click', handleRemindersSave);

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId === 'scheduleModal') {
        document.getElementById('scheduleForm').reset();
    }
    if (modalId === 'exceptionModal') {
        document.getElementById('exceptionForm').reset();
    }
}

// Handle schedule form submission
function handleScheduleSubmit(e) {
    e.preventDefault();

    const scheduleName = document.getElementById('scheduleName').value || 'Street Sweeping';
    const dayOfWeek = parseInt(document.getElementById('dayOfWeek').value);
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    // Get checked week patterns
    const weekPatternCheckboxes = document.querySelectorAll('input[name="weekPattern"]:checked');
    const weekPattern = Array.from(weekPatternCheckboxes).map(cb => parseInt(cb.value));

    if (weekPattern.length === 0) {
        alert('Please select at least one week of the month');
        return;
    }

    const schedule = {
        id: Date.now(),
        name: scheduleName,
        dayOfWeek: dayOfWeek,
        weekPattern: weekPattern,
        startTime: startTime,
        endTime: endTime,
        active: true
    };

    state.schedules.push(schedule);
    saveState();
    renderSchedules();
    closeModal('scheduleModal');
}

// Handle exception form submission
function handleExceptionSubmit(e) {
    e.preventDefault();

    const exceptionDate = document.getElementById('exceptionDate').value;
    const exceptionReason = document.getElementById('exceptionReason').value || 'Exception';

    const exception = {
        id: Date.now(),
        date: exceptionDate,
        reason: exceptionReason
    };

    state.exceptions.push(exception);
    saveState();
    renderExceptions();
    closeModal('exceptionModal');
}

// Handle reminder settings save
function handleRemindersSave() {
    state.reminders.nightBefore = document.getElementById('nightBeforeTime').value;
    state.reminders.morningOf = document.getElementById('morningOfTime').value;
    saveState();
    alert('Reminder times saved!');
}

// Render schedules list
function renderSchedules() {
    const scheduleList = document.getElementById('scheduleList');

    if (state.schedules.length === 0) {
        scheduleList.innerHTML = '<div class="empty-state">No schedules added yet</div>';
        return;
    }

    scheduleList.innerHTML = state.schedules.map(schedule => {
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][schedule.dayOfWeek];
        const weeksText = schedule.weekPattern.map(w => {
            const suffix = ['', 'st', 'nd', 'rd', 'th', 'th'];
            return w + (suffix[w] || 'th');
        }).join(', ');

        return `
            <div class="schedule-item">
                <div class="schedule-info">
                    <div class="schedule-label">${schedule.name}</div>
                    <div class="schedule-details">
                        ${weeksText} ${dayName} • ${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}
                    </div>
                </div>
                <button class="delete-btn" onclick="deleteSchedule(${schedule.id})">×</button>
            </div>
        `;
    }).join('');
}

// Render exceptions list
function renderExceptions() {
    const exceptionsList = document.getElementById('exceptionsList');

    if (state.exceptions.length === 0) {
        exceptionsList.innerHTML = '<div class="empty-state">No exceptions added</div>';
        return;
    }

    // Sort exceptions by date
    const sortedExceptions = [...state.exceptions].sort((a, b) => new Date(a.date) - new Date(b.date));

    exceptionsList.innerHTML = sortedExceptions.map(exception => {
        const date = new Date(exception.date + 'T00:00:00');
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        return `
            <div class="exception-item">
                <div class="exception-info">
                    <div class="schedule-label">${exception.reason}</div>
                    <div class="exception-details">${dateStr}</div>
                </div>
                <button class="delete-btn" onclick="deleteException(${exception.id})">×</button>
            </div>
        `;
    }).join('');
}

// Delete schedule
function deleteSchedule(id) {
    if (confirm('Delete this schedule?')) {
        state.schedules = state.schedules.filter(s => s.id !== id);
        saveState();
        renderSchedules();
    }
}

// Delete exception
function deleteException(id) {
    if (confirm('Delete this exception?')) {
        state.exceptions = state.exceptions.filter(e => e.id !== id);
        saveState();
        renderExceptions();
    }
}

// Update next sweeping display
function updateNextSweepingDisplay() {
    const nextSweeping = getNextSweepingDate();
    const nextDateLarge = document.getElementById('nextDateLarge');
    const timeInfo = document.getElementById('timeInfo');
    const countdown = document.getElementById('countdown');

    if (!nextSweeping) {
        nextDateLarge.textContent = 'No schedule set';
        timeInfo.textContent = '';
        countdown.textContent = '';
        return;
    }

    const { date, schedule } = nextSweeping;
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    nextDateLarge.textContent = dateStr;
    timeInfo.textContent = `${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}`;

    // Calculate countdown
    const now = new Date();
    const daysUntil = Math.floor((date - now) / (1000 * 60 * 60 * 24));

    if (daysUntil === 0) {
        countdown.textContent = 'TODAY!';
        countdown.classList.add('urgent');
    } else if (daysUntil === 1) {
        countdown.textContent = 'Tomorrow';
        countdown.classList.add('urgent');
    } else if (daysUntil <= 7) {
        countdown.textContent = `In ${daysUntil} days`;
        countdown.classList.remove('urgent');
    } else {
        countdown.textContent = `In ${daysUntil} days`;
        countdown.classList.remove('urgent');
    }
}

// Get next sweeping date
function getNextSweepingDate() {
    if (state.schedules.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let closestDate = null;
    let closestSchedule = null;

    // Check next 90 days
    for (let i = 0; i < 90; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);

        // Check if this date is an exception
        const dateStr = checkDate.toISOString().split('T')[0];
        const isException = state.exceptions.some(ex => ex.date === dateStr);
        if (isException) continue;

        // Check each schedule
        for (const schedule of state.schedules) {
            if (!schedule.active) continue;

            // Check if day of week matches
            if (checkDate.getDay() !== schedule.dayOfWeek) continue;

            // Get week of month (1-5)
            const weekOfMonth = Math.ceil(checkDate.getDate() / 7);

            // Check if week pattern matches
            if (schedule.weekPattern.includes(weekOfMonth)) {
                if (!closestDate || checkDate < closestDate) {
                    closestDate = checkDate;
                    closestSchedule = schedule;
                }
            }
        }
    }

    return closestDate ? { date: closestDate, schedule: closestSchedule } : null;
}

// Format time for display
function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Check notification permission
function checkNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return;
    }

    if (Notification.permission === 'default') {
        // Show a prompt to enable notifications
        setTimeout(() => {
            if (confirm('Enable notifications to get reminders about street sweeping?')) {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        scheduleNotifications();
                    }
                });
            }
        }, 2000);
    }
}

// Schedule notifications
function scheduleNotifications() {
    // This is a simplified version. In production, you'd use the Service Worker API
    // to schedule actual background notifications
    console.log('Notifications scheduled');

    // For now, we'll just check if notifications are enabled
    if (Notification.permission === 'granted') {
        console.log('Notification permission granted - reminders will be sent');
    }
}

// PWA Install handling
function setupPWAInstall() {
    let deferredPrompt;
    const installSection = document.getElementById('installSection');
    const installBtn = document.getElementById('installBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installSection.style.display = 'block';
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('PWA installed');
        }

        deferredPrompt = null;
        installSection.style.display = 'none';
    });

    window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
        installSection.style.display = 'none';
    });
}

// Register service worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered:', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
}

// Update display every minute
setInterval(updateNextSweepingDisplay, 60000);
