/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket = require("ws");
import { EventEmitter } from "events";

export default class Socket extends EventEmitter {
  private ws: WebSocket | undefined;

  public constructor(url?: string) {
    super();
    this.onMessage = this.onMessage.bind(this);
    if (url) this.connect(url);
  }

  public connect(url: string, noEmit = false): this {
    this.close(true);
    const reconnect = this.connect.bind(this, url, true);
    const ws = new WebSocket(url)
      .on("message", this.onMessage)
      .once("open", () => {
        this.ws = ws;
        if (!noEmit) this.emit("open");
      })
      .once("close", reconnect)
      .once("error", reconnect);
    return this;
  }

  public close(noEmit = false): void {
    if (!this.ws) return;
    this.ws
      .removeAllListeners()
      .once("close", () => {
        if (!noEmit) this.emit("close");
      })
      .close();
    this.ws = undefined;
  }

  public send(data: string): this {
    if (!this.ws) throw new Error("socket is not open");
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
