import { Controller, Get, Header } from '@nestjs/common';

@Controller('playground')
export class PlaygroundController {
  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  render() {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CRM AI Chatbot Playground</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; margin: 0; background: #f6f7f9; color: #17202a; }
      main { max-width: 880px; margin: 32px auto; padding: 0 16px; }
      h1 { font-size: 24px; margin: 0 0 18px; }
      form, .response { background: white; border: 1px solid #dde2ea; border-radius: 8px; padding: 18px; }
      label { display: block; font-size: 13px; font-weight: 700; margin: 12px 0 6px; }
      input, textarea { width: 100%; box-sizing: border-box; border: 1px solid #cfd6e1; border-radius: 6px; padding: 10px; font-size: 14px; }
      textarea { min-height: 92px; resize: vertical; }
      button { margin-top: 14px; border: 0; border-radius: 6px; padding: 10px 14px; background: #1646a3; color: white; font-weight: 700; cursor: pointer; }
      pre { white-space: pre-wrap; word-break: break-word; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .response { margin-top: 16px; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>CRM AI Chatbot Playground</h1>
      <form id="chat-form">
        <div class="grid">
          <div>
            <label>Tenant</label>
            <input name="tenantId" value="astronacci" required />
          </div>
          <div>
            <label>Channel</label>
            <input name="channel" value="whatsapp" required />
          </div>
          <div>
            <label>Customer ID</label>
            <input name="customerId" placeholder="628xxxx" required />
          </div>
        </div>
        <label>AI Service Key</label>
        <input name="serviceKey" type="password" placeholder="Optional on local development" />
        <label>Message</label>
        <textarea name="message" placeholder="Tulis pertanyaan customer..." required></textarea>
        <button type="submit">Ask AI</button>
      </form>
      <section class="response">
        <pre id="output">Response will appear here.</pre>
      </section>
    </main>
    <script>
      const form = document.getElementById('chat-form');
      const output = document.getElementById('output');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        output.textContent = 'Loading...';
        const data = Object.fromEntries(new FormData(form).entries());
        const serviceKey = data.serviceKey;
        delete data.serviceKey;
        const response = await fetch('/v1/chat/respond', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(serviceKey ? { 'x-ai-service-key': serviceKey } : {}),
          },
          body: JSON.stringify(data),
        });
        const json = await response.json();
        output.textContent = JSON.stringify(json, null, 2);
      });
    </script>
  </body>
</html>`;
  }
}
