"""Opt-in live capability smoke test using a generated image, never a user photo."""
import asyncio
import io
import base64
from pathlib import Path
from dotenv import load_dotenv
from openai import AsyncOpenAI
from PIL import Image

try:
    from .agent import Settings
except ImportError:
    from agent import Settings

async def main():
    load_dotenv(Path(__file__).with_name('.env'), override=False)
    settings = Settings.from_env()
    if not settings.openai_key or not settings.deepseek_key:
        print('NOT RUN: configure both server-side keys in backend/.env or process environment.')
        return 2
    if settings.deepseek_base_url not in ('https://api.deepseek.com', 'https://api.console.lablup.ai/v1'):
        print('NOT RUN: unsupported DeepSeek provider endpoint.')
        return 2
    buf = io.BytesIO()
    Image.new('RGB', (32, 32), (255, 0, 0)).save(buf, format='PNG')
    encoded = base64.b64encode(buf.getvalue()).decode('ascii')
    all_ok = True
    for provider, key, base, model in [
        ('OpenAI', settings.openai_key, 'https://api.openai.com/v1', settings.openai_model),
        ('DeepSeek', settings.deepseek_key, settings.deepseek_base_url, settings.deepseek_model),
    ]:
        try:
            async with AsyncOpenAI(api_key=key, base_url=base, max_retries=0, timeout=20) as client:
                content = 'Return JSON with one key, status, whose value is ok.'
                if provider == 'OpenAI':
                    content = [{'type': 'text', 'text': 'Describe only the dominant color of this synthetic square in JSON with key color.'}, {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + encoded}}]
                params = {'model': model, 'messages': [{'role': 'user', 'content': content}], 'response_format': {'type': 'json_object'}}
                params['max_completion_tokens' if provider == 'OpenAI' else 'max_tokens'] = 100
                result = await client.chat.completions.create(**params)
                import json
                value = json.loads(result.choices[0].message.content)
                assert result.choices[0].finish_reason == 'stop' and isinstance(value, dict)
                assert 'color' in value if provider == 'OpenAI' else value.get('status') == 'ok'
                print(provider + ': PASS configured model accepted required input and JSON mode.')
        except Exception as error:
            # Only class name; provider messages can contain credentials/request details.
            print(provider + ': FAIL (' + type(error).__name__ + '). Check account, model and billing privately.')
            all_ok = False
    return 0 if all_ok else 1

if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
