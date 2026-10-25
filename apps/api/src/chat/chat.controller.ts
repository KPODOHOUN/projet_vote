import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Le widget ne s'affiche que si l'assistant est configuré. */
  @Get("status")
  status() {
    return { enabled: this.chatService.isEnabled() };
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async chat(@Body() body: unknown, @Ip() ip: string) {
    const reply = await this.chatService.chat(body, ip);
    return { reply };
  }
}
