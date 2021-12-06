import type { EventListener } from "./util.ts";

interface BaseIncomingMessage {
  "_channel": string;
  "_channel_param": string;
  "_ws_type": string;
}

interface ServerBroadcastMessage extends BaseIncomingMessage {
  "_ws_type": "server_broadcast";
  [key: string]: unknown;
}

interface JoinResultMessage extends BaseIncomingMessage {
  "_ws_type": "join_result";
  "client_number": number;
  "welcome_message": string;
}

interface ExclusiveKickoffMessage extends BaseIncomingMessage {
  "_ws_type": "exclusive_kickoff";
  [key: string]: unknown;
}

interface HeartbeatMessage extends BaseIncomingMessage {
  "_ws_type": "heartbeat";
  "client_number": number;
}

type IncomingMessage =
  | ServerBroadcastMessage
  | JoinResultMessage
  | ExclusiveKickoffMessage
  | HeartbeatMessage;

interface BaseOutgoingMessage {
  "channel": string;
  "channel_param": string;
  "type": string;
}

interface DataMessage extends BaseOutgoingMessage {
  "type": "data";
  "data": unknown;
}

interface JoinChannelMessage extends BaseOutgoingMessage {
  "type": "join_channel";
  "exclusive_key": string;
}

interface DisconnectChannelMessage extends BaseOutgoingMessage {
  "type": "disconnect_channel";
  "exclusive_key": string;
}

type OutgoingMessage =
  | DataMessage
  | JoinChannelMessage
  | DisconnectChannelMessage;

interface LuoguSocketChannelEventMap {
  open: Event;
  message: MessageEvent<ServerBroadcastMessage | ExclusiveKickoffMessage>;
  close: Event;
  error: Event;
}

interface LuoguSocketChannel extends EventTarget {
  addEventListener<K extends keyof LuoguSocketChannelEventMap>(
    type: K,
    listener: EventListener<LuoguSocketChannel, LuoguSocketChannelEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListener<LuoguSocketChannel, Event>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof LuoguSocketChannelEventMap>(
    type: K,
    listener: EventListener<LuoguSocketChannel, LuoguSocketChannelEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener<LuoguSocketChannel, Event>,
    options?: boolean | EventListenerOptions,
  ): void;
}

class LuoguSocketChannel extends EventTarget {
  readonly socket: LuoguSocket;
  readonly channel: string;
  readonly param: string;
  readonly exclusiveKey: string;
  #timeout: number;

  constructor(
    socket: LuoguSocket,
    channel: string,
    param: string,
    exclusiveKey: string,
  ) {
    super();
    this.socket = socket;
    this.channel = channel;
    this.param = param;
    this.exclusiveKey = exclusiveKey;
    socket.send({
      "type": "join_channel",
      "channel": this.channel,
      "channel_param": this.param,
      "exclusive_key": this.exclusiveKey,
    });
    socket.addEventListener("message", this.#message);
    socket.addEventListener("close", this.#close);
    socket.addEventListener("error", this.#error);
    this.#timeout = setTimeout(this.#error, 5000);
  }

  send(obj: unknown): void {
    this.socket.send({
      "type": "data",
      "channel": this.channel,
      "channel_param": this.param,
      "data": obj,
    });
  }

  close(): void {
    this.dispatchEvent(new Event("close"));
    clearTimeout(this.#timeout);
    const socket = this.socket;
    socket.removeEventListener("message", this.#message);
    socket.removeEventListener("close", this.#close);
    socket.removeEventListener("error", this.#error);
    try {
      socket.send({
        "type": "disconnect_channel",
        "channel": this.channel,
        "channel_param": this.param,
        "exclusive_key": this.exclusiveKey,
      });
    } catch {
      // ignored
    }
  }

  #heartbeat(): void {
    clearTimeout(this.#timeout);
    this.#timeout = setTimeout(this.#error, 120000);
  }

  #message = (event: MessageEvent<IncomingMessage>) => {
    const message = event.data;
    switch (message._ws_type) {
      case "server_broadcast":
      case "exclusive_kickoff":
        this.dispatchEvent(new MessageEvent("message", { data: message }));
        break;
      case "join_result":
        this.dispatchEvent(new Event("open"));
        this.#heartbeat();
        break;
      case "heartbeat":
        this.#heartbeat();
        break;
    }
  };

  #close = () => {
    this.close();
  };

  #error = () => {
    this.dispatchEvent(new Event("error"));
    this.#close();
  };
}

interface LuoguSocketEventMap {
  open: Event;
  message: MessageEvent<IncomingMessage>;
  close: CloseEvent;
  error: Event;
}

export interface LuoguSocket extends EventTarget {
  addEventListener<K extends keyof LuoguSocketEventMap>(
    type: K,
    listener: EventListener<LuoguSocket, LuoguSocketEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListener<LuoguSocket, Event>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof LuoguSocketEventMap>(
    type: K,
    listener: EventListener<LuoguSocket, LuoguSocketEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener<LuoguSocket, Event>,
    options?: boolean | EventListenerOptions,
  ): void;
}

export class LuoguSocket extends EventTarget {
  readonly #ws: WebSocket;

  constructor(url = "wss://ws.luogu.com.cn/ws") {
    super();
    const ws = this.#ws = new WebSocket(url);
    ws.addEventListener(
      "open",
      (event) => this.dispatchEvent(new Event("open", event)),
    );
    ws.addEventListener("message", (event) => {
      let message: IncomingMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.dispatchEvent(new MessageEvent("message", { data: message }));
    });
    ws.addEventListener(
      "close",
      (event) => this.dispatchEvent(new CloseEvent("close", event)),
    );
    ws.addEventListener(
      "error",
      (event) => this.dispatchEvent(new Event("error", event)),
    );
  }

  get url(): string {
    return this.#ws.url;
  }

  channel(channel: string, param = "", exclusiveKey = ""): LuoguSocketChannel {
    return new LuoguSocketChannel(this, channel, param, exclusiveKey);
  }

  send(message: OutgoingMessage): void {
    this.#ws.send(JSON.stringify(message));
  }

  close(): void {
    this.#ws.close();
  }
}
