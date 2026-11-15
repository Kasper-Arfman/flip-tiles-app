// The debug screen (#/debug): to find out what is going on in the app on a phone. Opened by
// tapping the version at the bottom of the home screen 5 times; players won't stumble on it,
// and nothing on it can harm their progress, except the test tools (test builds only).
//
//   This build   version, commit, platform: which build a tester has
//   Saved        what the progress holds; Copy save (to send it, or load it elsewhere)
//   Store        whether the App Store / Google Play answered, and the coin pack's price
//   Checks       every level solved by its stored solutions, and saving and reading back
//   Log          the last errors and events (see log.ts); Copy log
//   Test tools   (test builds) +100 coins, load a save
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { DEV_MODE, TEST_BUILD } from "../dev";
import { clearLog, log, logText } from "../log";
import { activeLook, exportSave, giveTestCoins, importSave, saveSummary } from "../progress";
import { storeStatus } from "../purchases";
import { checkLevels } from "../selfCheck";
import { applySkin } from "../skins";
import { screen, topbar } from "./ui";

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const table = (rows: Record<string, unknown>) =>
  `<dl class="debug-table">${Object.entries(rows)
    .map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(Array.isArray(v) ? v.join("; ") || "none" : String(v))}</dd>`)
    .join("")}</dl>`;

// Copy text; where the clipboard isn't allowed, the text is shown selected, to copy by hand
async function copy(text: string, fallback: HTMLTextAreaElement) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    fallback.hidden = false;
    fallback.value = text;
    fallback.select();
    return false;
  }
}

export function debugScreen(rerender: () => void) {
  const store = storeStatus();
  const element = screen("debug-screen", `
    ${topbar("Debug", "#/")}
    <div class="debug">
      <section><h2>This build</h2>${table({
        version: __APP_VERSION__,
        build: __BUILD__,
        platform: Capacitor.getPlatform(),
        "test build": TEST_BUILD,
        "dev mode": DEV_MODE,
        screen: `${window.innerWidth} x ${window.innerHeight} @${window.devicePixelRatio}x`,
        browser: navigator.userAgent,
      })}</section>

      <section><h2>Saved</h2>${table(saveSummary())}
        <button type="button" class="copy-save">Copy save</button></section>

      <section><h2>Store</h2>${table({
        "native app": store.native,
        "plugin loaded": store.loaded,
        product: store.product,
        price: store.price,
        "can buy": store.canPurchase,
        errors: store.errors,
      })}</section>

      <section><h2>Checks</h2>
        <button type="button" class="run-checks">Run the checks</button>
        <p class="check-result" aria-live="polite"></p></section>

      <section><h2>Log</h2>
        <pre class="debug-log">${escape(logText()) || "(empty)"}</pre>
        <button type="button" class="copy-log">Copy log</button>
        <button type="button" class="clear-log">Clear log</button></section>

      ${TEST_BUILD ? `<section><h2>Test tools</h2>
        <button type="button" class="add-coins">+100 coins</button>
        <p>Load a save (from Copy save): paste it here. It replaces everything saved now.</p>
        <textarea class="save-input" rows="4" spellcheck="false"></textarea>
        <button type="button" class="load-save">Load save</button></section>` : ""}

      <textarea class="copy-fallback" rows="4" hidden readonly></textarea>
      <p class="copy-done" aria-live="polite"></p>
    </div>`);

  const $ = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector);
  const fallback = $<HTMLTextAreaElement>(".copy-fallback")!;
  const done = $<HTMLElement>(".copy-done")!;
  const copied = async (text: string, what: string) => {
    done.textContent = (await copy(text, fallback)) ? `${what} copied.` : `Select the text above and copy it.`;
  };

  $(".copy-save")!.addEventListener("click", async () => copied(await exportSave(), "Save"));
  $(".copy-log")!.addEventListener("click", () => copied(logText(), "Log"));
  $(".clear-log")!.addEventListener("click", () => {
    clearLog();
    rerender();
  });

  $(".run-checks")!.addEventListener("click", async () => {
    const result = $<HTMLElement>(".check-result")!;
    result.textContent = "Checking...";
    const started = performance.now();
    const problems = checkLevels();
    // Saving and reading back, as the progress does
    const probe = String(Date.now());
    try {
      await Preferences.set({ key: "self-check", value: probe });
      const { value } = await Preferences.get({ key: "self-check" });
      await Preferences.remove({ key: "self-check" });
      if (value !== probe) problems.push(`Saving: wrote ${probe}, read back ${value}`);
    } catch (error) {
      problems.push(`Saving: ${String(error)}`);
    }
    const time = Math.round(performance.now() - started);
    result.textContent = problems.length
      ? `${problems.length} problem(s): ${problems.join("; ")}`
      : `All good: every level and saving (${time} ms).`;
    result.classList.toggle("bad", problems.length > 0);
    log(problems.length ? "error" : "info", `Checks: ${problems.length ? problems.join("; ") : "all good"}`);
  });

  if (TEST_BUILD) {
    $(".add-coins")!.addEventListener("click", () => {
      giveTestCoins(100);
      log("info", "Test tools: 100 coins added");
      rerender();
    });
    $(".load-save")!.addEventListener("click", async () => {
      const text = $<HTMLTextAreaElement>(".save-input")!.value.trim();
      if (!text || !confirm("Replace everything saved now with this save?")) return;
      try {
        await importSave(text);
        applySkin(activeLook());
        log("info", "Test tools: a save was loaded");
        rerender();
      } catch (error) {
        alert(`That save couldn't be loaded: ${String(error)}`);
      }
    });
  }
  return element;
}
