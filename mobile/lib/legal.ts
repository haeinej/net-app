export const PRIVACY_POLICY_LAST_UPDATED = "March 12, 2026";

export const PRIVACY_POLICY_SECTIONS: Array<{
  title: string;
  paragraphs: string[];
}> = [
  {
    title: "What ohm. collects",
    paragraphs: [
      "ohm. collects the information you choose to provide when you create and use your account, including your name, email address, password, profile photo, and any interests you add during onboarding or later profile edits.",
      "We also store the content you create in the app, including thoughts, replies, private conversations, crossings, and shifts, along with the timestamps and account relationships needed to show that content back to you and the people involved.",
      "To operate the product responsibly, we keep limited operational data such as authentication state, engagement signals, and service logs that help us secure the app, understand product performance, and investigate misuse.",
    ],
  },
  {
    title: "How ohm. uses your information",
    paragraphs: [
      "We use your information to create your account, personalize your experience, power the thought feed, deliver conversations, and support product features such as onboarding, profile management, and account recovery.",
      "Operational data is used to keep the service reliable, understand how the product is used, and improve matching, safety, and performance over time.",
    ],
  },
  {
    title: "Who can see your content",
    paragraphs: [
      "Your profile information and published thoughts may be visible to other people inside ohm. according to the product surfaces where they are shown.",
      "Replies, accepted conversations, crossings, and shifts are visible only within the contexts created by those interactions and are not intended to be public web content. Pending replies are not shown on the public thought view until the thought author accepts them.",
    ],
  },
  {
    title: "Retention and deletion",
    paragraphs: [
      "We retain account and content data while your account is active so the app can function. If you delete a thought manually, it is removed from your profile surfaces in the app.",
      "If you delete your account, ohm. deletes your account record and the associated thoughts, replies, conversations, and related product data tied to that account from the primary application database.",
    ],
  },
  {
    title: "Your choices",
    paragraphs: [
      "You can update your profile details from the Me tab. You can also delete your account at any time from Me > Settings > Delete Account.",
      "If you no longer want us to process your information through the app, deleting your account is the in-product way to remove your data and stop using the service.",
    ],
  },
  {
    title: "Questions",
    paragraphs: [
      "For privacy or support questions, use the support contact published with the app listing and the support materials for ohm.. You can also review the in-app Support and Privacy Policy screens from Settings.",
    ],
  },
];

export const SUPPORT_LAST_UPDATED = "March 12, 2026";

export const SUPPORT_SECTIONS: Array<{
  title: string;
  paragraphs: string[];
}> = [
  {
    title: "Getting help",
    paragraphs: [
      "If you need help with sign in, profile access, or unexpected behavior in ohm., start with the support contact published with the current App Store listing for the release you are using.",
      "For account-specific issues, use the support page or contact method published for the live app so your request reaches the monitored support channel for that release.",
    ],
  },
  {
    title: "Privacy and data",
    paragraphs: [
      "You can review the in-app Privacy Policy at any time from Settings > Privacy Policy.",
      "If you no longer want to use the service, you can permanently remove your account and the data tied to it from Settings > Delete Account.",
    ],
  },
  {
    title: "Account deletion",
    paragraphs: [
      "Deleting your account removes your profile, thoughts, replies, conversations, and the related app data tied to that account from the primary application database.",
      "Account deletion is initiated inside the app and does not require a separate web request.",
    ],
  },
];
