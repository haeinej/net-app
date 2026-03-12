# ohm. App Store Submission Checklist

Use this checklist before building the release candidate you plan to upload to App Store Connect.

## Product completeness

- Make sure onboarding works from a fresh account through first successful thought creation.
- Verify the listing copy matches the real product: one thought at a time, replies, accepted replies, and private conversations.
- Remove placeholder, empty, or misleading states from any screen you expect reviewers to reach.
- Confirm the app can be reviewed end to end with a working account and stable backend.

## Required live URLs

- Publish [privacy-policy.html](/Users/jeonghaein/Desktop/ohm-app/docs/privacy-policy.html) at a public HTTPS URL and enter that URL in App Store Connect.
- Publish [support.html](/Users/jeonghaein/Desktop/ohm-app/docs/support.html) at a public HTTPS URL and enter that URL in App Store Connect.
- Update the published support page with a monitored support contact before submitting.

## Account and policy requirements

- Keep in-app account deletion working from `Me > Settings > Delete Account`.
- Keep the in-app privacy policy accurate to the actual data the app collects and stores.
- Make sure the support and privacy paths remain reachable from the running app.

## Backend and environment

- Replace local API values with a public HTTPS production API URL for the build you submit.
- Keep the production API available during App Review.
- Verify production environment variables are set in EAS before creating the build.
- Test the release build against the production backend, not Expo Go and not localhost.

## App Store Connect metadata

- Create or update the app record for bundle identifier `com.ohm.app`.
- Add screenshots from the actual current UI.
- Add the app description, keywords, support URL, and privacy policy URL.
- Complete the App Privacy questionnaire using the data flows described in the live app and privacy policy.
- Prepare review notes that explain the core flow and provide reviewer login access if login is required.

## Release verification

- Run a TestFlight build and verify sign up, login, onboarding, post creation, replies, accepted replies, conversation opening, and account deletion.
- Check photo permissions, profile editing, and privacy/support screens on a physical device.
- Confirm the build number increments for each new App Store submission.
- Verify the app opens cleanly from a cold start without a local dev server.

## Helpful repo files

- App config: [mobile/app.json](/Users/jeonghaein/Desktop/ohm-app/mobile/app.json)
- EAS config: [mobile/eas.json](/Users/jeonghaein/Desktop/ohm-app/mobile/eas.json)
- In-app privacy copy: [mobile/lib/legal.ts](/Users/jeonghaein/Desktop/ohm-app/mobile/lib/legal.ts)
- Support page source: [docs/support.html](/Users/jeonghaein/Desktop/ohm-app/docs/support.html)
- Privacy page source: [docs/privacy-policy.html](/Users/jeonghaein/Desktop/ohm-app/docs/privacy-policy.html)
