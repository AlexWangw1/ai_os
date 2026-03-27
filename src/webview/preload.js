const { ipcRenderer } = require("electron");

const keyBuffer = new Set(["Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
let lastScrollAt = 0;

window.addEventListener(
  "click",
  (event) => {
    const target = event.target;

    sendAction({
      type: "click",
      selector: buildSelector(target),
      tagName: target?.tagName || "",
      label: summarizeElement(target),
      x: event.clientX,
      y: event.clientY
    });
  },
  true
);

window.addEventListener(
  "input",
  (event) => {
    const target = event.target;

    if (!target || !("value" in target)) {
      return;
    }

    sendAction({
      type: "input",
      selector: buildSelector(target),
      tagName: target?.tagName || "",
      inputType: target?.type || target?.tagName?.toLowerCase() || "text",
      label: summarizeElement(target),
      value: target.value
    });
  },
  true
);

window.addEventListener(
  "keydown",
  (event) => {
    if (!keyBuffer.has(event.key) && !(event.ctrlKey || event.metaKey || event.altKey)) {
      return;
    }

    sendAction({
      type: "keyboard",
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      selector: buildSelector(document.activeElement),
      label: summarizeElement(document.activeElement)
    });
  },
  true
);

window.addEventListener(
  "scroll",
  () => {
    const now = Date.now();
    if (now - lastScrollAt < 180) {
      return;
    }

    lastScrollAt = now;
    sendAction({
      type: "scroll",
      scrollX: window.scrollX,
      scrollY: window.scrollY
    });
  },
  true
);

function sendAction(action) {
  ipcRenderer.sendToHost("user-action", {
    ...action,
    pageTitle: document.title,
    pageUrl: window.location.href,
    capturedAt: Date.now()
  });
}

function buildSelector(element) {
  if (!element || !element.tagName) {
    return "document";
  }

  if (element.id) {
    return `#${escapeToken(element.id)}`;
  }

  const prioritizedAttributes = ["data-testid", "data-test", "name", "aria-label", "placeholder", "role"];

  for (const attribute of prioritizedAttributes) {
    const value = element.getAttribute?.(attribute);
    if (value) {
      return `${element.tagName.toLowerCase()}[${attribute}="${escapeAttribute(value)}"]`;
    }
  }

  const parts = [];
  let current = element;
  let depth = 0;

  while (current && current.tagName && depth < 4) {
    let part = current.tagName.toLowerCase();

    if (current.classList?.length) {
      const className = Array.from(current.classList)
        .find((token) => token && !token.startsWith("css-") && !token.startsWith("jsx-"));
      if (className) {
        part += `.${escapeToken(className)}`;
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
    depth += 1;
  }

  return parts.join(" > ");
}

function summarizeElement(element) {
  if (!element) {
    return "";
  }

  const tokens = [
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("placeholder"),
    element.getAttribute?.("name"),
    element.innerText,
    element.textContent,
    element.value
  ]
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean);

  return tokens[0]?.slice(0, 120) || element.tagName?.toLowerCase() || "";
}

function escapeToken(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, '\\"');
}
