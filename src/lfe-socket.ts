/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "events";
import * as WebSocket from "ws";

export default class Socket extends EventEmitter {
  private ws!: WebSocket;

  public constructor(public readonly url = "wss://ws.luogu.com.cn/ws") {
    super();
    this.onMessage = this.onMessage.bind(this);
    this.connect();
  }

  public connect(): this {
    if (this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) throw new Error("socket is already open");
      this.ws.removeAllListeners();
    }
    this.ws = new WebSocket(this.url)
      .on("message", this.onMessage)
      .once("open", this.emit.bind(this, "open"))
      .once("close", this.emit.bind(this, "close"));
    return this;
  }

  public close(): void {
    this.ws.close();
  }

  public send(data: string): this {
    this.ws.send(data);
    return this;
  }

  public sendJSON(obj: any): this {
    this.send(JSON.stringify(obj));
    return this;
  }

  public sendData(channel: string, param: string, obj: any): this {
    this.sendJSON({
      "type": "data",
      "channel": channel,
      "channel_param": param,
      "data": obj
    });
    return this;
  }

  public joinChannel(channel: string, param: string, exclusiveKey = ""): this {
    this.sendJSON({
      "type": "join_channel",
      "channel": channel,
      "channel_param": param,
      "exclusive_key": exclusiveKey
    });
    return this;
  }

  public quitChannel(channel: string, param: string, exclusiveKey = ""): this {
    this.sendJSON({
      "type": "disconnect_channel",
      "channel": channel,
      "channel_param": param,
      "exclusive_key": exclusiveKey
    });
    return this;
  }

  private onMessage(data: any): void {
    const obj = JSON.parse(data.toString());
    const channel = obj._channel;
    const param = obj._channel_param;
    switch (obj._ws_type) {
      case "join_result":
        this.emit(`connect.${channel}.${param}`, obj?.welcome_message);
        break;
      case "server_broadcast":
        this.emit(`message.${channel}.${param}`, obj);
        break;
      case "exclusive_kickoff":
        this.emit(`exclusive_kickoff.${channel}.${param}`, obj);
        break;
    }
  }
}
