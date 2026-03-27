export async function replayActions(webview, actions, options = {}) {
  if (!webview || !actions?.length) {
    return;
  }

  const speed = Number(options.speedMultiplier || 1);
  const normalizedSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;

  for (const action of actions) {
    await wait(resolveDelay(action.delayMs || 420, normalizedSpeed));

    if (action.type === "navigate" && action.url) {
      await navigate(webview, action.url);
      continue;
    }

    if (action.type === "click") {
      await runInPage(webview, clickScript(action));
      continue;
    }

    if (action.type === "input") {
      await runInPage(webview, inputScript(action));
      continue;
    }

    if (action.type === "scroll") {
      await runInPage(webview, scrollScript(action));
      continue;
    }

    if (action.type === "keyboard") {
      await runInPage(webview, keyboardScript(action));
    }
  }
}

export function withComputedDelays(actions) {
  let previous = null;

  return (actions || []).map((action) => {
    const current = action?.capturedAt || Date.now();
    const delayMs = previous ? Math.max(120, current - previous) : 350;
    previous = current;
    return {
      ...action,
      delayMs
    };
  });
}

async function navigate(webview, url) {
  await waitForLoad(webview, () => {
    webview.src = url;
  });
}

function clickScript(action) {
  return `
    (() => {
      ${sharedHelpers()}
      const element = findBestElement(${JSON.stringify(action)});
      if (!element) {
        return { ok: false, reason: "Element not found for click." };
      }
      element.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      element.click();
      return { ok: true };
    })();
  `;
}

function inputScript(action) {
  return `
    (() => {
      ${sharedHelpers()}
      const element = findBestElement(${JSON.stringify(action)});
      if (!element) {
        return { ok: false, reason: "Element not found for input." };
      }
      element.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      element.focus();
      const descriptor = element.tagName === "TEXTAREA"
        ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")
        : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (descriptor?.set) {
        descriptor.set.call(element, ${JSON.stringify(action.value || "")});
      } else {
        element.value = ${JSON.stringify(action.value || "")};
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })();
  `;
}

function scrollScript(action) {
  return `
    (() => {
      window.scrollTo({
        left: ${Number(action.scrollX || 0)},
        top: ${Number(action.scrollY || 0)},
        behavior: "auto"
      });
      return { ok: true };
    })();
  `;
}

function keyboardScript(action) {
  return `
    (() => {
      ${sharedHelpers()}
      const element = findBestElement(${JSON.stringify(action)}) || document.activeElement || document.body;
      const eventInit = {
        key: ${JSON.stringify(action.key || "")},
        bubbles: true,
        cancelable: true,
        ctrlKey: ${Boolean(action.ctrlKey)},
        metaKey: ${Boolean(action.metaKey)},
        altKey: ${Boolean(action.altKey)},
        shiftKey: ${Boolean(action.shiftKey)}
      };
      element.dispatchEvent(new KeyboardEvent("keydown", eventInit));
      element.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      if (${JSON.stringify(action.key || "")} === "Enter" && typeof element.click === "function" && element.tagName === "BUTTON") {
        element.click();
      }
      return { ok: true };
    })();
  `;
}

function sharedHelpers() {
  return `
    function findBestElement(action) {
      if (action.selector && action.selector !== "document") {
        try {
          const direct = document.querySelector(action.selector);
          if (direct) {
            return direct;
          }
        } catch (error) {
          // Ignore invalid selectors and continue to text fallback.
        }
      }
      if (action.label) {
        const normalizedLabel = String(action.label).trim().toLowerCase();
        const candidates = Array.from(document.querySelectorAll("button, a, input, textarea, select, [role='button'], [tabindex]"));
        return candidates.find((candidate) => {
          const text = [candidate.innerText, candidate.textContent, candidate.value, candidate.getAttribute("aria-label"), candidate.getAttribute("placeholder")]
            .filter(Boolean)
            .join(" ")
            .trim()
            .toLowerCase();
          return text.includes(normalizedLabel);
        }) || null;
      }
      return null;
    }
  `;
}

async function runInPage(webview, script) {
  try {
    return await webview.executeJavaScript(script, true);
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function waitForLoad(webview, callback) {
  return new Promise((resolve) => {
    const timeout = setTimeout(cleanup, 12000);

    function cleanup() {
      clearTimeout(timeout);
      webview.removeEventListener("did-stop-loading", onLoadStop);
      resolve();
    }

    function onLoadStop() {
      cleanup();
    }

    webview.addEventListener("did-stop-loading", onLoadStop, { once: true });
    callback();
  });
}

function resolveDelay(delayMs, speed) {
  return Math.max(80, Math.round(delayMs / speed));
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
