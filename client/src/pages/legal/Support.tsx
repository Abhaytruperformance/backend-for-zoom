import { LegalLayout } from "./LegalLayout.js";

export default function Support() {
  return (
    <LegalLayout title="Support">
      <p>
        Questions, bugs, or account issues — reach us directly at{" "}
        <a href="mailto:abhayshukla4455@gmail.com">abhayshukla4455@gmail.com</a>. We respond directly, not through a ticket queue.
      </p>

      <h2>Common questions</h2>

      <h3>A meeting isn't showing up</h3>
      <p>
        Meetings only appear once Zoom's Cloud Recording finishes processing and a transcript is available — this can take a few minutes
        after a call ends. Check that "Automatically record meetings to the cloud" is enabled in your Zoom account settings; a meeting
        that wasn't recorded to the cloud can't be picked up.
      </p>

      <h3>I want to disconnect my Zoom or mailbox account</h3>
      <p>Use the Disconnect button on the Zoom or Mailbox page in the app — this immediately deletes the stored connection.</p>

      <h3>A follow-up draft looks wrong</h3>
      <p>
        Edit it directly before approving — subject, body, and recipients are all editable on the approval screen. Nothing sends until
        you explicitly approve it.
      </p>

      <h2>See also</h2>
      <p>
        <a href="/docs">Documentation</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a>
      </p>
    </LegalLayout>
  );
}
