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

---

## Escaping Behavior (Conservative by Design)

When writing changes back into the source JSON, this extension uses a **strict,
conservative escaping policy** to avoid making assumptions about Ignition’s
internal JSON serializer.

Specifically, on write-back the extension will:

1. **Escape all non-ASCII characters**
   Any character outside the printable ASCII range (`0x20–0x7E`) is encoded as
   a Unicode escape sequence (`\uXXXX`, or surrogate pairs when required).
   This ensures characters such as `»`, smart quotes, and other extended
   Unicode symbols are always escaped.

2. **Escape a conservative “web-safe” set**
   The following characters are always written as Unicode escapes:
   - `<` → `\u003c`
   - `>` → `\u003e`
   - `&` → `\u0026`
   - `=` → `\u003d`

3. **Preserve original Unicode escape choices**
   If the original JSON string literal used specific Unicode escapes (for
   example `\u003d` instead of `=`), those exact escape sequences are preserved
   when writing back, even if the character appears elsewhere.

This ensures that:
- Newly introduced characters are escaped conservatively
- Existing escape conventions from the Ignition export are respected
- No assumptions are made about which characters Ignition expects to be escaped

The goal is to put the content *back into the JSON exactly as safely as it came
out*, with no normalization that could diverge from Ignition’s expectations.

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

