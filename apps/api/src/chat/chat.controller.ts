import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async chat(@Body() body: { message: string }) {
    const reply = await this.chatService.chat(body.message);
    return { reply };
  }
}
