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

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'loginGithub':
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    return;
            }
        });
    }

    // 👇 NEW: Function to send data to React
    public sendTokenToWebview(token: string) {
        if (this._view) {
            this._view.webview.postMessage({ command: 'authSuccess', token: token });
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
                    if (message.command === 'authSuccess') {
                        // Pass it down to the React App Iframe
                        iframe.contentWindow.postMessage(message, '*');
                    }
                });

                // 2. Listen for Login Request from React
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'loginGithub') {
                        vscode.postMessage(message);
                    }
                });
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {}