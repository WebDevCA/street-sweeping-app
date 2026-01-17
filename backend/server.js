require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database');
const { startScheduler, initializeWebPush } = require('./notificationScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
db.initializeDatabase();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get VAPID public key (needed by frontend)
app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Middleware to get or create user from device ID
function getUserMiddleware(req, res, next) {
    const deviceId = req.headers['x-device-id'];

    if (!deviceId) {
        return res.status(400).json({ error: 'Device ID required in X-Device-ID header' });
    }

    req.user = db.getOrCreateUser(deviceId);
    next();
}

// Subscribe to push notifications
app.post('/api/subscribe', getUserMiddleware, (req, res) => {
    try {
        const subscription = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        db.savePushSubscription(req.user.id, subscription);

        res.json({ success: true, message: 'Subscription saved' });
    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// Get all schedules for user
app.get('/api/schedules', getUserMiddleware, (req, res) => {
    try {
        const schedules = db.getSchedules(req.user.id);

        // Parse week_pattern from JSON string
        const parsedSchedules = schedules.map(s => ({
            ...s,
            weekPattern: JSON.parse(s.week_pattern),
            active: !!s.active
        }));

        res.json(parsedSchedules);
    } catch (error) {
        console.error('Error getting schedules:', error);
        res.status(500).json({ error: 'Failed to get schedules' });
    }
});

// Create new schedule
app.post('/api/schedules', getUserMiddleware, (req, res) => {
    try {
        const schedule = req.body;

        if (!schedule.dayOfWeek || !schedule.weekPattern || !schedule.startTime || !schedule.endTime) {
            return res.status(400).json({ error: 'Missing required schedule fields' });
        }

        const result = db.createSchedule(req.user.id, schedule);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error creating schedule:', error);
        res.status(500).json({ error: 'Failed to create schedule' });
    }
});

// Delete schedule
app.delete('/api/schedules/:id', getUserMiddleware, (req, res) => {
    try {
        const scheduleId = req.params.id;
        db.deleteSchedule(req.user.id, scheduleId);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

// Get all exceptions for user
app.get('/api/exceptions', getUserMiddleware, (req, res) => {
    try {
        const exceptions = db.getExceptions(req.user.id);
        res.json(exceptions);
    } catch (error) {
        console.error('Error getting exceptions:', error);
        res.status(500).json({ error: 'Failed to get exceptions' });
    }
});

// Create new exception
app.post('/api/exceptions', getUserMiddleware, (req, res) => {
    try {
        const exception = req.body;

        if (!exception.date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const result = db.createException(req.user.id, exception);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error creating exception:', error);
        res.status(500).json({ error: 'Failed to create exception' });
    }
});

// Delete exception
app.delete('/api/exceptions/:id', getUserMiddleware, (req, res) => {
    try {
        const exceptionId = req.params.id;
        db.deleteException(req.user.id, exceptionId);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting exception:', error);
        res.status(500).json({ error: 'Failed to delete exception' });
    }
});

// Get reminders for user
app.get('/api/reminders', getUserMiddleware, (req, res) => {
    try {
        const reminders = db.getReminders(req.user.id);
        res.json({
            nightBefore: reminders.night_before,
            morningOf: reminders.morning_of
        });
    } catch (error) {
        console.error('Error getting reminders:', error);
        res.status(500).json({ error: 'Failed to get reminders' });
    }
});

// Update reminders for user
app.put('/api/reminders', getUserMiddleware, (req, res) => {
    try {
        const { nightBefore, morningOf } = req.body;

        if (!nightBefore || !morningOf) {
            return res.status(400).json({ error: 'Both reminder times are required' });
        }

        db.updateReminders(req.user.id, nightBefore, morningOf);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating reminders:', error);
        res.status(500).json({ error: 'Failed to update reminders' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);

    // Start notification scheduler
    startScheduler();
});
