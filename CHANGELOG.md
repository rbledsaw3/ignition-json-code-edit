## [0.0.2] – 2026-01-06

### Added
- Implemented a **conservative JSON write-back escaping policy**:
  - All non-ASCII characters are always escaped as Unicode (`\uXXXX`)
  - Web-safe characters (`<`, `>`, `&`, `=`) are always written as Unicode escapes
- Preserves **exact Unicode escape sequences** (`\uXXXX`) present in the original JSON string literal when writing back edited content

### Fixed
- Fixed use-before-declaration errors in temporary buffer extraction logic
- Corrected tracking of temp buffers to include Unicode escape metadata
- Fixed quote-scanning logic when locating JSON string literals under the cursor
- Improved error handling around extract and replace operations

### Notes
- This release intentionally avoids normalizing or simplifying Unicode escapes
- Edited content is written back **at least as conservatively as the original export**
- No assumptions are made about Ignition’s internal JSON serialization behavior

