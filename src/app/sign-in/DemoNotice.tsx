/** Makes the Phase 1 demo sign-in unmistakable (OC-27). */
export function DemoNotice() {
  return (
    <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
      <strong>Demo sign-in.</strong> This Phase 1 review build uses synthetic accounts only. No password is asked for or
      stored; real sign-in arrives in Phase 2.
    </p>
  );
}
