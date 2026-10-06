# Microsoft Store submission (Partner Center)

Texts to paste into the ACC Coach submission. Package: `agent\dist\ACC-Coach-<version>.msix`
(`powershell -File agent\build.ps1 -Store`, with the real identity in `identity.json`).
Screenshots: `agent\dist\store-screenshots\` (1920x1080, from the local test site).

## Pricing and availability
- Markets: all (default).
- Visibility: Public audience, then Discoverability: **Make this product available but not
  discoverable in the Store**, **Direct link only**. Teammates install it from the link we post on
  Discord; nobody finds it by searching.
- Pricing: Free.

## Properties
- Category: Utilities & tools.
- Privacy policy URL: https://acc-coach.vercel.app/privacy
- Website: https://acc-coach.vercel.app
- Support contact info: an email address or URL of your choice (shown on the listing).
- System requirements, notes: Assetto Corsa Competizione (Steam) and an account on the team site.

## Age ratings (questionnaire)
- Category: Utility, productivity, communication or other.
- No violence, no sexual content, no gambling, no purchases.
- Users share content: yes (lap data is visible to the other members of the team).
- Shares the user's location: no.

## Store listing (English)
**Description**

ACC Coach is the companion app of a sim-racing team's private telemetry site.

It runs in the background (icon next to the clock), records every session you drive in Assetto
Corsa Competizione from the data the game publishes for apps, and uploads your laps to the team
site when the session ends. There you compare your laps with your teammates', corner by corner:
speed, throttle, brake, steering, gear, racing lines and the time gained or lost everywhere on the
lap, plus leaderboards and an Overall Driver Rating.

Requires Assetto Corsa Competizione and an account on the team site (sign-in with Discord, team
members only).

**Short description**: Records your Assetto Corsa Competizione sessions and uploads them to your
team's telemetry site.

**Search terms** (max 7; not "free" and no other product's name such as Assetto Corsa
Competizione: the first submission was refused for "Free"): telemetry, sim racing, lap times,
racing coach, motorsport, driving analysis, racing team

**Features**
- Records ACC sessions automatically at the game's physics rate
- Uploads your laps when the session ends
- Lap comparison with teammates: inputs, racing lines, time gap
- Leaderboards and Overall Driver Rating
- Starts with Windows (can be turned off in Settings > Apps > Startup)

## Submission options
**Restricted capability runFullTrust, why**: ACC Coach is a classic Win32 desktop app (Python,
packaged as MSIX). It shows an icon in the notification area and reads the shared memory that
Assetto Corsa Competizione publishes for telemetry apps.

**Notes for certification** (the first version was refused under 10.3.1 "App Is Testable - Test
Account": no credentials; replace `<password>` with the REVIEW_PASSWORD set in Vercel):

ACC Coach is a companion app for a private sim-racing team. It records while Assetto Corsa
Competizione (Steam) is running and uploads the sessions to the team's site,
https://acc-coach.vercel.app. Team members sign in with Discord; for testing, use this test account
instead (no Discord needed):
  Username: store-reviewer
  Password: <password>
Steps: 1) Start ACC Coach: its icon appears next to the clock (status "Waiting for ACC") and the
browser opens the "Link this PC" page. 2) Click "Use the test account" under the Discord button,
sign in with the credentials above, then click "Link this PC as Store Reviewer": the app shows
a notification "Linked to Store Reviewer" and its menu says so. 3) The site (team's laps, lap comparison, leaderboards, driver ratings) is now open to
this account; the app's other functions are in the icon's right-click menu. Recording itself needs
the game: without ACC running the app stays in "Waiting for ACC", which is the expected state.
It reads the game's documented shared memory (Local\acpmf_physics, graphics, static) and makes no
other changes to the system.
