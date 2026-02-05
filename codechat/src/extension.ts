import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codeChat.view', provider)
    );

    // 👇 NEW: Handle the Deep Link (vscode://publisher.extension/auth?token=...)
    context.subscriptions.push(
        vscode.window.registerUriHandler({
            handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
                if (uri.path === '/auth') {
                    const query = new URLSearchParams(uri.query);
                    const token = query.get('token');
                    
                    if (token) {
                        // Send the token DOWN to the React App
                        provider.sendTokenToWebview(token);
                        vscode.window.showInformationMessage('Login Successful! Welcome back.');
                    }
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection((event) => {
            const editor = event.textEditor;
            if (!editor || !editor.document) return;
            const selection = editor.selection;
            if (selection.isEmpty) return;

            const text = editor.document.getText(selection);
            const filePath = editor.document.uri.fsPath;
            const lineStart = selection.start.line + 1;
            const lineEnd = selection.end.line + 1;

            provider.sendMessageToWebview({
                command: "selectionChanged",
                text,
                filePath,
                lineStart,
                lineEnd
            });
        })
    );
}

class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView; // Store reference to view

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView; // Save reference

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'loginGithub':
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    return;
                case 'openFile': {
                    if (!message.path) return;
                    const doc = await vscode.workspace.openTextDocument(message.path);
                    const editor = await vscode.window.showTextDocument(doc, {
                        preview: false,
                        viewColumn: vscode.ViewColumn.Beside
                    });
                    if (message.lineStart && message.lineEnd) {
                        const start = new vscode.Position(message.lineStart - 1, 0);
                        const end = new vscode.Position(message.lineEnd - 1, 0);
                        const range = new vscode.Range(start, end);
                        editor.selection = new vscode.Selection(start, end);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    }
                    return;
                }
            }
        });
    }

    // 👇 NEW: Function to send data to React
    public sendTokenToWebview(token: string) {
        if (this._view) {
            this._view.webview.postMessage({ command: 'authSuccess', token: token });
        }
    }

    public sendMessageToWebview(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // ... (Keep your HTML exactly as it was in the previous step) ...
        // Ensure the <script> part is still there!
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Chat</title>
            <style>
                body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background-color: #1e1e1e; }
                iframe { width: 100%; height: 100%; border: none; }
            </style>
        </head>
        <body>
            <iframe src="http://localhost:5173" id="app-frame"></iframe>
            <script>
                const vscode = acquireVsCodeApi();
                const iframe = document.getElementById('app-frame');

                // 1. Listen for Token from VS Code Extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    iframe.contentWindow.postMessage(message, '*');
                });

                // 2. Listen for Login Request from React
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message && message.command) {
                        vscode.postMessage(message);
                    }
                });
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {}
