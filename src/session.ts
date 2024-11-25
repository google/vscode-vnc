// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {MessagePassingProxy, postServerMessage, WebSocketProxy} from './proxy';
import {replaceAll} from './util';
import {ClientMessage, MESSAGE_PASSING_URL} from './webview_shared';

/**
 * Represents a protocol used between the WebView and localhost.
 */
export enum ProxyProtocol {
  WEBSOCKET,
  MESSAGE_PASSING,
}

/**
 * Represents a VNC session.
 *
 * It manages UI resources associated to a VNC session, such as a vscode.WebViewPanel to render
 * NoVNC UI on.
 *
 * It also manages a proxy to allow the WebView to connect to the VNC server. There are two kinds
 * of proxies used:
 *
 * - WebSocketProxy: Starts a local WebSocket server that proxies communication between the WebView
 *    client and the VNC server. This proxy is used when the WebView can connect to the localhost,
 *    possibly with port forwarding in the case of remote development.
 * - MessagePassingProxy: Starts a in-process server that implements a socket over the WebView's
 *    message passing mechanism. This proxy is used when the WebView can NOT connect to the
 *    localhost, e.g. when the editor is running within a web browser.
 *
 * The WebView is initially empty. Call start() to start WebView, possibly after subscribing to
 * some events.
 *
 * Call dispose() to destroy the session programmatically. It is also called when the user closes
 * the WebView panel.
 */
export class VncSession implements vscode.Disposable {
  // This CancellationToken is cancelled on disposal of this session.
  private readonly canceller = new vscode.CancellationTokenSource();

  private readonly panel: vscode.WebviewPanel;
  private readonly proxy: WebSocketProxy | MessagePassingProxy;

  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  private readonly onDidReceiveMessageEmitter =
    new vscode.EventEmitter<ClientMessage>();
  readonly onDidReceiveMessage = this.onDidReceiveMessageEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    // onDidDisposeEmitter is not listed here so we can fire it after disposing everything else.
    this.canceller,
    this.onDidReceiveMessageEmitter,
  ];

  constructor(
    hostname: string,
    port: number,
    private readonly context: vscode.ExtensionContext,
    proxyProtocol?: ProxyProtocol
  ) {
    this.panel = VncSession.createWebview(hostname);
    switch (proxyProtocol ?? detectProxyProtocol()) {
      case ProxyProtocol.WEBSOCKET:
        this.proxy = new WebSocketProxy(hostname, port);
        break;
      case ProxyProtocol.MESSAGE_PASSING:
        this.proxy = new MessagePassingProxy(
          hostname,
          port,
          this.panel.webview
        );
        break;
    }
    this.subscriptions.push(this.panel, this.proxy);

    this.subscriptions.push(
      this.panel.webview.onDidReceiveMessage((message: ClientMessage) => {
        this.onDidReceiveMessageEmitter.fire(message);
      })
    );

    // Dispose the session when the panel is closed.
    this.subscriptions.push(
      this.panel.onDidDispose(() => {
        this.dispose();
      })
    );
  }

  async start(): Promise<void> {
    const webviewReady = VncSession.waitWebviewReady(this.panel.webview);
    await VncSession.startWebview(this.panel.webview, this.proxy, this.context);
    await webviewReady;
    await postServerMessage(this.panel.webview, {
      type: 'event',
      subtype: 'ready',
    });
  }

  dispose(): void {
    this.canceller.cancel();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.onDidDisposeEmitter.fire();
    this.onDidDisposeEmitter.dispose();
  }

  revealPanel(): void {
    this.panel.reveal();
  }

  private static createWebview(hostname: string): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
      'vnc',
      `VNC: ${hostname}`,
      vscode.ViewColumn.One,
      {
        // Scripting is needed to run NoVNC.
        enableScripts: true,
        // Retain the content even if the tab is not visible.
        // https://code.visualstudio.com/api/extension-guides/webview#retaincontextwhenhidden
        retainContextWhenHidden: true,
      }
    );
  }

  private static async waitWebviewReady(
    webview: vscode.Webview
  ): Promise<void> {
    return new Promise(resolve => {
      const subscription = webview.onDidReceiveMessage(
        (message: ClientMessage) => {
          const {type, subtype} = message;
          if (type === 'event' && subtype === 'ready') {
            subscription.dispose();
            resolve();
          }
        }
      );
    });
  }

  private static async startWebview(
    webview: vscode.Webview,
    proxy: WebSocketProxy | MessagePassingProxy,
    context: vscode.ExtensionContext
  ): Promise<void> {
    let proxyUrl: string;
    if (proxy instanceof MessagePassingProxy) {
      proxyUrl = MESSAGE_PASSING_URL;
    } else {
      // Call asExternalUri with http:// URL to set up port forwarding
      // in the case of remote development.
      // https://code.visualstudio.com/api/advanced-topics/remote-extensions#option-1-use-asexternaluri
      const proxyHttpUrl = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://localhost:${proxy.listenPort}/`)
      );
      proxyUrl = proxyHttpUrl.with({scheme: 'ws'}).toString();
    }
    webview.html = VncSession.getWebviewContent(webview, proxyUrl, context);
  }

  private static getWebviewContent(
    webview: vscode.Webview,
    proxyUrl: string,
    context: vscode.ExtensionContext
  ): string {
    const filePath = path.join(
      context.extensionPath,
      'dist/webview/static/vnc.html'
    );
    const html = fs.readFileSync(filePath, {encoding: 'utf-8'});
    // NOTE: No need to escape URLs for HTML attributes since vscode.Uri.toString() is aggressive
    // on escaping special characters.
    return replaceAll(html, [
      {
        from: /%EXTENSION_ROOT_URL%/g,
        to: webview.asWebviewUri(context.extensionUri).toString(),
      },
      {
        from: /%WEB_SOCKET_PROXY_URL%/g,
        to: proxyUrl,
      },
    ]);
  }
}

function detectProxyProtocol(): ProxyProtocol {
  // Prefer WebSocket protocol as it's more efficient.
  if (vscode.env.appHost === 'desktop') {
    return ProxyProtocol.WEBSOCKET;
  }
  // In other cases, fall back to the message passing protocol.
  return ProxyProtocol.MESSAGE_PASSING;
}
