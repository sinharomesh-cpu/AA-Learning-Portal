/** Shown on every page of the hosted test environment (OC-57). */
export function TestEnvironmentBanner() {
  return (
    <div
      data-testid="test-environment-banner"
      className="bg-inverse-surface px-4 py-2 text-center text-sm leading-5 text-inverse-on-surface"
    >
      <strong>Test environment.</strong> Test data only. Do not enter real names or children&apos;s details. Emails are
      not sent; they appear in the test mailbox.
    </div>
  );
}
