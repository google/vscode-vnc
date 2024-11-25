// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';
import * as vscode from 'vscode';
import * as ws from 'ws';
import {ClientMessage, ServerMessage} from './webview_shared';

// Represents a local WebSocket server which acts as a protocol proxy between the NoVNC client
// and the KMSVNC server.
// Specify a VNC server port on localhost to construct.
// It listens on an arbitrary unused TCP port on localhost. Read listenPort property to obtain
// the port number actually allocated.
export class WebSocketProxy implements vscode.Disposable {
  private readonly server: ws.WebSocketServer;

  constructor(hostname: string, port: number) {
    this.server = new ws.WebSocketServer({port: 0});
    this.server.on('connection', (downstream: ws.WebSocket) => {
      downstream.binaryType = 'nodebuffer';
      const upstream = net.createConnection(port, hostname);

      upstream.on('error', (err: Error) => {
        console.error(err);
      });
      upstream.on('close', () => {
        downstream.close();
      });
      downstream.on('error', (err: Error) => {
        console.error(err);
      });
      downstream.on('close', () => {
        upstream.destroy();
      });

      upstream.on('connect', () => {
        upstream.on('data', (data: Buffer) => {
          downstream.send(data);
        });
        downstream.on('message', (data: Buffer) => {
          upstream.write(data);
        });
      });
    });
  }

  dispose(): void {
    this.server.close();
  }

  get listenPort(): number {
    return (this.server.address() as ws.AddressInfo).port;
  }
}

// Handles socket operations implemented over VSCode WebView's message passing mechanism.
// Specify a VNC server port on localhost to construct.
export class MessagePassingProxy implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly sockets = new Map<number, net.Socket>();

  constructor(
    private readonly hostname: string,
    private readonly port: number,
    private readonly webview: vscode.Webview
  ) {
    this.subscriptions.push(
      webview.onDidReceiveMessage((message: ClientMessage) =>
        this.onMessage(message)
      )
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
    for (const socket of this.sockets.values()) {
      socket.destroy();
    }
    this.sockets.clear();
  }

  private onMessage(message: ClientMessage): void {
    if (message.type !== 'socket') {
      return;
    }

    const {subtype, socketId} = message;
    switch (subtype) {
      case 'open': {
        const socket = net.createConnection(this.port, this.hostname);
        this.sockets.set(socketId, socket);
        socket.on('connect', () => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'open',
            socketId,
          });
        });
        socket.on('error', (err: Error) => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'error',
            socketId,
            reason: err.message,
          });
        });
        socket.on('data', (data: Buffer) => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'data',
            socketId,
            data: data.toString('base64'),
          });
        });
        socket.on('close', () => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'close',
            socketId,
          });
        });
        break;
      }

      case 'close': {
        const socket = this.sockets.get(socketId);
        if (!socket) {
          break;
        }
        socket.destroy();
        this.sockets.delete(socketId);
        break;
      }

      case 'data': {
        const socket = this.sockets.get(socketId);
        if (!socket) {
          break;
        }
        socket.write(Buffer.from(message.data, 'base64'));
        break;
      }
    }
  }
}

// Type-safe wrapper of vscode.postMessage().
export async function postServerMessage(
  webview: vscode.Webview,
  message: ServerMessage
): Promise<void> {
  await webview.postMessage(message);
}
