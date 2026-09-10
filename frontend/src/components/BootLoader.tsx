/* eslint-disable react/no-danger -- static markup + a pre-hydration script */

/**
 * First-paint buffering indicator for full page loads and browser refreshes.
 *
 * The visible node lives inside a `dangerouslySetInnerHTML` wrapper so React
 * never reconciles it — the cleanup script below mutates/removes `#ds-boot`
 * before (and after) hydration without causing a hydration mismatch. Rendered
 * over a frosted-blur backdrop; client-side navigations are handled by
 * <RouteProgress/>.
 */
const BOOT_MARKUP = `
<div id="ds-boot" role="status" aria-label="Loading">
  <div class="ds-boot-bar"></div>
  <div class="ds-boot-card">
    <svg viewBox="0 0 48 48" class="ds-boot-boxes" aria-hidden="true">
      <g fill="currentColor">
        <rect class="ds-boot-box b1" x="6" y="26" width="15" height="15" rx="3.5"></rect>
        <rect class="ds-boot-box b2" x="26" y="26" width="15" height="15" rx="3.5"></rect>
        <rect class="ds-boot-box b3" x="6" y="6" width="15" height="15" rx="3.5"></rect>
      </g>
    </svg>
    <span class="ds-boot-text">Getting things ready…</span>
  </div>
</div>`;

const CLEANUP =
  "(function(){function d(){var e=document.getElementById('ds-boot');" +
  "if(!e)return;e.setAttribute('data-done','1');" +
  "setTimeout(function(){e.parentNode&&e.parentNode.removeChild(e);},450);}" +
  "if(document.readyState==='complete'){d();}" +
  "else{window.addEventListener('load',d,{once:true});}" +
  "setTimeout(d,20000);})();";

export function BootLoader() {
  return (
    <>
      <div
        style={{ display: "contents" }}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: BOOT_MARKUP }}
      />
      <script dangerouslySetInnerHTML={{ __html: CLEANUP }} />
    </>
  );
}
