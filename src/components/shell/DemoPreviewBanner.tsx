/** Shown on every page of the hosted demo preview only (OC-34). */
export function DemoPreviewBanner() {
  return (
    <div
      data-testid="demo-preview-banner"
      className="bg-warning-container px-4 py-2 text-center text-sm leading-5 text-on-warning-container"
    >
      <strong>Demo preview.</strong> Sample data only. Nothing here is real, booked or sent.
    </div>
  );
}
