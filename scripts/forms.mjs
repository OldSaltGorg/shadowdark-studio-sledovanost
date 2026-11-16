/** Read every named control in a form, including <prose-mirror> custom elements. */
export function readForm(form) {
  const data = {};
  for (const el of form.querySelectorAll("[name]")) {
    if (el.disabled) continue;
    if (el.type === "checkbox") data[el.name] = el.checked;
    else if (el.type === "radio") {
      if (el.checked) data[el.name] = el.value;
    } else if (el.type !== "file") data[el.name] = el.value ?? "";
  }
  return foundry.utils.expandObject(data);
}

/**
 * Replace `<div data-prose-name="x">` placeholders with real ProseMirror editors.
 * Uses the documented create() API so initial values never pass through HTML attributes.
 */
export function mountEditors(root, values = {}) {
  const ProseMirror = foundry.applications.elements.HTMLProseMirrorElement;
  for (const slot of root.querySelectorAll("[data-prose-name]")) {
    const name = slot.dataset.proseName;
    const editor = ProseMirror.create({
      name,
      value: foundry.utils.getProperty(values, name) ?? "",
      toggled: false,
      height: Number(slot.dataset.height) || 200
    });
    slot.replaceWith(editor);
  }
}

/** A save/cancel dialog that resolves to the expanded form data, or null. */
export async function formDialog({ title, content, width = 520, labels, values = {} }) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title, resizable: true },
    classes: ["sdstudio-dialog"],
    position: { width },
    content,
    render: (event, dialog) => mountEditors(dialog.element, values),
    buttons: [
      { action: "save", label: labels.save, icon: "fa-solid fa-floppy-disk", default: true,
        callback: (event, button) => readForm(button.form) },
      { action: "cancel", label: labels.cancel }
    ]
  });
  return result && typeof result === "object" ? result : null;
}
