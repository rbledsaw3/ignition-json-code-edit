# Ignition JSON Edit

Ignition JSON Edit is a Visual Studio Code extension designed for working with
**Ignition Perspective / Vision JSON exports** that embed large script blocks
as escaped JSON string literals.

It allows you to extract those escaped scripts into a real, temporary editor
buffer for normal editing, then safely write them back into the source JSON
with correct escaping.

This is specifically intended for developers who:
- Work with Ignition JSON project exports
- Edit embedded Python scripts (`"script"`, `"code"`, etc.)
- Use VSCodeVim and want normal `:w` save behavior
- Are tired of editing `\t`, `\n`, and `\u003d` by hand

---

## Features

### Extract escaped JSON script strings for editing
When your cursor is inside a JSON string literal containing escaped code, you
can extract it into a temporary file where:

- Tabs, newlines, and unicode escapes are decoded
- You edit real Python code, not escaped JSON
- Syntax highlighting is enabled (Python by default)
- The buffer behaves like a normal file (works with VSCodeVim)

### Write changes back automatically
When you save the temporary buffer (`:w` or File → Save):

- The extension re-encodes the content as a JSON-safe string
- The original JSON string literal is replaced in-place
- No formatting or structure outside the string is touched

You can also manually push changes back with a command.

---

## Typical Use Case

Given JSON like this:

```json
"script": "\tuserId \u003d self.session.props.auth.user.id\n\ttStamp \u003d system.date.now()\n\tif userId:\n\t\tsystem.perspective.print(userId)"
```

You extract it and edit:

```python
userId = self.session.props.auth.user.id
tStamp = system.date.now()

if userId:
    system.perspective.print(userId)
```

Then save — the JSON is updated correctly.

---

## Commands

### Ignition: Extract JSON String to Temp Editor

Extracts the JSON string literal under the cursor (or selected) into a
temporary file for editing.

Command ID:

```
ignitionJsonEdit.extractToTemp
```

### Ignition: Replace Source JSON String From Temp

Manually pushes the current temp buffer back into the source JSON string.

Command ID:

```
ignitionJsonEdit.replaceFromTemp
```

---

## VSCodeVim Integration (Recommended)

This extension is designed to work cleanly with **VSCodeVim**.

Example configuration:

```json
{
  "vim.leader": "<space>",
  "vim.normalModeKeyBindingsNonRecursive": [
    {
      "before": ["<leader>", "i", "e"],
      "commands": ["ignitionJsonEdit.extractToTemp"]
    },
    {
      "before": ["<leader>", "i", "r"],
      "commands": ["ignitionJsonEdit.replaceFromTemp"]
    }
  ],
  "vim.visualModeKeyBindingsNonRecursive": [
    {
      "before": ["<leader>", "i", "e"],
      "commands": ["ignitionJsonEdit.extractToTemp"]
    }
  ]
}
```

Usage:

* `<leader>ie` → extract script
* Edit normally
* `:w` → write back automatically
* `<leader>ir` → manual replace

---

## Language Detection

The extension uses simple heuristics:

* JSON keys named `"script"` or `"code"` default to **Python**
* JSON / JSONC documents default to **Python**
* Otherwise falls back to **plaintext**

You can manually change the language mode in the temp editor if needed.

---

## Limitations

* Assumes the JSON string literal exists on **one physical line**
  (typical for Ignition exports)
* Does not attempt semantic validation of the script
* Unicode escapes may normalize (e.g. `\u003d` → `=`) when written back
  This is valid JSON and works correctly in Ignition

---

## Packaging / Installation

To build the extension:

```bash
npm install
npm run compile
npm run package
```

This produces a `.vsix` file that can be installed via:

```bash
code --install-extension ignition-json-edit-0.0.1.vsix
```

---

## License

MIT

---

### After this

Run again:

```bash
npm run compile
npm run package
```
