const cron = require('node-cron');
const webpush = require('web-push');
const db = require('./database');

// Initialize web-push with VAPID keys
function initializeWebPush() {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.error('VAPID keys not set! Generate them with: npx web-push generate-vapid-keys');
        return false;
    }

    webpush.setVapidDetails(
        'mailto:' + (process.env.CONTACT_EMAIL || 'your-email@example.com'),
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

    console.log('Web Push initialized successfully');
    return true;
}

// ---- Timezone-aware date/time helpers ----

// Get the {year, month, day} for a given instant in a specific timezone.
function getLocalDateParts(timezone, baseDate = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(baseDate);
    return {
        year: parseInt(parts.find(p => p.type === 'year').value, 10),
        month: parseInt(parts.find(p => p.type === 'month').value, 10),
        day: parseInt(parts.find(p => p.type === 'day').value, 10),
    };
}

// Get the {hour, minute} for a given instant in a specific timezone.
function getLocalTimeParts(timezone, baseDate = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(baseDate);
    return {
        hour: parseInt(parts.find(p => p.type === 'hour').value, 10),
        minute: parseInt(parts.find(p => p.type === 'minute').value, 10),
    };
}

// Format {year, month, day} as 'YYYY-MM-DD'.
function formatDateParts({ year, month, day }) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Parse 'YYYY-MM-DD' to {year, month, day}, or null if invalid.
function parseDateStr(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
}

// Day of week (0=Sunday..6=Saturday) for a {year, month, day}.
// Uses UTC arithmetic so the server's timezone can't influence the result.
function getDayOfWeek({ year, month, day }) {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Add N days to a {year, month, day}, returning a new parts object.
function addDays(parts, n) {
    const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    d.setUTCDate(d.getUTCDate() + n);
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
    };
}

// Calendar week of month (1-5), matching the frontend's Math.ceil(day/7) scheme.
function getWeekOfMonth({ day }) {
    return Math.ceil(day / 7);
}

// Parse 'HH:MM' to total minutes since midnight.
function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// Given an exception's original date, find the schedule that most likely
// corresponds to it (matching day-of-week and week-of-month). Falls back to
// the first active schedule if nothing matches.
function findScheduleForOriginalDate(schedules, originalDateStr) {
    const origParts = parseDateStr(originalDateStr);
    if (origParts) {
        const origDow = getDayOfWeek(origParts);
        const origWeek = getWeekOfMonth(origParts);
        const match = schedules.find(s => {
            if (!s.active) return false;
            if (s.day_of_week !== origDow) return false;
            try {
                const wp = JSON.parse(s.week_pattern);
                return wp.includes(origWeek);
            } catch {
                return false;
            }
        });
        if (match) return match;
    }
    return schedules.find(s => s.active) || null;
}

// Calculate the next sweeping date for a user, resolved in the user's
// local timezone. Returns { dateStr, daysOut, schedule } or null.
async function getNextSweepingDate(userId, timezone) {
    const schedules = await db.getSchedules(userId);
    const exceptions = await db.getExceptions(userId);

    if (schedules.length === 0) return null;

    const todayParts = getLocalDateParts(timezone);

    for (let i = 0; i < 90; i++) {
        const checkParts = addDays(todayParts, i);
        const dateStr = formatDateParts(checkParts);

        // Moved-to date: sweeping happens here regardless of the regular pattern.
        const movedToThisDate = exceptions.find(ex => ex.moved_to_date === dateStr);
        if (movedToThisDate) {
            const schedule = findScheduleForOriginalDate(schedules, movedToThisDate.date);
            if (schedule) {
                return { dateStr, daysOut: i, schedule };
            }
            continue;
        }

        // Original-date exception: sweeping on this day was cancelled or moved.
        if (exceptions.some(ex => ex.date === dateStr)) continue;

        const dow = getDayOfWeek(checkParts);
        const weekOfMonth = getWeekOfMonth(checkParts);

        for (const schedule of schedules) {
            if (!schedule.active) continue;
            if (dow !== schedule.day_of_week) continue;

            let weekPattern;
            try {
                weekPattern = JSON.parse(schedule.week_pattern);
            } catch {
                continue;
            }

            if (weekPattern.includes(weekOfMonth)) {
                return { dateStr, daysOut: i, schedule };
            }
        }
    }

    return null;
}

