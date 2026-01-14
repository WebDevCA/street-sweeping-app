# App Icons

## Current Status

✅ **Placeholder icons created** (icon-192.svg and icon-512.svg)
- Simple blue bell design
- Works for testing
- **Replace with your AI-generated artwork for production**

## How to Replace with Your Custom Artwork

### Option 1: Use Your AI-Generated Image (Recommended)

1. **Prepare your image:**
   - Start with your AI-generated street sweeping artwork
   - Crop to a square (1:1 aspect ratio)
   - Export as PNG with transparent background if possible

2. **Generate all required sizes:**

   **Online Tool (Easiest):**
   - Use [PWA Asset Generator](https://www.pwabuilder.com/imageGenerator)
   - Upload your square image
   - Download the generated icons

   **Or manually create these sizes:**
   - icon-192.png (192x192)
   - icon-512.png (512x512)

3. **Replace the files:**
   - Delete `icon-192.svg` and `icon-512.svg`
   - Add your new `icon-192.png` and `icon-512.png`
   - Update `manifest.json` to change `type: "image/svg+xml"` to `type: "image/png"`
   - Update file extension in `index.html` for apple-touch-icon reference

### Option 2: Extract the Bell Icon

If you want to use just the bell from your AI image:
- Crop/extract the bell portion
- Follow the same steps as Option 1

## Files in This Directory

- `bell.svg` - Small bell icon used in the app header
- `icon-192.svg` - Temporary PWA icon (192x192) - **REPLACE ME**
- `icon-512.svg` - Temporary PWA icon (512x512) - **REPLACE ME**

The placeholder icons will work for testing, but replacing them with your custom artwork will make the app look much more polished!
