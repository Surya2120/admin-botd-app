# BOTD Admin App

React + Firebase admin panel for controlling live BOTD website content without redesigning the public site.

## Included

- Secure Firebase email/password login
- Protected dashboard routes
- Sidebar sections for:
  - Season
  - Categories
  - Contestants & Judges
  - Events
  - Voting
  - Sponsors
  - Rules
  - Activity Log
- Firestore-first content editing with seeded defaults from the current BOTD website
- Save / Cancel / overwrite confirmation flows
- Undo last change
- Rules version history
- Sponsor ordering controls
- Live preview panels

## Firestore Shape

- `adminContent/seasonPage`
- `adminContent/eventsPage`
- `adminContent/votingPage`
- `adminContent/rulesPage`
- `categories/*`
- `teams/*`
- `judges/*`
- `sponsors/*`
- `adminActivity/*`
- `ruleVersions/*`
- `settings/app`

## Run

1. Install dependencies with `npm install`
2. Start the app with `npm run dev`
3. Sign in using a Firebase Auth email/password admin account

The app auto-seeds Firestore with the current BOTD site defaults on first load if those docs/collections do not already exist.

## Android App

This project is now configured with Capacitor for Android.

1. Build and sync the Android app with `npm run android:sync`
2. Open the native Android project with `npm run android:open`
3. Build the APK / app bundle from Android Studio

Included mobile-ready setup:

- Capacitor config with Android platform scaffolded
- Hash-based routing for safer app navigation inside Android WebView
- Mobile-responsive dashboard layout improvements
- Safe-area padding for phones with notches or gesture bars

## Important Website Integration Note

The existing BOTD website already reads Firebase for sponsors, categories, teams, voting settings, and home settings.

To make `seasons.html`, `events.html`, and the remaining static sections update instantly from this admin app, the public website should subscribe to the new `adminContent/*` documents in the same way it already subscribes to Firebase collections today.
