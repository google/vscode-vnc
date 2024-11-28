// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {ProxyProtocol, VncSession} from '../session';
import * as webviewShared from '../webview_shared';
import {activateExtension} from './extension_testing';
import {FakeVncServer} from './fake_vnc_server';

function waitConnectEvent(session: VncSession): Promise<void> {
  return new Promise<void>(resolve => {
    const subscription = session.onDidReceiveMessage(
      (message: webviewShared.ClientMessage) => {
        if (message.type === 'event' && message.subtype === 'connect') {
          subscription.dispose();
          resolve();
        }
      }
    );
  });
}

describe('VNC session', () => {
  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions).dispose();
    subscriptions.splice(0);
  });

  it('can connect to a server', async () => {
    const api = await activateExtension();

    // Start a fake VNC server.
    const server = new FakeVncServer();
    subscriptions.push(server);
    await server.listen();

    // Prepare a VNC session.
    const session = new VncSession('localhost', server.listenPort, api.context);
    subscriptions.push(session);

    const didConnect = waitConnectEvent(session);

    // Start a VNC session.
    await session.start();

    // Ensure a successful connection event.
    await didConnect;
  });

  it('can connect to a server with message passing protocol', async () => {
    const api = await activateExtension();

    // Start a fake VNC server.
    const server = new FakeVncServer();
    subscriptions.push(server);
    await server.listen();

    // Prepare a VNC session.
    const session = new VncSession(
      'localhost',
      server.listenPort,
      api.context,
      ProxyProtocol.MESSAGE_PASSING // force message passing protocol
    );
    subscriptions.push(session);

    const didConnect = waitConnectEvent(session);

    // Start a VNC session.
    await session.start();

    // Ensure a successful connection event.
    await didConnect;
  });
});
