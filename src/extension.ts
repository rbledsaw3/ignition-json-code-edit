// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

type LinkInfo = {
    sourceUri: vscode.Uri;
    sourceRange: vscode.Range;
    languageId: string;
    unicodeEscapeMap: Map<string, string>;
};

const TempToLink = new Map<string, LinkInfo>();


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const extractCmd = vscode.commands.registerCommand(
        "ignitionJsonEdit.extractToTemp",
        async () => {
            try {
                await ExtractToTemp(context);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Extraction failed: ${FormatErr(err)}`);
            }
        }
    );

    const replaceCmd = vscode.commands.registerCommand(
        "ignitionJsonEdit.replaceFromTemp",
        async () => {
            try {
                await ReplaceFromTemp();
            } catch (err: any) {
                vscode.window.showErrorMessage(`Replace failed: ${FormatErr(err)}`);
            }
        }
    );

    const saveListener = vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const link = TempToLink.get(doc.uri.toString());
        if (!link) return;

        try {
            await PushTempToSource(doc, link);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Auto-replace on save failed: ${FormatErr(err)}`);
        }
    });

    context.subscriptions.push(extractCmd, replaceCmd, saveListener);

}

// This method is called when your extension is deactivated
export function deactivate() {}

function FormatErr(err: any): string {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err.message) return err.message;
    try { return JSON.stringify(err); } catch {
        return String(err);
    }
}

function BuildUnicodeEscapeMapFromLiteral(rawLiteral: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /\\u([0-9a-fA-F]{4})/g;

    let match: RegExpExecArray | null;
    while ((match = re.exec(rawLiteral)) !== null) {
        const hex = match[1].toLowerCase();
        const code = parseInt(hex, 16);
        const char = String.fromCharCode(code);

        if (char === "\\" || char === "\"") continue;
        map.set(char, `\\u${hex}`);
    }
    return map;
}

function EscapeCharToUnicode(ch: string): string {
    const codePoint = ch.codePointAt(0)!;
    if (codePoint <= 0xFFFF) {
        return "\\u" + codePoint.toString(16).padStart(4, '0');
    }

    const n = codePoint - 0x10000;
    const highSurrogate = 0xD800 + (n >> 10);
    const lowSurrogate = 0xDC00 + (n & 0x3FF);

    return (
        "\\u" + highSurrogate.toString(16).padStart(4, '0') +
        "\\u" + lowSurrogate.toString(16).padStart(4, '0')
    );
}

function ApplyConservativeEscapePolicy(jsonStringLiteral: string): string {
    if (
        jsonStringLiteral.length < 2 ||
            jsonStringLiteral[0] !== '"' ||
            jsonStringLiteral[jsonStringLiteral.length - 1] !== '"'
    ) {
        return jsonStringLiteral;
    }

    let inner = jsonStringLiteral.slice(1, -1);

    inner = inner.replace(/[^\u0020-\u007E]/gu, (m) => EscapeCharToUnicode(m));

    inner = inner
        .split("<").join("\\u003c")
        .split(">").join("\\u003e")
        .split("&").join("\\u0026")
        .split("=").join("\\u003d");

    return `"${inner}"`;
}

function ApplyUnicodeEscapePolicy(jsonStringLiteral: string, unicodeEscapeMap: Map<string, string>): string {
    if (unicodeEscapeMap.size === 0) return jsonStringLiteral;

    if (
        jsonStringLiteral.length < 2 ||
            jsonStringLiteral[0] !== '"' ||
            jsonStringLiteral[jsonStringLiteral.length - 1] !== '"'
    ) {
        return jsonStringLiteral;
    }

    let inner = jsonStringLiteral.slice(1, -1);

    for (const [ch, esc] of unicodeEscapeMap.entries()) {
        inner = inner.split(ch).join(esc);
    }

    return `"${inner}"`;
}

function FindIgnitionValueLiteralOnLine(doc: vscode.TextDocument, lineNo: number): vscode.Range | null {
    const line = doc.lineAt(lineNo).text;
    const re = /(^|\s)"(code|script|expression|style|query)"\s*:\s*"/;
    const match = re.exec(line);
    if (!match) return null;

    const startIdx = (match.index + match[0].length) - 1;
    const endIdx = FindUnescapedQuoteRight(line, startIdx + 1);
    if (endIdx === -1) return null;

    const start = new vscode.Position(lineNo, startIdx);
    const end = new vscode.Position(lineNo, endIdx + 1);
    const range = new vscode.Range(start, end);

    const lit = doc.getText(range);
    return DecodeJsonStringLiteral(lit) !== null ? range : null;
}

