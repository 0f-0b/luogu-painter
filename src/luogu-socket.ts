import { EventEmitter } from "events";
import { debuglog } from "util";
import * as WebSocket from "ws";

const debug = debuglog("luogu-socket");

interface BaseIncomingMessage {
  _channel: string;
  _channel_param: string;
}

export interface IncomingDataMessage extends BaseIncomingMessage {
  _ws_type: "server_broadcast";
  [key: string]: unknown;
}

export interface JoinResultMessage extends BaseIncomingMessage {
  _ws_type: "join_result";
  client_number: number;
  welcome_message: string;
}

export interface KickMessage extends BaseIncomingMessage {
  _ws_type: "exclusive_kickoff";
  [key: string]: unknown;
}

export interface HeartbeatMessage extends BaseIncomingMessage {
  _ws_type: "heartbeat";
  client_number: number;
}

export type IncomingMessage =
  | IncomingDataMessage
  | JoinResultMessage
  | KickMessage
  | HeartbeatMessage;

interface BaseOutgoingMessage {
  channel: string;
  channel_param: string;
}

export interface OutgoingDataMessage extends BaseOutgoingMessage {
  type: "data";
  data: unknown;
}

export interface JoinChannelMessage extends BaseOutgoingMessage {
  type: "join_channel";
  exclusive_key: string;
}

export interface QuitChannelMessage extends BaseOutgoingMessage {
  type: "disconnect_channel";
  exclusive_key: string;
}

export type OutgoingMessage =
  | OutgoingDataMessage
  | JoinChannelMessage
  | QuitChannelMessage;

class Channel extends EventEmitter {
  private _joinTimeout!: NodeJS.Timeout;

  public constructor(public readonly socket: Socket, public readonly channel: string, public readonly param: string, public readonly exclusiveKey = "") {
    super();
    socket.on("message", this._onMessage);
    this._join();
  }

  private _join() {
    this.socket._send({
      "type": "join_channel",
      "channel": this.channel,
      "channel_param": this.param,
      "exclusive_key": this.exclusiveKey
    });
    this._joinTimeout = setTimeout(() => this._join(), 1000);
  }

  public send(obj: unknown): void {
    this.socket._send({
      "type": "data",
      "channel": this.channel,
      "channel_param": this.param,
      "data": obj
    });
  }

  public quit(): void {
    this.socket.removeListener("message", this._onMessage)._send({
      "type": "disconnect_channel",
      "channel": this.channel,
      "channel_param": this.param,
      "exclusive_key": this.exclusiveKey
    });
    this.emit("quit");
  }

  private _onMessage = (message: IncomingMessage) => {
    if (message._channel !== this.channel || message._channel_param !== this.param)
      return;
    switch (message._ws_type) {
      case "server_broadcast":
        this.emit("message", message);
        break;
      case "join_result":
        this.emit("join", message.welcome_message);
        clearTimeout(this._joinTimeout);
        break;
      case "exclusive_kickoff":
        this.emit("kick", message);
        break;
    }
  };
}

export class Socket extends EventEmitter {
  private _ws!: WebSocket;
  private _pingTimeout!: NodeJS.Timeout;

  public constructor(public readonly url: string) {
    super();
    this.connect();
  }

  public connect(): void {
    if ([WebSocket.CONNECTING, WebSocket.OPEN].includes(this._ws?.readyState))
      throw new Error("Socket is already open");
    this._ws = new WebSocket(this.url)
      .on("open", () => {
        this.emit("open");
        this._heartbeat();
      })
      .on("pong", () => {
        clearTimeout(this._pingTimeout);
        this._heartbeat();
      })
      .on("message", data => {
        const message = JSON.parse(String(data)) as IncomingMessage;
        debug("↓ %o", message);
        this.emit("message", message);
      })
      .on("close", (code, reason) => {
        clearTimeout(this._pingTimeout);
        if (code <= 1000 || code >= 2000) {
          debug("✗ (%d)", code, reason);
          this.emit("close", code, reason);
        } else {
          debug("↺ (%d)", code, reason);
          this.emit("reconnect", code, reason);
          this.connect();
        }
      })
      .on("error", () => this._ws.terminate());
  }

  public channel(channel: string, param = "", exclusiveKey = ""): Channel {
    return new Channel(this, channel, param, exclusiveKey);
  }

  public close(): void {
    this._ws.close();
  }

  public _send(message: OutgoingMessage): void {
    debug("↑ %o", message);
    this._ws.send(JSON.stringify(message));
  }

  private _heartbeat(): void {
    this._pingTimeout = setTimeout(() => {
      this._ws.ping();
      this._pingTimeout = setTimeout(() => this._ws.terminate(), 1000);
    }, 10000);
  }
}
