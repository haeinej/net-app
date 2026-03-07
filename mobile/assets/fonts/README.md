# Fonts (Fontshare)

Download and add here for the net. design system:

- **Sentient** — [fontshare.com/fonts/sentient](https://www.fontshare.com/fonts/sentient)  
  Add: `Sentient-Light.otf` (reading text: thought sentence, context, replies).

- **General Sans** — [fontshare.com/fonts/general-sans](https://www.fontshare.com/fonts/general-sans)  
  Add: `GeneralSans-Medium.otf`, `GeneralSans-Bold.otf` (labels, logo, nav).

Then in `app/_layout.tsx`, uncomment the `useFonts` block and require these files so they load at app start. Until then, the app uses the system font.
