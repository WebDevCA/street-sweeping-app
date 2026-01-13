# Street Sweeping Reminder

A simple Progressive Web App (PWA) to help you never miss street sweeping day and avoid parking tickets.

## Features

- 📅 **Flexible Scheduling**: Support for complex patterns like "1st and 3rd Friday" or alternating sides
- 🔔 **Dual Reminders**: Get notified the night before AND the morning of
- 🎉 **Holiday Exceptions**: Mark holidays and special days when sweeping is cancelled
- 📱 **PWA**: Install on your phone like a native app
- 💾 **Offline**: Works without internet - all data stored locally
- 🔒 **Privacy**: No backend, no tracking, no accounts - just you and your schedule

## Current Schedule Example

This app is configured for a schedule of:
- **1st and 3rd Friday**
- **10:30 AM - 2:30 PM**

But you can customize it for ANY street sweeping pattern!

## How to Use

### 1. Open the App
Simply open `index.html` in a modern web browser (Chrome, Safari, Firefox, Edge)

### 2. Add Your Schedule
- Click "Add Schedule"
- Select the day of week
- Choose which weeks of the month (1st, 2nd, 3rd, 4th, 5th)
- Set start and end times
- Save!

### 3. Set Reminder Times
- Configure when you want to be reminded:
  - Night before (default: 8:00 PM)
  - Morning of (default: 7:00 AM)

### 4. Mark Exceptions
- Add holidays or special dates when sweeping is cancelled
- The app will automatically skip these dates

### 5. Install as PWA (Optional but Recommended)
- On mobile: Look for "Add to Home Screen" option
- On desktop: Look for install icon in address bar
- Get notifications even when the app is closed!

## Technology Stack

- **Pure HTML/CSS/JavaScript** - No frameworks, no dependencies
- **localStorage** - Data persistence
- **Service Worker** - Offline support and notifications
- **PWA** - Installable on any device

## Local Development

To test locally:

1. Use a local web server (required for service workers):
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js
   npx http-server
   ```

2. Open `http://localhost:8000` in your browser

3. For HTTPS testing (needed for some PWA features):
   ```bash
   # Using Node.js http-server with SSL
   npx http-server -S -C cert.pem -K key.pem
   ```

## Future Enhancements

- [ ] Weather-based cancellations (API integration)
- [ ] Snooze functionality
- [ ] Multiple vehicles support
- [ ] Location awareness
- [ ] Community schedule sharing
- [ ] Analytics (money saved, close calls avoided)

## Browser Support

Works on all modern browsers that support:
- Service Workers
- localStorage
- Notifications API
- PWA installation

Tested on:
- Chrome/Edge (Desktop & Mobile)
- Safari (iOS & macOS)
- Firefox

## License

MIT License - Feel free to use and modify!
