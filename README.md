# Daybook

A private daily spending and budget tracker in EGP. No account, no ads, no server. Works offline once opened.

## Put it online (free, one time)

The app is plain files. To install it on a phone and have it work offline, the files must be served over https. Any free static host works:

- **GitHub Pages**: create a repository, upload all the files in this folder, then Settings > Pages > deploy from the main branch. Your link is shown on that page.
- **Cloudflare Pages** or **Netlify**: create a project and upload this folder (drag and drop).

The host account is only for hosting the files. Daybook itself never asks you to sign in and your entries never leave your device.

## Install it

- **iPhone (Safari)**: Share > Add to Home Screen. Afterwards, open Daybook only from the home screen icon. On iPhone the icon and Safari keep separate data.
- **Android (Chrome)**: menu > Install app.
- **Computer (Chrome or Edge)**: the install icon in the address bar, or menu > Install Daybook.

## Use it on phone and computer (manual sync)

Your entries are stored in the browser of each device. To move them:

1. More > **Download backup** on the first device (or **Share backup** on a phone).
2. Open the file on the other device: More > **Import backup** > **Merge with this device**.

Merge keeps the newest version of every entry, carries deletions over, and never creates duplicates, so you can do this in both directions as often as you like. Budget limits come from whichever device changed them last. "Replace" throws away what is on the device and uses only the backup.

## Tips

- Enter rent, subscriptions and salary as **Repeating entries** (More). They are added on their day automatically, and the month-end forecast counts them once instead of extrapolating them.
- "Left to spend today" = (total of category limits - spent before today) / days left including today, minus what you spent today. If you overspend, tomorrow's number shrinks automatically.
- Clearing the browser's site data deletes your entries. Download a backup now and then; the app reminds you every two weeks.

## Files

`index.html`, `style.css`, `app.js` (screens), `logic.js` (budget math, merge, import checks), `sw.js` (offline), `manifest.webmanifest` and the icons.
