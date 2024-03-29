from aiohttp import web

from ...config import config


async def get_limit(_request: web.Request):
    return web.json_response(config.getint("Webserver", "max_upload_size_in_bytes"))