async function ExtractToTemp(context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;

    let range: vscode.Range | null = null;

    range = FindIgnitionValueLiteralOnLine(doc, editor.selection.active.line);

    if (!range) {
        range = ExpandToJsonStringLiteral(doc, editor.selection.active);
    }

    if (!range) {
        vscode.window.showErrorMessage("No JSON string literal found at cursor/selection.");
        return;
    }

    const rawLiteral = doc.getText(range);

    const decoded = DecodeJsonStringLiteral(rawLiteral);
    if (decoded === null) {
        vscode.window.showErrorMessage("Selection/cursor is not a valid JSON string literal.");
        return;
    }

    const unicodeEscapeMap = BuildUnicodeEscapeMapFromLiteral(rawLiteral);

    const languageId = GuessLanguageIdNearRange(doc, range);

    const storageDir = context.globalStorageUri;
    await vscode.workspace.fs.createDirectory(storageDir);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `ignition-extract-${stamp}`;
    const ext = languageId === "python" ? "py" :    // right now only Python is implemented
                languageId === "javascript" ? "js" :
                languageId === "typescript" ? "ts" :
                languageId === "expression" ? "vba" :
                languageId === "css" ? "css" :
                languageId === "sql" ? "sql" :
                "txt";

    const tempPath = vscode.Uri.joinPath(storageDir, `${baseName}.${ext}`);

    await vscode.workspace.fs.writeFile(tempPath, Buffer.from(decoded, "utf8"));

    TempToLink.set(tempPath.toString(), {
        sourceUri: doc.uri,
        sourceRange: range,
        languageId,
        unicodeEscapeMap
    });

    const tempDoc = await vscode.workspace.openTextDocument(tempPath);
    await vscode.window.showTextDocument(tempDoc, { preview: false });

    await vscode.languages.setTextDocumentLanguage(tempDoc, languageId);

    vscode.window.setStatusBarMessage("Ignition extraction completed. Save (:w) to write changes or run the Replace command.", 5000);

}

async function ReplaceFromTemp() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const tempDoc = editor.document;
    const link = TempToLink.get(tempDoc.uri.toString());
    if (!link) {
        vscode.window.showErrorMessage("Current file is not a tracked temp extract.");
        return;
    }

    await PushTempToSource(tempDoc, link);
    vscode.window.setStatusBarMessage("Ignition JSON string updated.", 3000);
}

async function PushTempToSource(tempDoc: vscode.TextDocument, link: LinkInfo) {
    try {
	    const sourceDoc = await vscode.workspace.openTextDocument(link.sourceUri);

	    const updatedText = tempDoc.getText();
	    let encodedLiteral = EncodeAsJsonStringLiteral(updatedText);
        encodedLiteral = ApplyConservativeEscapePolicy(encodedLiteral);
        encodedLiteral = ApplyUnicodeEscapePolicy(encodedLiteral, link.unicodeEscapeMap);

	    const edit = new vscode.WorkspaceEdit();
	    edit.replace(link.sourceUri, link.sourceRange, encodedLiteral);

	    const ok = await vscode.workspace.applyEdit(edit);
	    if (!ok) {
	        vscode.window.showErrorMessage("Failed to apply edit back to source document.");
	        return;
	    }
    } catch (err) {
        throw err;
    }
}

function DecodeJsonStringLiteral(lit: string): string | null {
    try {
        const v = JSON.parse(lit);
        return typeof v === "string" ? v : null;
    } catch {
        return null;
    }
}

function EncodeAsJsonStringLiteral(text: string): string {
    return JSON.stringify(text);
}

function ExpandToJsonStringLiteral(doc: vscode.TextDocument, pos: vscode.Position): vscode.Range | null {
    const line = doc.lineAt(pos.line).text;
    const idx = pos.character;

    const leftQuote = FindUnescapedQuoteLeft(line, idx);
    if (leftQuote === -1) return null;

    const rightQuote = FindUnescapedQuoteRight(line, Math.max(idx, leftQuote + 1));
    if (rightQuote === -1) return null;

    const start = new vscode.Position(pos.line, leftQuote);
    const end = new vscode.Position(pos.line, rightQuote + 1);
    const range = new vscode.Range(start, end);

    const lit = doc.getText(range);
    return DecodeJsonStringLiteral(lit) !== null ? range : null;
}

function EnsureRangeIsJsonStringLiteral(doc: vscode.TextDocument, range: vscode.Range): vscode.Range | null {
    const text = doc.getText(range).trim();
    if (DecodeJsonStringLiteral(text) !== null) return range;
    const expanded = ExpandToJsonStringLiteral(doc, range.start);
    if (expanded) return expanded;
    return null;
}

function FindUnescapedQuoteLeft(line: string, fromIndex: number): number {
    for (let i = Math.min(fromIndex, line.length - 1); i >= 0; i--) {
        if (line[i] !== '"') continue;
        if (!IsEscaped(line, i)) return i;
    }
    return -1;
}

function FindUnescapedQuoteRight(line: string, fromIndex: number): number {
    for (let i = Math.max(0, fromIndex); i < line.length; i++) {
        if (line[i] !== '"') continue;
        if (!IsEscaped(line, i)) return i;
    }
    return -1;
}

function IsEscaped(line: string, quoteIndex: number): boolean {
    let slashCount = 0;
    for (let i = quoteIndex - 1; i >= 0 && line[i] === '\\'; i--) {
        slashCount++;
    }
    return (slashCount % 2) === 1;
}

function GuessLanguageIdNearRange(doc: vscode.TextDocument, range: vscode.Range): string {
    const line = doc.lineAt(range.start.line).text;
    const before = line.slice(0, range.start.character);

    if (/"script"\s*:\s*$/.test(before) || /"code"\s*:\s*$/.test(before)) {
        return "python";
    }

    if (doc.languageId === "json" || doc.languageId === "jsonc") return "python";
    return "plaintext";
}
