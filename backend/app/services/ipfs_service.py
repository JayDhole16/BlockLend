"""
ipfs_service.py
Uploads files to IPFS via:
  1. Local IPFS daemon (http://127.0.0.1:5001) — primary
  2. Pinata cloud API                           — fallback if keys are set
Returns the IPFS CID (v0 hash).
"""
import httpx
from app.config import get_settings

settings = get_settings()

PINATA_UPLOAD_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PINATA_JSON_URL   = "https://api.pinata.cloud/pinning/pinJSONToIPFS"


class IPFSService:

    async def upload_file(self, filename: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        """Upload a file and return its IPFS CID."""
        if settings.PINATA_API_KEY:
            return await self._upload_pinata(filename, content, content_type)
        return await self._upload_local(filename, content, content_type)

    async def upload_json(self, data: dict) -> str:
        """Pin a JSON object and return its IPFS CID."""
        if settings.PINATA_API_KEY:
            return await self._pin_json_pinata(data)
        return await self._pin_json_local(data)

    # ── Local IPFS daemon ─────────────────────────────────────────────────────

    async def _upload_local(self, filename: str, content: bytes, content_type: str) -> str:
        url = f"{settings.IPFS_API_URL}/api/v0/add"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                files={"file": (filename, content, content_type)},
            )
            response.raise_for_status()
            return response.json()["Hash"]

    async def _pin_json_local(self, data: dict) -> str:
        import json
        content = json.dumps(data).encode()
        return await self._upload_local("metadata.json", content, "application/json")

    # ── Pinata ────────────────────────────────────────────────────────────────

    async def _upload_pinata(self, filename: str, content: bytes, content_type: str) -> str:
        headers = {
            "pinata_api_key":        settings.PINATA_API_KEY,
            "pinata_secret_api_key": settings.PINATA_SECRET_KEY,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                PINATA_UPLOAD_URL,
                headers=headers,
                files={"file": (filename, content, content_type)},
            )
            response.raise_for_status()
            return response.json()["IpfsHash"]

    async def _pin_json_pinata(self, data: dict) -> str:
        headers = {
            "pinata_api_key":        settings.PINATA_API_KEY,
            "pinata_secret_api_key": settings.PINATA_SECRET_KEY,
            "Content-Type":          "application/json",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                PINATA_JSON_URL,
                headers=headers,
                json={"pinataContent": data},
            )
            response.raise_for_status()
            return response.json()["IpfsHash"]

    def gateway_url(self, cid: str) -> str:
        return f"https://ipfs.io/ipfs/{cid}"


ipfs_service = IPFSService()