// Send push notification to a user
async function sendPushNotification(subscription, payload) {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        console.log('Push notification sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);
        if (error.statusCode === 410 || error.statusCode === 404) {
            console.log('Subscription expired, removing from database:', subscription.endpoint);
            await db.deletePushSubscription(subscription.endpoint);
        }
        return false;
    }
}

// Format time for display
function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Send a push payload to every subscription belonging to a user.
async function sendToAllSubscriptions(userId, payload) {
    const subscriptions = await db.getPushSubscriptions(userId);
    for (const sub of subscriptions) {
        const subscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        await sendPushNotification(subscription, payload);
    }
}

// Check and send notifications for all users
async function checkAndSendNotifications() {
    const users = await db.getAllUsers();

    console.log(`Checking notifications at ${new Date().toISOString()}`);
    console.log(`Found ${users.length} users to check`);

    for (const user of users) {
        try {
            const reminders = await db.getReminders(user.id);
            const timezone = reminders.timezone || 'UTC';

            const nextSweeping = await getNextSweepingDate(user.id, timezone);
            if (!nextSweeping) {
                console.log(`User ${user.id}: No upcoming sweeping found`);
                continue;
            }

            const { dateStr, daysOut, schedule } = nextSweeping;
            
            // Reminder times are stored as UTC (the frontend converts local→UTC on save),
            // so compare against current UTC time — not local time.
            const now = new Date();
            const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
            
            console.log(
                `User ${user.id}: tz=${timezone}, nextSweeping=${dateStr}, daysOut=${daysOut}, ` +
                `utcTime=${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}, ` +
                `night=${reminders.night_before}utc, morning=${reminders.morning_of}utc`
            );

            // Night-before notification (sweeping is tomorrow).
            if (daysOut === 1) {
                const schedMinutes = timeToMinutes(reminders.night_before);
                if (nowMinutes >= schedMinutes &&
                    !(await db.wasNotificationSent(user.id, 'night_before', dateStr))) {
                    const payload = {
                        title: 'Street Sweeping Tomorrow!',
                        body: `Don't forget to move your car by ${formatTime(schedule.start_time)} tomorrow.`,
                        icon: '/icons/streetSweeperAppIcon.png',
                        vibrate: [200, 100, 200],
                        tag: 'street-sweeping-reminder',
                        requireInteraction: true,
                        data: { url: '/', date: dateStr },
                    };
                    await sendToAllSubscriptions(user.id, payload);
                    await db.logNotification(user.id, 'night_before', dateStr);
                    console.log(`Sent night-before notification to user ${user.id}`);
                }
            }

            // Morning-of notification (sweeping is today).
            if (daysOut === 0) {
                const schedMinutes = timeToMinutes(reminders.morning_of);
                if (nowMinutes >= schedMinutes &&
                    !(await db.wasNotificationSent(user.id, 'morning_of', dateStr))) {
                    const payload = {
                        title: 'Street Sweeping Today!',
                        body: `Move your car by ${formatTime(schedule.start_time)}. Sweeping: ${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
                        icon: '/icons/streetSweeperAppIcon.png',
                        vibrate: [200, 100, 200],
                        tag: 'street-sweeping-reminder',
                        requireInteraction: true,
                        data: { url: '/', date: dateStr },
                    };
                    await sendToAllSubscriptions(user.id, payload);
                    await db.logNotification(user.id, 'morning_of', dateStr);
                    console.log(`Sent morning-of notification to user ${user.id}`);
                }
            }
        } catch (error) {
            console.error(`Error processing notifications for user ${user.id}:`, error);
        }
    }
}

// Start the notification scheduler
function startScheduler() {
    if (!initializeWebPush()) {
        console.error('Cannot start scheduler without VAPID keys');
        return;
    }

    // Run every minute
    cron.schedule('* * * * *', () => {
        checkAndSendNotifications();
    });

    console.log('Notification scheduler started (runs every minute)');
}

module.exports = {
    startScheduler,
    initializeWebPush,
    sendPushNotification,
};
